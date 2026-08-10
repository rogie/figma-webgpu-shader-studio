#!/usr/bin/env bash
# Restart Vite for local terminal use. In Cursor, use the background Shell command
# documented in ../SKILL.md instead — detached processes here do not survive.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
APP="$ROOT/app"
LOG="$APP/.vite-dev.log"
PID_FILE="$APP/.vite-dev.pid"
PORT=5173
HOST=localhost
MAX_WAIT_SEC=20

if [[ ! -f "$APP/package.json" ]]; then
  echo "Expected app/package.json at $APP" >&2
  exit 1
fi

stop_listener() {
  local pid
  pid="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pid" ]]; then
    echo "Stopping dev server on :$PORT (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! lsof -ti :"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
        return 0
      fi
      sleep 0.1
    done
    echo "Force stopping stubborn listener on :$PORT..." >&2
    kill -9 "$pid" 2>/dev/null || true
  fi
}

start_server() {
  cd "$APP"
  rm -f "$PID_FILE"
  : >"$LOG"

  if command -v setsid >/dev/null 2>&1; then
    setsid npx vite --force --host "$HOST" --port "$PORT" >>"$LOG" 2>&1 &
  else
    nohup npx vite --force --host "$HOST" --port "$PORT" >>"$LOG" 2>&1 &
    disown
  fi

  local starter_pid=$!
  echo "$starter_pid" >"$PID_FILE"
  echo "Starting Vite (starter pid $starter_pid). Log: $LOG"
}

wait_for_ready() {
  local elapsed=0
  while (( elapsed < MAX_WAIT_SEC )); do
    if curl -sf -o /dev/null --max-time 1 "http://${HOST}:${PORT}/"; then
      local listener
      listener="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null | head -1 || true)"
      echo "Dev server ready at http://${HOST}:${PORT}/ (listener pid ${listener:-unknown})"
      return 0
    fi
    sleep 0.5
    elapsed=$((elapsed + 1))
  done

  echo "Dev server did not respond on http://${HOST}:${PORT}/ within ${MAX_WAIT_SEC}s." >&2
  echo "Recent log output:" >&2
  tail -30 "$LOG" >&2 || true
  return 1
}

stop_listener
start_server
wait_for_ready
