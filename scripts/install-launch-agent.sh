#!/bin/zsh
# Installs LifeOS as a LaunchAgent: starts at login, restarts if it stops. Re-run after moving the project.
# Remove with: ./scripts/install-launch-agent.sh uninstall
DIR=${0:A:h:h}
LABEL=local.lifeos
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist
DOMAIN=gui/$(id -u)

launchctl bootout $DOMAIN/$LABEL 2>/dev/null
[[ $1 == uninstall ]] && { rm -f $PLIST; echo "LifeOS LaunchAgent removed."; exit 0; }

mkdir -p "$DIR/.lifeos" "$HOME/Library/LaunchAgents"
chmod +x "$DIR/scripts/launch-agent-run.sh"
cat > $PLIST <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$DIR/scripts/launch-agent-run.sh</string>
  </array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DIR/.lifeos/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/.lifeos/server.log</string>
</dict>
</plist>
PLISTEOF
launchctl bootstrap $DOMAIN $PLIST && echo "LifeOS LaunchAgent installed. http://localhost:${LIFEOS_PORT:-3000}"
