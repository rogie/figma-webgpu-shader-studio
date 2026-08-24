const STORAGE_KEY = "shader-studio.figmaPlanKey";

export function getPreferredFigmaPlanKey() {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || "";
  } catch {
    return "";
  }
}

export function setPreferredFigmaPlanKey(planKey) {
  try {
    const value = typeof planKey === "string" ? planKey.trim() : "";
    if (value) localStorage.setItem(STORAGE_KEY, value);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
}

export function preferredFigmaPlan(plans) {
  const key = getPreferredFigmaPlanKey();
  const available = Array.isArray(plans) ? plans : [];
  const match = available.find((plan) => plan?.key === key) || null;
  if (key && !match) setPreferredFigmaPlanKey("");
  return match;
}
