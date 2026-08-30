import assert from "node:assert/strict";
import test from "node:test";
import { COMPOSITION_KIND } from "./composition.js";
import {
  appEmbedPathname,
  appItemPathname,
  appProfilePathname,
  parseAppRoute,
} from "./appRoutes.js";

test("parses shader, composer, legacy, and home paths", () => {
  assert.deepEqual(parseAppRoute("/"), { id: null, kind: null });
  assert.deepEqual(parseAppRoute("/shader/abc"), { id: "abc", kind: null });
  assert.deepEqual(parseAppRoute("/composer/abc"), {
    id: "abc",
    kind: COMPOSITION_KIND,
  });
  assert.deepEqual(parseAppRoute("/dither"), { id: "dither", kind: null });
  assert.deepEqual(parseAppRoute("/foo/bar"), { id: null, kind: null });
  assert.deepEqual(parseAppRoute("/shader/abc/extra"), {
    id: null,
    kind: null,
  });
  assert.deepEqual(parseAppRoute("/composer/"), { id: null, kind: null });
});

test("parses creator profile paths", () => {
  assert.deepEqual(parseAppRoute("/@rogie"), {
    id: null,
    kind: null,
    profile: "rogie",
  });
  assert.deepEqual(parseAppRoute("/@creator%20name"), {
    id: null,
    kind: null,
    profile: "creator name",
  });
  assert.deepEqual(parseAppRoute("/@"), { id: null, kind: null });
  assert.deepEqual(parseAppRoute("/@rogie/shaders"), {
    id: null,
    kind: null,
  });
});

test("parses shader and composer embed paths", () => {
  assert.deepEqual(parseAppRoute("/shader/abc/embed"), {
    id: "abc",
    kind: null,
    embed: true,
  });
  assert.deepEqual(parseAppRoute("/composer/abc/embed/"), {
    id: "abc",
    kind: COMPOSITION_KIND,
    embed: true,
  });
  assert.deepEqual(parseAppRoute("/shader/draft%3A1/embed"), {
    id: "draft:1",
    kind: null,
    embed: true,
  });
  assert.deepEqual(parseAppRoute("/shader/abc/embed/extra"), {
    id: null,
    kind: null,
  });
  assert.deepEqual(parseAppRoute("/shader/%E0%A4%A/embed"), {
    id: null,
    kind: null,
  });
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
  assert.deepEqual(parseAppRoute(`${base}composer/abc/embed`, base), {
    id: "abc",
    kind: COMPOSITION_KIND,
    embed: true,
  });
});

test("builds shader, composer, and embed pathnames", () => {
  assert.equal(appItemPathname("abc"), "/shader/abc");
  assert.equal(
    appItemPathname("draft:1", COMPOSITION_KIND),
    "/composer/draft%3A1"
  );
  assert.equal(
    appItemPathname("abc", COMPOSITION_KIND, "/figma-webgpu-shader-studio/"),
    "/figma-webgpu-shader-studio/composer/abc"
  );
  assert.equal(appEmbedPathname("abc"), "/shader/abc/embed");
  assert.equal(
    appEmbedPathname(
      "draft:1",
      COMPOSITION_KIND,
      "/figma-webgpu-shader-studio/"
    ),
    "/figma-webgpu-shader-studio/composer/draft%3A1/embed"
  );
  assert.equal(appProfilePathname("rogie"), "/@rogie");
  assert.equal(
    appProfilePathname("rogie", "/figma-webgpu-shader-studio/"),
    "/figma-webgpu-shader-studio/@rogie",
  );
});
