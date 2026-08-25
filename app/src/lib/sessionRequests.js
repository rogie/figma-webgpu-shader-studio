export function beginSessionRequest(sessionRequestRef, requestId = null) {
  if (!sessionRequestRef) return true;
  if (requestId == null) {
    sessionRequestRef.current += 1;
    return true;
  }
  return requestId === sessionRequestRef.current;
}

export async function activateBeforeHydration({
  session,
  activate,
  hydrate,
  isCurrent = () => true,
}) {
  await activate(session);
  if (!isCurrent()) return null;
  const hydrated = await hydrate(session.composition);
  return isCurrent() ? hydrated : null;
}
