#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
APP="$ROOT/app"

if [[ ! -f "$APP/package.json" ]]; then
  echo "Expected app/package.json at $APP" >&2
  exit 1
fi

previous="$(
  node -e "
    const pkg = require('$APP/package.json');
    const direct = pkg.dependencies?.['@rogieking/figui3'];
    console.log(direct ? direct.replace(/^[^0-9]*/, '') : '');
  "
)"
previousToolkit="$(
  cd "$APP"
  npm list @rogieking/toolkit --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/toolkit@//p'
)"

echo "Installing latest @rogieking/figui3 in app/..."
(
  cd "$APP"
  npm install @rogieking/figui3@latest
)

echo "Installing latest @rogieking/toolkit from rogie/propskit2 main in app/..."
(
  cd "$APP"
  toolkit_sha="$(git ls-remote https://github.com/rogie/propskit2.git refs/heads/main | cut -f1)"
  npm install "@rogieking/toolkit@github:rogie/propskit2#${toolkit_sha}" --save-exact
  node <<'NODE'
const fs = require("node:fs");

for (const file of ["package.json", "package-lock.json"]) {
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  if (file === "package.json") {
    json.dependencies["@rogieking/toolkit"] = "github:rogie/propskit2#main";
  } else {
    json.packages[""].dependencies["@rogieking/toolkit"] =
      "github:rogie/propskit2#main";
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
}
NODE
)

current="$(
  cd "$APP"
  npm list @rogieking/figui3 --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/figui3@//p'
)"
currentToolkit="$(
  cd "$APP"
  npm list @rogieking/toolkit --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/toolkit@//p'
)"

echo "FigUI3: ${previous:-unknown} -> ${current:-unknown}"
echo "ToolKit: ${previousToolkit:-unknown} -> ${currentToolkit:-unknown}"

if [[ -n "$previous" && -n "$current" && "$previous" == "$current" ]]; then
  echo "FigUI3 already on latest installed version."
fi
if [[ -n "$previousToolkit" && -n "$currentToolkit" && "$previousToolkit" == "$currentToolkit" ]]; then
  echo "ToolKit already on latest installed version."
fi

echo "Clearing Vite cache..."
rm -rf "$APP/node_modules/.vite"

echo "Done. Next: restart the dev server, review FigUI3 README/API changes, and run npm test && npm run build in app/."
