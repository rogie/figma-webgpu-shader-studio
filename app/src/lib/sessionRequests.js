export function beginSessionRequest(sessionRequestRef, requestId = null) {
  if (!sessionRequestRef) return true;
  if (requestId == null) {
    sessionRequestRef.current += 1;
    return true;
  }
  return requestId === sessionRequestRef.current;
}

export async function persistBeforeSessionActivation({
  persist,
  sessionRequestRef,
  requestId,
}) {
  await persist();
  return !sessionRequestRef || requestId === sessionRequestRef.current;
}

export async function activateBeforeHydration({
  session,
  activate,
  hydrate,
  isCurrent = () => true,
}) {
  const hydration = Promise.resolve().then(() => hydrate(session.composition));
  try {
    await activate(session);
  } catch (error) {
    hydration.catch(() => {});
    throw error;
  }
  if (!isCurrent()) {
    hydration.catch(() => {});
    return null;
  }
  const hydrated = await hydration;
  return isCurrent() ? hydrated : null;
}
