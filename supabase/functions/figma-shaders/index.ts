/**
 * Proxy for Figma custom shader library reads.
 *
 * Figma REST (api.figma.com/v1) does not expose shader source list/get yet.
 * This function talks to the official Figma MCP HTTP endpoint with the caller's
 * token, mirroring list_shader_* / get_shader_* + resources/read.
 *
 * Write ops stay 501 until Figma ships create/update.
 */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-figma-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MCP_URL =
  Deno.env.get("FIGMA_MCP_URL") || "https://mcp.staging.figma.com/mcp";
const FIGMA_OAUTH_AUTHORIZE =
  Deno.env.get("FIGMA_OAUTH_AUTHORIZE_URL") ||
  "https://staging.figma.com/oauth/mcp";
const FIGMA_OAUTH_TOKEN =
  Deno.env.get("FIGMA_OAUTH_TOKEN_URL") ||
  "https://api.staging.figma.com/v1/oauth/token";
const FIGMA_MCP_SCOPE = "mcp:connect";
const DEFAULT_REDIRECT_URIS = [
  "https://shader-studio.pages.dev/figma/oauth/callback",
  "http://localhost:5173/figma/oauth/callback",
];

type ShaderKind = "effect" | "fill";
type Op =
  | "list"
  | "get"
  | "test"
  | "plans"
  | "create"
  | "update"
  | "oauth-authorize"
  | "oauth-exchange"
  | "oauth-refresh";

type RequestBody = {
  op?: Op;
  kind?: ShaderKind;
  id?: string;
  version?: string;
  cursor?: string;
  token?: string;
  redirectUri?: string;
  state?: string;
  codeChallenge?: string;
  code?: string;
  codeVerifier?: string;
  refreshToken?: string;
  intent?: string;
  name?: string;
  description?: string;
  planKey?: string;
  mainTs?: string;
  commitMessage?: string;
};

type OAuthIntent = "signin" | "connect";

type FigmaIdentity = {
  email: string;
  handle?: string;
  name?: string;
  avatarUrl?: string;
  figmaUserId?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function readToken(req: Request, body: RequestBody): string {
  const header = req.headers.get("x-figma-token")?.trim() || "";
  const fromBody = typeof body.token === "string" ? body.token.trim() : "";
  const fromEnv = Deno.env.get("FIGMA_ACCESS_TOKEN")?.trim() || "";
  return header || fromBody || fromEnv;
}

function listTool(kind: ShaderKind): string {
  return kind === "fill" ? "list_shader_fills" : "list_shader_effects";
}

function getTool(kind: ShaderKind): string {
  return kind === "fill" ? "get_shader_fill" : "get_shader_effect";
}

function oauthCredentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get("FIGMA_OAUTH_CLIENT_ID")?.trim() || "";
  const clientSecret = Deno.env.get("FIGMA_OAUTH_CLIENT_SECRET")?.trim() || "";
  if (!clientId || !clientSecret) {
    throw Object.assign(
      new Error("Figma OAuth is not configured on the server."),
      { code: "figma_oauth_not_configured", status: 503 },
    );
  }
  return { clientId, clientSecret };
}

function allowedRedirectUris(): string[] {
  const configured = Deno.env.get("FIGMA_OAUTH_REDIRECT_URIS")
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured?.length ? configured : DEFAULT_REDIRECT_URIS;
}

function readIntent(value?: string): OAuthIntent {
  return value === "signin" ? "signin" : "connect";
}

function oauthScope(_intent: OAuthIntent): string {
  // Both connect and sign-in use the MCP token; identity comes from the MCP
  // `whoami` tool, so no extra REST scope is required.
  return FIGMA_MCP_SCOPE;
}

function isFigmaEmail(email: string): boolean {
  return /^[^@]+@figma\.com$/i.test(email.trim());
}

