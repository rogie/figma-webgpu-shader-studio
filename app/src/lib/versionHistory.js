export const VERSION_HISTORY_PAGE_SIZE = 25;

export function visibleVersionHistory(versions, open) {
  return open && Array.isArray(versions) ? versions : [];
}

export function mergeVersionPage(
  existing,
  page,
  { reset = false, pageSize = VERSION_HISTORY_PAGE_SIZE } = {},
) {
  const seen = new Set();
  const versions = [...(reset ? [] : existing || []), ...(page || [])].filter(
    (version) => {
      if (!version?.id || seen.has(version.id)) return false;
      seen.add(version.id);
      return true;
    },
  );
  return {
    versions,
    hasMore: (page?.length || 0) === pageSize,
  };
}
