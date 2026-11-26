const STORAGE_KEY = "shader-studio.chatPlans.v1";
const BUILD_STORAGE_PREFIX = "shader-studio.chatPlanBuild.v1:";

export function shaderPlanPath(ownerId, shaderId) {
  return `${ownerId}/${shaderId}/plan.md`;
}

export function shaderPlanBuildFolder(ownerId, shaderId) {
  return `${ownerId}/${shaderId}/plan-builds`;
}

export function planBuildStorageKey(shaderKey, revision = "") {
  return `${BUILD_STORAGE_PREFIX}${shaderKey}:${revision}`;
}

function normalizedPlan(markdown) {
  return markdown.trim().replace(/\r\n/g, "\n");
}

export function samePlanMarkdown(left, right) {
  return normalizedPlan(left) === normalizedPlan(right);
}

export async function planRevision(markdown) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedPlan(markdown)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isLocalPlanBuilt(shaderKey, revision) {
  try {
    return localStorage.getItem(planBuildStorageKey(shaderKey, revision)) === "1";
  } catch {
    return false;
  }
}

export function markLocalPlanBuilt(shaderKey, revision) {
  try {
    localStorage.setItem(planBuildStorageKey(shaderKey, revision), "1");
  } catch (error) {
    console.warn("Failed to persist plan build status locally", error);
  }
}

export function hasBuiltPlanInHistory(messages, markdown) {
  const samePlan = normalizedPlan(markdown);
  const appliedPlanIds = new Set(messages
    .filter((message) => message.role === "assistant" && message.applied && message.buildPlanId)
    .map((message) => message.buildPlanId));
  return messages.some((message) => (
    message.role === "assistant" &&
    message.mode === "plan" &&
    normalizedPlan(message.content) === samePlan &&
    (message.planApplied || appliedPlanIds.has(message.planId))
  ));
}

export function restoreChatPlan(messages, { markdown, built, planId }) {
  let found = false;
  let changed = false;
  const samePlan = normalizedPlan(markdown);
  const next = messages.map((message) => {
    if (
      message.role !== "assistant" || message.mode !== "plan" || message.pending ||
      message.planInterrupted || normalizedPlan(message.content) !== samePlan
    ) return message;
    found = true;
    if (!built || message.planApplied) return message;
    changed = true;
    return { ...message, planApplied: true };
  });
  if (found) return changed ? next : messages;
  return [...next, { role: "assistant", mode: "plan", planId, content: markdown, planApplied: built }];
}

export function isPlanDocument(markdown, { allowIncomplete = false } = {}) {
  const text = String(markdown || "").trimStart();
  if (/^#\s+\S/.test(text)) return true;
  return allowIncomplete && /^#\s*$/.test(text);
}

export function planDocumentSubject(markdown) {
  const heading = String(markdown || "")
    .trimStart()
    .match(/^#\s+([^\n]+)/)?.[1]
    ?.replace(/^plan(?:\s+for|:)?\s*/i, "")
    .replace(/[*_`]/g, "")
    .trim();
  return heading || "";
}

export function buildPlanImplementationPrompt(fileName, markdown) {
  return `Implement the following plan in the current ${fileName} module. Recheck the plan’s technical assumptions against the current authoring skills for its target. Preserve the user’s requirements. If a conditional fallback is no longer needed on that target, implement the primary behavior. Return the complete updated module using the required response format.

<plan>
${markdown}
</plan>`;
}

function loadPlans() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function loadLocalPlan(shaderKey) {
  if (!shaderKey) return "";
  const plan = loadPlans()[shaderKey];
  return typeof plan === "string" ? plan : "";
}

export function saveLocalPlan(shaderKey, markdown) {
  if (!shaderKey || typeof markdown !== "string" || !markdown.trim()) return;
  try {
    const plans = loadPlans();
    plans[shaderKey] = markdown;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn("Failed to persist local plan", error);
  }
}

export function removeLocalPlan(shaderKey) {
  if (!shaderKey) return;
  try {
    const plans = loadPlans();
    if (!(shaderKey in plans)) return;
    delete plans[shaderKey];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
  } catch (error) {
    console.warn("Failed to remove local plan", error);
  }
}
