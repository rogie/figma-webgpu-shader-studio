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
previousPropskit="$(
  cd "$APP"
  npm list @rogieking/propskit2 --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/propskit2@//p'
)"

echo "Installing latest @rogieking/figui3 in app/..."
(
  cd "$APP"
  npm install @rogieking/figui3@latest
)

echo "Installing latest @rogieking/propskit2 in app/..."
(
  cd "$APP"
  npm install github:rogie/propskit2#main
)

current="$(
  cd "$APP"
  npm list @rogieking/figui3 --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/figui3@//p'
)"
currentPropskit="$(
  cd "$APP"
  npm list @rogieking/propskit2 --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/propskit2@//p'
)"

echo "FigUI3: ${previous:-unknown} -> ${current:-unknown}"
echo "PropsKit2: ${previousPropskit:-unknown} -> ${currentPropskit:-unknown}"

if [[ -n "$previous" && -n "$current" && "$previous" == "$current" ]]; then
  echo "FigUI3 already on latest installed version."
fi
if [[ -n "$previousPropskit" && -n "$currentPropskit" && "$previousPropskit" == "$currentPropskit" ]]; then
  echo "PropsKit2 already on latest installed version."
fi

echo "Clearing Vite cache..."
rm -rf "$APP/node_modules/.vite"

echo "Done. Next: restart the dev server, review FigUI3 README/API changes, and run npm test && npm run build in app/."