function stringField(
  value: unknown,
  ...keys: string[]
): string | undefined {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of keys) {
      const next = record[key];
      if (typeof next === "string" && next.trim()) return next.trim();
    }
  }
  return undefined;
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const padded = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
    const claims = JSON.parse(json);
    return claims && typeof claims === "object"
      ? claims as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function identityFromPayload(
  payload: Record<string, unknown>,
  fallbackUserId?: string,
): FigmaIdentity | null {
  const email = stringField(payload, "email") ||
    stringField(payload.user, "email");
  if (!email) return null;
  return {
    email,
    handle: stringField(payload, "handle", "username") ||
      stringField(payload.user, "handle", "username"),
    name: stringField(payload, "name", "handle") ||
      stringField(payload.user, "name", "handle"),
    avatarUrl: stringField(payload, "img_url", "avatar_url", "picture") ||
      stringField(payload.user, "img_url", "avatar_url", "picture"),
    figmaUserId: stringField(payload, "id", "user_id", "user_id_string") ||
      stringField(payload.user, "id") ||
      fallbackUserId,
  };
}

async function fetchFigmaIdentity(
  accessToken: string,
  fallbackUserId?: string,
): Promise<FigmaIdentity> {
  // The sign-in token is an MCP token (audience-bound to the MCP server), so it
  // cannot call the Figma REST API. The MCP `whoami` tool returns the same
  // identity (handle, email) using the token we already hold.
  let lastError = "";
  try {
    const client = new McpClient(accessToken);
    const result = await client.callTool("whoami");
    const payload = extractToolPayload(result);
    const identity = identityFromPayload(payload, fallbackUserId);
    if (identity) return identity;
    lastError = "Figma whoami did not include an email address.";
  } catch (error) {
    lastError = (error as { message?: string })?.message ||
      "Figma whoami request failed.";
  }

  const fromJwt = identityFromPayload(
    decodeJwtClaims(accessToken) || {},
    fallbackUserId,
  );
  if (fromJwt) return fromJwt;

  throw Object.assign(
    new Error(
      lastError ||
        "Figma did not return an email from the MCP whoami tool.",
    ),
    { code: "figma_identity_unavailable", status: 502 },
  );
}

function requireFigmaEmployee(identity: FigmaIdentity): FigmaIdentity {
  if (!isFigmaEmail(identity.email)) {
    throw Object.assign(
      new Error("Use a Figma account with a verified @figma.com email."),
      { code: "figma_email_not_allowed", status: 403 },
    );
  }
  return identity;
}

function adminHeaders(serviceKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "Content-Type": "application/json",
  };
}

type MintedSession = {
  accessToken: string;
  refreshToken: string;
  email: string;
};

function randomPassword(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readJson(
  response: Response,
): Promise<Record<string, unknown>> {
  return await response.json().catch(() => ({})) as Record<string, unknown>;
}

async function lookupUserIdByEmail(
  supabaseUrl: string,
  headers: Record<string, string>,
  email: string,
): Promise<string | undefined> {
  const byEmail = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers },
  );
  const payload = await readJson(byEmail);
  const direct = stringField(payload, "id");
  if (direct) return direct;
  const user = payload.user && typeof payload.user === "object"
    ? payload.user as Record<string, unknown>
    : null;
  if (user) return stringField(user, "id");
  const users = Array.isArray(payload.users) ? payload.users : [];
  for (const entry of users) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (stringField(record, "email")?.toLowerCase() === email.toLowerCase()) {
      return stringField(record, "id");
    }
  }

  const linkResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const link = await readJson(linkResponse);
  const nested = link.user && typeof link.user === "object"
    ? link.user as Record<string, unknown>
    : link;
  return stringField(nested, "id");
}

