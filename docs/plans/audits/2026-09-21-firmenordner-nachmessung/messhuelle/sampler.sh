#!/usr/bin/env bash
# Orin: RAM und CPU des Dienstes alle ~2 s in eine Datei. `sampler.sh an <kandidat> <name>` / `sampler.sh aus <name>`
cd "$(dirname "$0")"; . ./lib.sh; set +e
case "$1" in
  an)  : > "$ERGEBNIS/$3.ram"; setsid nohup bash -c ". ./lib.sh; while true; do echo \"\$(date +%s) \$(ram_jetzt $2)\" >> $ERGEBNIS/$3.ram; sleep 1; done" >/dev/null 2>&1 < /dev/null & echo $! > "$ERGEBNIS/$3.pid" ;;
  aus) kill "$(cat "$ERGEBNIS/$2.pid")" 2>/dev/null; pkill -P "$(cat "$ERGEBNIS/$2.pid")" 2>/dev/null; rm -f "$ERGEBNIS/$2.pid"; ram_spitze "$ERGEBNIS/$2.ram" ;;
esac
