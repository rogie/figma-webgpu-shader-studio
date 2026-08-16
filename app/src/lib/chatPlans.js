const STORAGE_KEY = "shader-studio.chatPlans.v1";

export function shaderPlanPath(ownerId, shaderId) {
  return `${ownerId}/${shaderId}/plan.md`;
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