async function mintSupabaseSession(
  identity: FigmaIdentity,
): Promise<MintedSession> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() || "";
  if (!supabaseUrl || !serviceKey) {
    throw Object.assign(new Error("Supabase admin is not configured."), {
      code: "supabase_admin_not_configured",
      status: 503,
    });
  }

  const headers = adminHeaders(serviceKey);
  // Only include fields we actually have so merging onto an existing account
  // (e.g. one created via GitHub) never overwrites good values with empties.
  const userMetadata: Record<string, string> = {};
  const displayName = identity.name || identity.handle || "";
  if (displayName) {
    userMetadata.full_name = displayName;
    userMetadata.name = displayName;
  }
  if (identity.handle) {
    userMetadata.user_name = identity.handle;
    userMetadata.preferred_username = identity.handle;
  }
  if (identity.avatarUrl) {
    userMetadata.avatar_url = identity.avatarUrl;
    userMetadata.picture = identity.avatarUrl;
  }
  if (identity.figmaUserId) {
    userMetadata.figma_user_id = identity.figmaUserId;
  }

  // Lookup-first so a verified @figma.com email maps to a single Shader Studio
  // user, no matter whether Figma or GitHub signed in first. Only create when
  // no account exists yet.
  let userId = await lookupUserIdByEmail(supabaseUrl, headers, identity.email);
  let existingApp: Record<string, unknown> = {};
  let existingMeta: Record<string, unknown> = {};

  if (userId) {
    const existing = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
      headers,
    });
    const existingPayload = await readJson(existing);
    existingApp =
      existingPayload.app_metadata &&
        typeof existingPayload.app_metadata === "object"
        ? existingPayload.app_metadata as Record<string, unknown>
        : {};
    existingMeta =
      existingPayload.user_metadata &&
        typeof existingPayload.user_metadata === "object"
        ? existingPayload.user_metadata as Record<string, unknown>
        : {};
  } else {
    const created = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: identity.email,
        email_confirm: true,
        user_metadata: userMetadata,
        app_metadata: {
          provider: "figma",
          providers: ["figma"],
          figma_user_id: identity.figmaUserId,
        },
      }),
    });
    const createdPayload = await readJson(created);

    if (!created.ok && created.status !== 422) {
      const message =
        stringField(createdPayload, "msg", "message", "error") ||
        `Could not create Shader Studio account (${created.status})`;
      throw Object.assign(new Error(message), {
        code: "supabase_user_create_failed",
        status: created.status >= 400 && created.status < 600
          ? created.status
          : 502,
      });
    }

    userId = stringField(createdPayload, "id");
    if (!userId) {
      // A concurrent sign-in may have created the row (422): re-resolve by email.
      userId = await lookupUserIdByEmail(supabaseUrl, headers, identity.email);
    } else {
      existingApp =
        createdPayload.app_metadata &&
          typeof createdPayload.app_metadata === "object"
          ? createdPayload.app_metadata as Record<string, unknown>
          : {};
      existingMeta =
        createdPayload.user_metadata &&
          typeof createdPayload.user_metadata === "object"
          ? createdPayload.user_metadata as Record<string, unknown>
          : {};
    }
  }

  if (!userId) {
    throw Object.assign(
      new Error("Could not find a Shader Studio user for this Figma account."),
      { code: "supabase_user_missing", status: 502 },
    );
  }

  // Append "figma" to the provider list without clobbering GitHub or any other
  // provider already linked to this user by the same verified email.
  const providers = Array.isArray(existingApp.providers)
    ? existingApp.providers.filter((value): value is string =>
      typeof value === "string"
    )
    : [];
  if (!providers.includes("figma")) providers.push("figma");
  const password = randomPassword();
  const updated = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      email_confirm: true,
      password,
      user_metadata: { ...existingMeta, ...userMetadata },
      app_metadata: {
        ...existingApp,
        providers,
        figma_user_id: identity.figmaUserId,
      },
    }),
  });
  if (!updated.ok) {
    const payload = await readJson(updated);
    const message =
      stringField(payload, "msg", "message", "error") ||
      "Could not update the Shader Studio account.";
    throw Object.assign(new Error(message), {
      code: "supabase_user_update_failed",
      status: 502,
    });
  }

  const tokenResponse = await fetch(
    `${supabaseUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        ...headers,
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        email: identity.email,
        password,
      }),
    },
  );
  const session = await readJson(tokenResponse);
  const accessToken = stringField(session, "access_token");
  const refreshToken = stringField(session, "refresh_token");
  if (!tokenResponse.ok || !accessToken || !refreshToken) {
    const message =
      stringField(session, "error_description", "msg", "message", "error") ||
      "Could not create a Shader Studio session.";
    throw Object.assign(new Error(message), {
      code: "supabase_session_failed",
      status: 502,
    });
  }

  return {
    accessToken,
    refreshToken,
    email: identity.email,
  };
}

function requireRedirectUri(value?: string): string {
  const redirectUri = value?.trim() || "";
  if (!allowedRedirectUris().includes(redirectUri)) {
    throw Object.assign(new Error("OAuth redirect URI is not allowed."), {
      code: "oauth_redirect_not_allowed",
      status: 400,
    });
  }
  return redirectUri;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

async function exchangeOAuthToken(
  params: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { clientId, clientSecret } = oauthCredentials();
  const response = await fetch(FIGMA_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuth(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      ...params,
      resource: MCP_URL,
    }),
  });
  const payload = await response.json().catch(() => ({})) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message =
      typeof payload.error_description === "string"
        ? payload.error_description
        : typeof payload.error === "string"
          ? payload.error
          : `Figma OAuth token request failed (${response.status})`;
    throw Object.assign(new Error(message), {
      code: "figma_oauth_token_error",
      status: response.status,
    });
  }
  if (typeof payload.access_token !== "string") {
    throw Object.assign(new Error("Figma OAuth returned no access token."), {
      code: "figma_oauth_missing_token",
      status: 502,
    });
  }
  return {
    accessToken: payload.access_token,
    refreshToken:
      typeof payload.refresh_token === "string"
        ? payload.refresh_token
        : undefined,
    expiresIn:
      typeof payload.expires_in === "number" ? payload.expires_in : undefined,
    userId:
      typeof payload.user_id_string === "string"
        ? payload.user_id_string
        : undefined,
  };
}

type JsonRpc = {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function parseSseJsonRpc(text: string): JsonRpc | null {
  const dataLines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (!dataLines.length) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as JsonRpc;
  } catch {
    return null;
  }
}

async function parseMcpResponse(response: Response): Promise<{
  rpc: JsonRpc | null;
  sessionId: string | null;
  rawText: string;
}> {
  const sessionId = response.headers.get("mcp-session-id");
  const rawText = await response.text();
  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    return { rpc: null, sessionId, rawText };
  }

  if (contentType.includes("application/json")) {
    try {
      return { rpc: JSON.parse(rawText) as JsonRpc, sessionId, rawText };
    } catch {
      return { rpc: null, sessionId, rawText };
    }
  }

  return { rpc: parseSseJsonRpc(rawText), sessionId, rawText };
}

type ToolCallDiagnostics = Record<string, string | number>;

function toolCallDiagnostics(
  tool: string,
  args: Record<string, unknown>,
): ToolCallDiagnostics {
  const details: ToolCallDiagnostics = { tool };
  if (typeof args.kind === "string") details.kind = args.kind;
  if (typeof args.id === "string") details.id = args.id;
  if (typeof args.name === "string") details.nameChars = args.name.length;
  if (typeof args.description === "string") {
    details.descriptionChars = args.description.length;
  }
  if (typeof args.planKey === "string") {
    details.planType = args.planKey.split("::", 1)[0] || "unknown";
  }
  if (typeof args.mainTs === "string") details.mainTsChars = args.mainTs.length;
  if (typeof args.commitMessage === "string") {
    details.commitMessageChars = args.commitMessage.length;
  }
  return details;
}

function formatToolCallDiagnostics(details: ToolCallDiagnostics): string {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

class McpClient {
  #token: string;
  #sessionId: string | null = null;
  #initialized = false;
  #nextId = 1;

  constructor(token: string) {
    this.#token = token;
  }

  async #post(body: JsonRpc): Promise<JsonRpc> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${this.#token}`,
    };
    if (this.#sessionId) headers["Mcp-Session-Id"] = this.#sessionId;

    const response = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const { rpc, sessionId, rawText } = await parseMcpResponse(response);
    if (sessionId) this.#sessionId = sessionId;

    if (response.status === 401 || response.status === 403) {
      throw Object.assign(
        new Error(
          "Figma MCP authorization failed. Reconnect Figma and confirm this OAuth client is approved for mcp:connect.",
        ),
        { code: "figma_mcp_unauthorized", status: response.status },
      );
    }

    if (!response.ok) {
      throw Object.assign(
        new Error(
          rawText?.slice(0, 280) ||
            `Figma MCP request failed (${response.status})`,
        ),
        { code: "figma_mcp_error", status: response.status },
      );
    }

    if (!rpc) {
      throw Object.assign(
        new Error("Figma MCP returned an unreadable response."),
        { code: "figma_mcp_parse", status: 502 },
      );
    }

    if (rpc.error) {
      throw Object.assign(
        new Error(rpc.error.message || "Figma MCP tool error"),
        { code: "figma_mcp_rpc", status: 502, data: rpc.error.data },
      );
    }

    return rpc;
  }

  async ensureSession(): Promise<void> {
    if (this.#initialized) return;

    await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "figma-webgpu-shader-studio", version: "0.1.0" },
      },
    });

    // notifications/initialized has no response body requirements
    try {
      await fetch(MCP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.#token}`,
          ...(this.#sessionId ? { "Mcp-Session-Id": this.#sessionId } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/initialized",
        }),
      });
    } catch {
      // Some transports ignore notification failures; tools may still work.
    }

    this.#initialized = true;
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    await this.ensureSession();
    const rpc = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const result = rpc.result as {
      isError?: boolean;
      content?: Array<{ text?: string }>;
    } | null;
    if (result?.isError) {
      const message = result.content
        ?.map((part) => part?.text)
        .filter((text): text is string => Boolean(text))
        .join("\n")
        .trim();
      const details = toolCallDiagnostics(name, args);
      const toolMessage = message || `${name} failed`;
      console.error("Figma MCP tool call failed", {
        ...details,
        error: toolMessage,
      });
      throw Object.assign(
        new Error(
          `${toolMessage}\nRequest details: ${formatToolCallDiagnostics(details)}`,
        ),
        {
          code: "figma_mcp_tool_error",
          status: 502,
          details,
        },
      );
    }
    return result;
  }

  async readResource(uri: string): Promise<string> {
    await this.ensureSession();
    const rpc = await this.#post({
      jsonrpc: "2.0",
      id: this.#nextId++,
      method: "resources/read",
      params: { uri },
    });
    const result = rpc.result as {
      contents?: Array<{ text?: string; blob?: string; mimeType?: string }>;
    } | null;
    const content = result?.contents?.[0];
    if (typeof content?.text === "string") return content.text;
    if (typeof content?.blob === "string") {
      try {
        return atob(content.blob);
      } catch {
        return content.blob;
      }
    }
    throw Object.assign(new Error(`Empty MCP resource: ${uri}`), {
      code: "empty_resource",
      status: 502,
    });
  }
}

