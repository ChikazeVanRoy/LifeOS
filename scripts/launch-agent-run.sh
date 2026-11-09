#!/bin/zsh
# Run by the LaunchAgent (see install-launch-agent.sh): rebuilds if the code changed, then serves LifeOS in the foreground.
cd "${0:A:h}/.." || exit 1
[[ -s "$HOME/.nvm/nvm.sh" ]] && source "$HOME/.nvm/nvm.sh"
PORT=${LIFEOS_PORT:-3000}
BUILD=node_modules/.cache/next/BUILD_ID
if [[ ! -f $BUILD || -n $(find src public package-lock.json next.config.ts -newer $BUILD -print -quit) ]]; then
  npm run build --silent || exit 1
fi
exec node node_modules/next/dist/bin/next start -p $PORT -H 127.0.0.1
