export function anthropicOutputConfig(
  model: string,
  mode: "agent" | "plan",
): { effort: "low" } | undefined {
  if (mode === "plan") return undefined;
  if (
    /^claude-(?:fable|opus|sonnet)-5/.test(model) ||
    model === "claude-opus-4-8" ||
    model === "claude-sonnet-4-6"
  ) {
    return { effort: "low" };
  }
  return undefined;
}