function extractToolPayload(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") return {};
  const record = result as Record<string, unknown>;

  if (record.structuredContent && typeof record.structuredContent === "object") {
    return record.structuredContent as Record<string, unknown>;
  }

  const content = Array.isArray(record.content) ? record.content : [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const text = (part as { text?: string }).text;
    if (typeof text !== "string") continue;
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // keep looking
    }
  }

  // Some servers return the payload at the top level.
  if (
    "items" in record || "id" in record || "files" in record ||
    "plans" in record || "version" in record
  ) {
    return record;
  }
  return {};
}

function requireShaderKind(kind: unknown): ShaderKind {
  if (kind !== "effect" && kind !== "fill") {
    throw Object.assign(new Error("kind must be effect or fill"), {
      code: "invalid_kind",
      status: 400,
    });
  }
  return kind;
}

function requireBodyString(
  value: unknown,
  field: string,
  maxLength = 100_000,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw Object.assign(new Error(`${field} is required`), {
      code: `invalid_${field.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}`,
      status: 400,
    });
  }
  if (text.length > maxLength) {
    throw Object.assign(new Error(`${field} is too long`), {
      code: `invalid_${field.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}`,
      status: 400,
    });
  }
  return text;
}

function requireBodySource(value: unknown): string {
  const source = typeof value === "string" ? value : "";
  if (!source.trim()) {
    throw Object.assign(new Error("mainTs is required"), {
      code: "invalid_main_ts",
      status: 400,
    });
  }
  if (source.length > 500_000) {
    throw Object.assign(new Error("mainTs is too long"), {
      code: "invalid_main_ts",
      status: 400,
    });
  }
  return source;
}

