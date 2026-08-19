#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DBPATH="${MONGO_DBPATH:-/tmp/lead-generation-mongodb}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
MONGO_LOG="$ROOT_DIR/.mongo.log"
BACKEND_LOG="$ROOT_DIR/.backend.log"
FRONTEND_LOG="$ROOT_DIR/.frontend.log"
PYTHON_BIN="${PYTHON_BIN:-}"

MONGO_IMAGE="${MONGO_IMAGE:-mongo:7}"
MONGO_CONTAINER_NAME="leadgen-mongo"

PIDS=()
STARTED_MONGO_CONTAINER=""

cleanup() {
  for pid in "${PIDS[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  if [ -n "$STARTED_MONGO_CONTAINER" ]; then
    docker rm -f "$MONGO_CONTAINER_NAME" >/dev/null 2>&1 \
      || podman rm -f "$MONGO_CONTAINER_NAME" >/dev/null 2>&1 \
      || true
  fi
}

trap cleanup EXIT INT TERM

port_in_use() {
  ss -ltn "( sport = :$1 )" | grep -q ":$1"
}

wait_for_mongo() {
  for _ in {1..60}; do
    if port_in_use "$MONGO_PORT"; then
      return
    fi
    sleep 1
  done

  echo "MongoDB did not start in time. See $MONGO_LOG" >&2
  exit 1
}

start_mongod() {
  mkdir -p "$MONGO_DBPATH"
  echo "Starting MongoDB (mongod) on port $MONGO_PORT"
  mongod --dbpath "$MONGO_DBPATH" --port "$MONGO_PORT" --bind_ip 127.0.0.1 >"$MONGO_LOG" 2>&1 &
  PIDS+=("$!")
  wait_for_mongo
}

start_mongo_container() {
  local cmd="$1"
  mkdir -p "$MONGO_DBPATH"
  echo "Starting MongoDB via $cmd ($MONGO_IMAGE) on port $MONGO_PORT"
  STARTED_MONGO_CONTAINER=1
  # Remove any stale container from a previous run
  "$cmd" rm -f "$MONGO_CONTAINER_NAME" >/dev/null 2>&1 || true
  if ! "$cmd" run -d --rm --name "$MONGO_CONTAINER_NAME" \
    -p "$MONGO_PORT":27017 \
    -v "$MONGO_DBPATH:/data/db" \
    "$MONGO_IMAGE" >"$MONGO_LOG" 2>&1; then
    echo "Failed to start MongoDB container via $cmd. See $MONGO_LOG" >&2
    exit 1
  fi
  wait_for_mongo
}

start_mongo_if_needed() {
  if port_in_use "$MONGO_PORT"; then
    echo "MongoDB already listening on port $MONGO_PORT"
    return
  fi

  if command -v mongod >/dev/null 2>&1; then
    start_mongod
  elif command -v docker >/dev/null 2>&1 && docker image inspect "$MONGO_IMAGE" >/dev/null 2>&1; then
    start_mongo_container docker
  elif command -v podman >/dev/null 2>&1 && podman image exists "$MONGO_IMAGE" >/dev/null 2>&1; then
    start_mongo_container podman
  else
    echo "mongod is not installed and no MongoDB container image is available." >&2
    echo "Install MongoDB, or fetch an image and re-run this script:" >&2
    echo "  docker pull $MONGO_IMAGE" >&2
    exit 1
  fi
}

start_backend() {
  echo "Starting backend on port $BACKEND_PORT"
  if [ -z "$PYTHON_BIN" ]; then
    if [ -x "$ROOT_DIR/.venv/bin/python" ]; then
      PYTHON_BIN="$ROOT_DIR/.venv/bin/python"
    elif command -v python >/dev/null 2>&1; then
      PYTHON_BIN="python"
    else
      PYTHON_BIN="python3"
    fi
  fi
  (
    cd "$BACKEND_DIR"
    # Prefer MONGO_URL from environment or backend/.env (live DB); fall back to local MongoDB.
    MONGO_URL="${MONGO_URL:-$(grep -E '^MONGO_URL=' .env 2>/dev/null | cut -d= -f2-)}" \
    MONGO_URL="${MONGO_URL:-mongodb://localhost:$MONGO_PORT}" \
    DB_NAME="${DB_NAME:-leadgen}" \
    JWT_SECRET="${JWT_SECRET:-leadgen_super_secure_jwt_secret_key_2026_x9k2p4}" \
    CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:$FRONTEND_PORT}" \
    "$PYTHON_BIN" -m uvicorn server:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload
  ) 2>&1 | tee -a "$BACKEND_LOG" &
  PIDS+=("$!")
}

start_frontend() {
  echo "Starting frontend on port $FRONTEND_PORT"
  (
    cd "$FRONTEND_DIR"
    PORT="$FRONTEND_PORT" \
    REACT_APP_BACKEND_URL="${REACT_APP_BACKEND_URL:-http://localhost:$BACKEND_PORT}" \
    npm start
  ) >"$FRONTEND_LOG" 2>&1 &
  PIDS+=("$!")
}

start_mongo_if_needed
start_backend
start_frontend

echo "All services started. Logs:"
echo "  MongoDB:   $MONGO_LOG"
echo "  Backend:   $BACKEND_LOG"
echo "  Frontend:  $FRONTEND_LOG"
echo "Press Ctrl+C to stop everything."

wait
