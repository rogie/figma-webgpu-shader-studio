export function updateShaderToolArguments({
  id,
  kind,
  mainTs,
  commitMessage,
}) {
  return {
    id,
    kind,
    files: [{ path: "main.ts", content: mainTs }],
    commitMessage,
  };
}