async function listFigmaPlans(client: McpClient) {
  const payload = extractToolPayload(await client.callTool("whoami"));
  const plans = Array.isArray(payload.plans) ? payload.plans : [];
  return {
    plans: plans.map((entry) => {
      const plan = (entry && typeof entry === "object" ? entry : {}) as Record<
        string,
        unknown
      >;
      const key = typeof plan.key === "string" ? plan.key.trim() : "";
      return {
        key,
        name: typeof plan.name === "string" && plan.name.trim()
          ? plan.name.trim()
          : "Figma plan",
        tier: typeof plan.tier === "string" ? plan.tier : "",
        seat: typeof plan.seat === "string" ? plan.seat : "",
      };
    }).filter((plan) => /^(team|organization)::\d+$/.test(plan.key)),
  };
}

async function createFigmaShader(
  client: McpClient,
  body: RequestBody,
) {
  const kind = requireShaderKind(body.kind);
  const name = requireBodyString(body.name, "name", 256);
  const description = requireBodyString(body.description, "description", 1000);
  const planKey = requireBodyString(body.planKey, "planKey", 128);
  if (!/^(team|organization)::\d+$/.test(planKey)) {
    throw Object.assign(new Error("planKey must be a Figma team or organization key"), {
      code: "invalid_plan_key",
      status: 400,
    });
  }
  const payload = extractToolPayload(
    await client.callTool("create_shader", {
      name,
      description,
      planKey,
      kind,
    }),
  );
  const id = stringField(payload, "id", "shaderId", "shader_id");
  if (!id) {
    throw Object.assign(new Error("Figma did not return the created shader id"), {
      code: "missing_shader_id",
      status: 502,
    });
  }
  return {
    id,
    kind,
    version: stringField(payload, "version"),
  };
}

