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

echo "Installing latest @rogieking/figui3 in app/..."
(
  cd "$APP"
  npm install @rogieking/figui3@latest
)

current="$(
  cd "$APP"
  npm list @rogieking/figui3 --depth=0 2>/dev/null | sed -n 's/.*@rogieking\/figui3@//p'
)"

echo "FigUI3: ${previous:-unknown} -> ${current:-unknown}"

if [[ -n "$previous" && -n "$current" && "$previous" == "$current" ]]; then
  echo "Already on latest installed version."
fi

echo "Clearing Vite cache..."
rm -rf "$APP/node_modules/.vite"

echo "Done. Next: restart the dev server, review FigUI3 README/API changes, and run npm test && npm run build in app/."
