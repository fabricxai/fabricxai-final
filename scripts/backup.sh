#!/usr/bin/env bash
# Nightly backup: Postgres via pgBackRest, MinIO objects via mc mirror.
#
# Run from cron on the host, not from inside a container:
#
#   15 1 * * * /opt/fabricxai/scripts/backup.sh >> /var/log/fabricxai-backup.log 2>&1
#
# 01:15 Asia/Dhaka — after the nightly derivations at 00:30 have finished, before the
# morning shift starts entering anything. A backup that runs during the day-close job
# captures a database mid-derivation, which restores fine but takes longer to reason
# about at 3am.
#
# Exits non-zero on any failure and says which step failed. A backup script that fails
# quietly is the specific way people discover they have no backups.
set -Eeuo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/opt/fabricxai/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/fabricxai/.env.production}"
BACKUP_ENV_FILE="${BACKUP_ENV_FILE:-/opt/fabricxai/.env.backup}"

log() { printf '[backup] %s · %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

fail() {
  log "FAILED at: ${1}"
  # Surface it where somebody is looking. The app's own notification path needs the
  # database, which is the thing that may be broken, so this deliberately does not use
  # it — wire this to whatever the factory's on-call actually watches.
  if [[ -n "${BACKUP_ALERT_URL:-}" ]]; then
    curl -fsS -m 20 -X POST "${BACKUP_ALERT_URL}" \
      -H 'Content-Type: application/json' \
      -d "{\"text\":\"FabricXAI backup FAILED at: ${1}\"}" || true
  fi
  exit 1
}

trap 'fail "${BASH_COMMAND}"' ERR

# shellcheck disable=SC1090
[[ -f "${BACKUP_ENV_FILE}" ]] && set -a && source "${BACKUP_ENV_FILE}" && set +a

: "${PGBACKREST_BUCKET:?set in ${BACKUP_ENV_FILE}}"
: "${PGBACKREST_CIPHER_PASS:?set in ${BACKUP_ENV_FILE}}"

compose() { docker compose -f "${COMPOSE_FILE}" --env-file "${ENV_FILE}" "$@"; }

# ── 1 · Postgres ───────────────────────────────────────────────────────────────
#
# Full on Sunday, incremental the rest of the week. An incremental is minutes and a full
# is not, and a week of incrementals on top of a full restores well within the 4h RTO.
TYPE=incr
[[ "$(date +%u)" == '7' ]] && TYPE=full
log "pgBackRest ${TYPE} backup starting"

compose run --rm --entrypoint pgbackrest backup \
  --stanza=fabricxai --type="${TYPE}" backup

log "pgBackRest ${TYPE} backup complete"

# Ask the repository what it thinks it has, rather than trusting the exit code above.
# `info` failing here means the backup wrote something the repo cannot read back.
compose run --rm --entrypoint pgbackrest backup --stanza=fabricxai info

# ── 2 · MinIO objects ──────────────────────────────────────────────────────────
#
# The database rows reference documents by key; without the objects, a restored database
# has a challan photo a customs officer asked for and no file behind it.
#
# `mirror --remove` keeps the mirror faithful including deletions, but the bucket is
# VERSIONED (docker-compose.prod.yml), so a delete is recoverable on the source side.
log "mirroring documents to offsite storage"

compose run --rm --entrypoint sh minio-init -c '
  set -e
  mc alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"
  mc alias set dst "$DOCS_BACKUP_ENDPOINT" "$DOCS_BACKUP_KEY" "$DOCS_BACKUP_SECRET"
  mc mirror --overwrite --remove "src/$S3_BUCKET" "dst/$DOCS_BACKUP_BUCKET"
'

log "document mirror complete"

# ── 3 · Say so ─────────────────────────────────────────────────────────────────
#
# A heartbeat on SUCCESS, not only an alert on failure. The failure mode this catches is
# the one that matters: cron silently stopping, where no alert ever fires because nothing
# ever runs. Point BACKUP_HEARTBEAT_URL at a dead-man's-switch monitor.
if [[ -n "${BACKUP_HEARTBEAT_URL:-}" ]]; then
  curl -fsS -m 20 "${BACKUP_HEARTBEAT_URL}" || log 'heartbeat ping failed (backup itself was fine)'
fi

log "done · type=${TYPE}"