async function updateFigmaShader(
  client: McpClient,
  body: RequestBody,
) {
  const kind = requireShaderKind(body.kind);
  const id = requireBodyString(body.id, "id", 256);
  const mainTs = requireBodySource(body.mainTs);
  const commitMessage = requireBodyString(
    body.commitMessage,
    "commitMessage",
    500,
  );
  const payload = extractToolPayload(
    await client.callTool("update_shader", {
      id,
      kind,
      mainTs,
      commitMessage,
    }),
  );
  return {
    id: stringField(payload, "id", "shaderId", "shader_id") || id,
    kind,
    version: stringField(payload, "version", "commit", "commitSha", "sha"),
  };
}

async function listShaders(
  client: McpClient,
  kind: ShaderKind,
  cursor?: string,
) {
  const result = await client.callTool(listTool(kind), {
    ...(cursor ? { cursor } : {}),
  });
  const payload = extractToolPayload(result);
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    items: items.map((item) => {
      const row = (item && typeof item === "object" ? item : {}) as Record<
        string,
        unknown
      >;
      return {
        id: String(row.id || ""),
        name: String(row.name || "Untitled"),
        description:
          typeof row.description === "string" ? row.description : "",
      };
    }).filter((item) => item.id),
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

async function getShader(
  client: McpClient,
  kind: ShaderKind,
  id: string,
  version?: string,
) {
  const result = await client.callTool(getTool(kind), {
    id,
    ...(version ? { version } : {}),
  });
  const payload = extractToolPayload(result);
  const filesIn = Array.isArray(payload.files) ? payload.files : [];
  const files: Array<{
    filename: string;
    bytes?: number;
    uri?: string;
    text?: string;
  }> = [];

  for (const entry of filesIn) {
    const file = (entry && typeof entry === "object" ? entry : {}) as Record<
      string,
      unknown
    >;
    const filename = String(file.filename || "");
    const uri = typeof file.uri === "string" ? file.uri : undefined;
    let text = typeof file.text === "string" ? file.text : undefined;
    if (!text && uri) {
      text = await client.readResource(uri);
    }
    files.push({
      filename,
      bytes: typeof file.bytes === "number" ? file.bytes : undefined,
      uri,
      text,
    });
  }

  const byName = new Map(
    files.map((file) => [file.filename.toLowerCase(), file]),
  );

  return {
    id: String(payload.id || id),
    name: String(payload.name || "Shader"),
    description:
      typeof payload.description === "string" ? payload.description : "",
    type: typeof payload.type === "string" ? payload.type : kind,
    version: typeof payload.version === "string" ? payload.version : undefined,
    kind,
    files,
    mainTs: byName.get("main.ts")?.text || "",
    featuresJson: byName.get("features.json")?.text,
    productBrief: byName.get("product-brief.md")?.text,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body", code: "bad_json" });
  }

  const op = body.op;
  if (!op) {
    return jsonResponse(400, { error: "Missing op", code: "missing_op" });
  }

  if (op === "oauth-authorize") {
    try {
      const { clientId } = oauthCredentials();
      const redirectUri = requireRedirectUri(body.redirectUri);
      const state = body.state?.trim() || "";
      const codeChallenge = body.codeChallenge?.trim() || "";
      const intent = readIntent(body.intent);
      if (!state || !codeChallenge) {
        return jsonResponse(400, {
          error: "state and codeChallenge are required",
          code: "invalid_oauth_request",
        });
      }
      const url = new URL(FIGMA_OAUTH_AUTHORIZE);
      url.searchParams.set("client_id", clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", oauthScope(intent));
      url.searchParams.set("state", state);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("code_challenge", codeChallenge);
      url.searchParams.set("code_challenge_method", "S256");
      url.searchParams.set("resource", MCP_URL);
      return jsonResponse(200, { authorizationUrl: url.toString() });
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  if (op === "oauth-exchange") {
    try {
      const redirectUri = requireRedirectUri(body.redirectUri);
      const code = body.code?.trim() || "";
      const codeVerifier = body.codeVerifier?.trim() || "";
      if (!code || !codeVerifier) {
        return jsonResponse(400, {
          error: "code and codeVerifier are required",
          code: "invalid_oauth_exchange",
        });
      }
      const tokens = await exchangeOAuthToken({
        grant_type: "authorization_code",
        code,
        code_verifier: codeVerifier,
        redirect_uri: redirectUri,
      });
      const intent = readIntent(body.intent);
      if (intent !== "signin") {
        return jsonResponse(200, { ...tokens, intent });
      }
      const identity = requireFigmaEmployee(
        await fetchFigmaIdentity(
          tokens.accessToken as string,
          typeof tokens.userId === "string" ? tokens.userId : undefined,
        ),
      );
      const auth = await mintSupabaseSession(identity);
      return jsonResponse(200, {
        ...tokens,
        intent,
        auth,
      });
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  if (op === "oauth-refresh") {
    try {
      const refreshToken = body.refreshToken?.trim() || "";
      if (!refreshToken) {
        return jsonResponse(400, {
          error: "refreshToken is required",
          code: "invalid_oauth_refresh",
        });
      }
      const tokens = await exchangeOAuthToken({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      });
      return jsonResponse(200, tokens);
    } catch (error) {
      const err = error as { message?: string; code?: string; status?: number };
      return jsonResponse(err.status || 502, {
        error: err.message || String(error),
        code: err.code || "figma_oauth_error",
      });
    }
  }

  const token = readToken(req, body);
  if (!token) {
    return jsonResponse(401, {
      error: "Missing Figma access token",
      code: "missing_token",
    });
  }

  try {
    if (op === "test") {
      const client = new McpClient(token);
      await listShaders(client, "effect");
      return jsonResponse(200, { ok: true });
    }

    if (op === "plans") {
      return jsonResponse(200, await listFigmaPlans(new McpClient(token)));
    }

    if (op === "create") {
      return jsonResponse(
        200,
        await createFigmaShader(new McpClient(token), body),
      );
    }

    if (op === "update") {
      return jsonResponse(
        200,
        await updateFigmaShader(new McpClient(token), body),
      );
    }

    if (op === "list") {
      const kind = body.kind;
      if (kind !== "effect" && kind !== "fill") {
        return jsonResponse(400, {
          error: "kind must be effect or fill",
          code: "invalid_kind",
        });
      }
      const client = new McpClient(token);
      const listed = await listShaders(client, kind, body.cursor);
      return jsonResponse(200, listed);
    }

    if (op === "get") {
      const kind = body.kind;
      const id = typeof body.id === "string" ? body.id.trim() : "";
      if (kind !== "effect" && kind !== "fill") {
        return jsonResponse(400, {
          error: "kind must be effect or fill",
          code: "invalid_kind",
        });
      }
      if (!id) {
        return jsonResponse(400, {
          error: "id is required",
          code: "invalid_id",
        });
      }
      const client = new McpClient(token);
      const detail = await getShader(client, kind, id, body.version);
      if (!detail.mainTs?.trim()) {
        return jsonResponse(502, {
          error: "Figma shader is missing main.ts source.",
          code: "missing_main",
        });
      }
      return jsonResponse(200, detail);
    }

    return jsonResponse(400, { error: `Unknown op: ${op}`, code: "bad_op" });
  } catch (error) {
    const err = error as {
      message?: string;
      code?: string;
      status?: number;
      details?: ToolCallDiagnostics;
    };
    const status =
      typeof err.status === "number" && err.status >= 400 && err.status < 600
        ? err.status
        : 502;
    return jsonResponse(status, {
      error: err.message || String(error),
      code: err.code || "figma_proxy_error",
      ...(err.details ? { details: err.details } : {}),
    });
  }
});
