#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST_NAME="com.sewe.batch-reminder.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
TEMPLATE="$PROJECT_ROOT/scripts/com.sewe.batch-reminder.plist.template"

REMINDER_HOUR="${REMINDER_HOUR:-8}"
REMINDER_MINUTE="${REMINDER_MINUTE:-0}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm not found in PATH"
  exit 1
fi

NPM_PATH="$(command -v npm)"

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$PROJECT_ROOT/.sewe"

sed \
  -e "s|__PROJECT_ROOT__|$PROJECT_ROOT|g" \
  -e "s|__NPM_PATH__|$NPM_PATH|g" \
  -e "s|__REMINDER_HOUR__|$REMINDER_HOUR|g" \
  -e "s|__REMINDER_MINUTE__|$REMINDER_MINUTE|g" \
  "$TEMPLATE" > "$PLIST_DEST"

launchctl bootout "gui/$(id -u)/$PLIST_NAME" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_DEST"
launchctl enable "gui/$(id -u)/$PLIST_NAME"

echo "Installed weekly Monday reminder at ${REMINDER_HOUR}:$(printf '%02d' "$REMINDER_MINUTE")"
echo "Plist: $PLIST_DEST"
echo "Logs : $PROJECT_ROOT/.sewe/reminder.log"
echo ""
echo "Test now: npm run remind -- --dry-run"
echo "Force send: npm run remind -- --force"
