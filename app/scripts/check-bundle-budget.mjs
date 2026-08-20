import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const distUrl = new URL("../dist/", import.meta.url);
const html = await readFile(new URL("index.html", distUrl), "utf8");

const entryPaths = [
  ...html.matchAll(
    /<(?:script|link)\b[^>]+(?:src|href)="([^"]+\.js)"[^>]*>/g
  ),
].map((match) => match[1].replace(/^\/+/, ""));

if (!entryPaths.length) {
  throw new Error("No initial JavaScript assets found in dist/index.html.");
}

const gzipSizes = await Promise.all(
  entryPaths.map(async (path) => {
    const bytes = await readFile(new URL(path.replace(/^assets\//, "assets/"), distUrl));
    return { path, bytes: gzipSync(bytes).byteLength };
  })
);

const totalInitialJs = gzipSizes.reduce((sum, asset) => sum + asset.bytes, 0);
const limits = {
  initialJs: 330 * 1024,
  entryJs: 230 * 1024,
};
const entry = gzipSizes.find((asset) => /assets\/index-/.test(asset.path));

if (totalInitialJs > limits.initialJs) {
  throw new Error(
    `Initial JavaScript is ${(totalInitialJs / 1024).toFixed(1)} KiB gzip; budget is ${limits.initialJs / 1024} KiB.`
  );
}
if (entry && entry.bytes > limits.entryJs) {
  throw new Error(
    `Entry JavaScript is ${(entry.bytes / 1024).toFixed(1)} KiB gzip; budget is ${limits.entryJs / 1024} KiB.`
  );
}

console.log(
  `Bundle budgets passed: ${(totalInitialJs / 1024).toFixed(1)} KiB initial JS gzip.`
);
