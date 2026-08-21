import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSITION_KIND } from "./composition.js";
import { appItemPathname, parseAppRoute } from "./appRoutes.js";

test("parses shader, composer, legacy, and home paths", () => {
  assert.deepEqual(parseAppRoute("/"), { id: null, kind: null });
  assert.deepEqual(parseAppRoute("/shader/abc"), { id: "abc", kind: null });
  assert.deepEqual(parseAppRoute("/composer/abc"), {
    id: "abc",
    kind: COMPOSITION_KIND,
  });
  assert.deepEqual(parseAppRoute("/dither"), { id: "dither", kind: null });
  assert.deepEqual(parseAppRoute("/foo/bar"), { id: null, kind: null });
  assert.deepEqual(parseAppRoute("/composer/"), { id: null, kind: null });
});

test("respects a GitHub Pages base path and decodes ids", () => {
  const base = "/figma-webgpu-shader-studio/";
  assert.deepEqual(parseAppRoute(`${base}composer/draft%3A1`, base), {
    id: "draft:1",
    kind: COMPOSITION_KIND,
  });
  assert.deepEqual(parseAppRoute(`${base}shader/grain`, base), {
    id: "grain",
    kind: null,
  });
});

test("builds shader and composer pathnames", () => {
  assert.equal(appItemPathname("abc"), "/shader/abc");
  assert.equal(
    appItemPathname("draft:1", COMPOSITION_KIND),
    "/composer/draft%3A1"
  );
  assert.equal(
    appItemPathname("abc", COMPOSITION_KIND, "/figma-webgpu-shader-studio/"),
    "/figma-webgpu-shader-studio/composer/abc"
  );
});
