#!/bin/zsh
# Double-click in Finder to stop LifeOS started by "LifeOS.command".

cd "${0:A:h}" || exit 1
PORT=${LIFEOS_PORT:-3000}
PIDFILE=.lifeos/server.pid
listening=$(lsof -ti tcp:$PORT -sTCP:LISTEN)

if [[ -f $PIDFILE && -n $listening && $listening == $(<$PIDFILE) ]]; then
  kill $listening
  rm -f $PIDFILE
  echo "LifeOS has stopped. You can close this window."
elif [[ -n $listening ]]; then
  echo "Something else is using port $PORT (perhaps npm run dev), so it was left running."
else
  rm -f $PIDFILE
  echo "LifeOS wasn't running. You can close this window."
fi
