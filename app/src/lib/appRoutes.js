import { COMPOSITION_KIND } from "./composition.js";

export const SHADER_ROUTE_SEGMENT = "shader";
export const COMPOSER_ROUTE_SEGMENT = "composer";
export const EMBED_ROUTE_SEGMENT = "embed";

function normalizeBasePath(basePath) {
  if (!basePath || basePath === "/") return "/";
  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

export function parseAppRoute(pathname, basePath = "/") {
  if (!pathname.startsWith(basePath)) return { id: null, kind: null };
  const routePath = pathname
    .slice(basePath.length)
    .replace(/^\/+/, "")
    .replace(/\/$/, "");
  if (!routePath) return { id: null, kind: null };
  if (
    routePath === SHADER_ROUTE_SEGMENT ||
    routePath === COMPOSER_ROUTE_SEGMENT
  ) {
    return { id: null, kind: null };
  }

  let idSegment = routePath;
  let kind = null;
  let embed = false;
  if (routePath.startsWith(`${SHADER_ROUTE_SEGMENT}/`)) {
    idSegment = routePath.slice(SHADER_ROUTE_SEGMENT.length + 1);
  } else if (routePath.startsWith(`${COMPOSER_ROUTE_SEGMENT}/`)) {
    idSegment = routePath.slice(COMPOSER_ROUTE_SEGMENT.length + 1);
    kind = COMPOSITION_KIND;
  } else if (routePath.includes("/")) {
    return { id: null, kind: null };
  }

  if (
    kind !== null ||
    routePath.startsWith(`${SHADER_ROUTE_SEGMENT}/`)
  ) {
    const embedSuffix = `/${EMBED_ROUTE_SEGMENT}`;
    if (idSegment.endsWith(embedSuffix)) {
      idSegment = idSegment.slice(0, -embedSuffix.length);
      embed = true;
    }
    if (!idSegment || idSegment.includes("/")) {
      return { id: null, kind: null };
    }
  }

  if (!idSegment) return { id: null, kind: null };
  try {
    const route = { id: decodeURIComponent(idSegment), kind };
    return embed ? { ...route, embed: true } : route;
  } catch {
    return { id: null, kind: null };
  }
}

export function appItemPathname(id, kind, basePath = "/") {
  const base = normalizeBasePath(basePath);
  const segment =
    kind === COMPOSITION_KIND ? COMPOSER_ROUTE_SEGMENT : SHADER_ROUTE_SEGMENT;
  return `${base}${segment}/${encodeURIComponent(id)}`;
}

export function appEmbedPathname(id, kind, basePath = "/") {
  return `${appItemPathname(id, kind, basePath)}/${EMBED_ROUTE_SEGMENT}`;
}
