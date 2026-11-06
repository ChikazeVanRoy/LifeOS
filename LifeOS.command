#!/bin/zsh
# Double-click in Finder to start LifeOS and open it in the browser.
# It runs for as long as this window stays open, so nothing keeps running once you're done.

cd "${0:A:h}" || exit 1
# Your data lives in the browser under this address, so changing the port would show an empty account.
PORT=${LIFEOS_PORT:-3000}
URL=http://localhost:$PORT
PIDFILE=.lifeos/server.pid # says which server is the launcher's
LOG=.lifeos/server.log
BUILD=node_modules/.cache/next/BUILD_ID

fail() {
  echo "\n$1"
  read -s -k '?Press any key to close.'
  exit 1
}

# Get the latest version first. Only a plain fast-forward, so it never touches local changes, and offline just carries on.
# If the pull replaced this script, start again from the new one (zsh reads scripts as it goes).
if [[ -z $LIFEOS_PULLED && -d .git ]] && command -v git >/dev/null; then
  BEFORE=$(shasum "${0:A}")
  echo "Checking for updates..."
  git pull --ff-only --quiet 2>/dev/null || echo "(Couldn't update. Starting the version you have.)"
  [[ $(shasum "${0:A}") == $BEFORE ]] || { LIFEOS_PULLED=1 exec "${0:A}"; }
  export LIFEOS_PULLED=1
fi

# Its icon and hidden extension aren't kept by Git, so it sets them on itself: after a fresh clone, or a pull that
# replaced this file. Only for looks, so a failure here never stops the app starting.
if ! xattr "${0:A}" 2>/dev/null | grep -q com.apple.ResourceFork; then
  osascript -l JavaScript scripts/finder-look.js "${0:A}" "$PWD/scripts/launcher-icon.png" >/dev/null 2>&1
fi

running() { curl -sf -m 8 $URL/manifest.webmanifest 2>/dev/null | grep -q '"LifeOS"' }
listener() { lsof -ti tcp:$PORT -sTCP:LISTEN }
# Only the launcher's own server: npm run dev on this port isn't ours to stop
ours() { [[ -f $PIDFILE && $(listener) == $(<$PIDFILE) ]] }
outdated() { [[ ! -f $BUILD || -n $(find src public package-lock.json next.config.ts -newer $BUILD -print -quit) ]] }

mkdir -p .lifeos

# Node installed with nvm isn't on PATH in a window opened from Finder
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
command -v node >/dev/null || fail "Node isn't installed. Get it from https://nodejs.org (version 20.9 or newer)."
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 20 || (a === 20 && b >= 9) ? 0 : 1)' ||
  fail "Node $(node --version) is too old. Install version 20.9 or newer from https://nodejs.org."

# Another app on this port would open in place of LifeOS, so say so instead
if [[ -n $(listener) ]] && ! running; then
  fail "Something else is using port $PORT. Close it, then try again."
fi

# npm run dev is already serving LifeOS: use that and leave it alone
if running && ! ours; then
  open $URL
  echo "LifeOS was already running at $URL. You can close this window."
  exit 0
fi

# First run, or the dependencies changed since the last install (e.g. after a git pull)
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
  ours && kill $(<$PIDFILE)
  echo "Installing dependencies (first run only)..."
  npm install || fail "Installing dependencies failed (see above)."
fi

# The app needs building the first time, and again whenever its code changes
if outdated; then
  if ours; then
    echo "Restarting with the latest code..."
    kill $(<$PIDFILE)
    for _ in {1..40}; do running || break; sleep 0.25; done
  fi
  echo "Building the app..."
  npm run build --silent || fail "Building the app failed (see above)."
fi

if ! running; then
  # Only on this computer: the Anki route and your data aren't meant for other devices
  node node_modules/next/dist/bin/next start -p $PORT -H 127.0.0.1 >> $LOG 2>&1 &
  SERVER=$!
  echo $SERVER > $PIDFILE
  # Closing the window ends this script, and the server with it
  # Only its own PID file: a later launch may have restarted the server and written a new one
  trap 'kill $SERVER 2>/dev/null; [[ -f $PIDFILE && $(<$PIDFILE) == $SERVER ]] && rm -f $PIDFILE' EXIT
  trap 'exit 0' HUP INT TERM
  for _ in {1..120}; do running && break; sleep 0.25; done
  running || fail "LifeOS didn't start. See $LOG."
fi

open $URL

if [[ -n $SERVER ]]; then
  echo "LifeOS is running at $URL. Close this window to stop it."
  wait $SERVER
else
  echo "LifeOS was already running at $URL. You can close this window."
fi
