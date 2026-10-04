# Sourced by backup.sh / restore.sh. Runs a MongoDB database tool (mongodump,
# mongorestore): the installed binary when there is one, otherwise the same
# tool from the official Docker image, with the host network so 127.0.0.1 and
# Atlas both resolve exactly as they would locally.
MONGO_TOOLS_IMAGE="${MONGO_TOOLS_IMAGE:-mongo:8.0}"

mongo_tool() {
  local tool="$1"
  shift
  if command -v "$tool" >/dev/null 2>&1; then
    "$tool" "$@"
  elif command -v docker >/dev/null 2>&1; then
    docker run --rm -i --network host "$MONGO_TOOLS_IMAGE" "$tool" "$@"
  else
    echo "$tool not found and Docker is not available. Install MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools" >&2
    return 127
  fi
}
