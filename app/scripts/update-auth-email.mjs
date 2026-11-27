import readline from "node:readline/promises";
import { Writable } from "node:stream";
import { stdin, stdout } from "node:process";
import { createClient } from "@supabase/supabase-js";

const mutedOutput = new Writable({
  write(chunk, encoding, callback) {
    if (!mutedOutput.muted) stdout.write(chunk, encoding);
    callback();
  },
});
mutedOutput.muted = false;

const prompts = readline.createInterface({
  input: stdin,
  output: mutedOutput,
  terminal: true,
});

async function ask(label, { hidden = false } = {}) {
  if (!hidden) return (await prompts.question(label)).trim();

  stdout.write(label);
  mutedOutput.muted = true;
  try {
    return (await prompts.question("")).trim();
  } finally {
    mutedOutput.muted = false;
    stdout.write("\n");
  }
}

function required(value, label) {
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function normalizedEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("Enter a valid email address.");
  }
  return email;
}

function normalizedSupabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid Supabase project or dashboard URL.");
  }

  const dashboardProject = url.pathname.match(
    /^\/dashboard\/project\/([a-z0-9]+)(?:\/|$)/i
  );
  if (url.hostname === "supabase.com" && dashboardProject) {
    return `https://${dashboardProject[1]}.supabase.co`;
  }
  if (url.protocol === "https:" && url.hostname.endsWith(".supabase.co")) {
    return url.origin;
  }
  throw new Error(
    "Enter a Supabase project API URL or its dashboard project URL."
  );
}

async function findUserByEmail(admin, email) {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const users = data?.users || [];
    const match = users.find(
      (user) => user.email?.trim().toLowerCase() === email
    );
    if (match) return match;
    if (users.length < perPage) return null;
  }
}

async function main() {
  const supabaseUrl = normalizedSupabaseUrl(
    required(
      process.env.SUPABASE_URL?.trim() ||
        process.env.VITE_SUPABASE_URL?.trim() ||
        (await ask("Supabase project or dashboard URL: ")),
      "Supabase project URL"
    )
  );
  const serviceRoleKey = required(
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
      (await ask("Service-role key (hidden): ", { hidden: true })),
    "Service-role key"
  );
  const userId = required(
    process.env.SUPABASE_USER_ID?.trim() ||
      (await ask("Original GitHub-backed user UUID: ")),
    "User UUID"
  );
  const newEmail = normalizedEmail(
    process.env.SUPABASE_NEW_EMAIL?.trim() ||
      (await ask("Figma account email: "))
  );

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: originalData, error: originalError } =
    await admin.auth.admin.getUserById(userId);
  if (originalError) throw originalError;
  const original = originalData?.user;
  if (!original) throw new Error(`No Auth user exists with UUID ${userId}.`);

  const providers = original.app_metadata?.providers || [];
  if (!providers.includes("github")) {
    throw new Error(
      `User ${userId} is not linked to GitHub; refusing to update it.`
    );
  }

  if (original.email?.trim().toLowerCase() === newEmail) {
    console.log(`User ${userId} already uses ${newEmail}. No change needed.`);
    return;
  }

  const collision = await findUserByEmail(admin, newEmail);
  if (collision && collision.id !== userId) {
    const { count, error: countError } = await admin
      .from("shaders")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", collision.id);
    if (countError) throw countError;

    throw new Error(
      [
        `The target email already belongs to Auth user ${collision.id}.`,
        `That user owns ${count ?? "an unknown number of"} shader(s).`,
        "Verify and delete the duplicate Figma user in Supabase, then rerun this script.",
      ].join("\n")
    );
  }

  console.log("");
  console.log(`User:  ${userId}`);
  console.log(`From:  ${original.email || "(no email)"}`);
  console.log(`To:    ${newEmail}`);
  const confirmation = await ask('Type "UPDATE" to apply this change: ');
  if (confirmation !== "UPDATE") {
    console.log("Cancelled without making changes.");
    return;
  }

  const { data: updatedData, error: updateError } =
    await admin.auth.admin.updateUserById(userId, {
      email: newEmail,
      email_confirm: true,
    });
  if (updateError) throw updateError;

  console.log(
    `Updated ${updatedData.user.id} to ${updatedData.user.email}. You can now sign in with Figma.`
  );
}

try {
  await main();
} catch (error) {
  console.error(`\nEmail update failed: ${error.message || String(error)}`);
  process.exitCode = 1;
} finally {
  prompts.close();
}
