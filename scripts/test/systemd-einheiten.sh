#!/bin/bash
# =============================================================================
# Die systemd-Einheiten zeigen auf das Geraet, das sie starten (J35)
# =============================================================================
# Am Orin (25.09.2026) stand arasul-platform.service in einer Neustartschleife
# (203/EXEC, `ProtectHome=yes` vor einem Ordner unter /home), Deadman-Switch und
# Watchdog zeigten auf `/opt/arasul`, und keine Pruefung war rot. Diese hier
# erzeugt die Einheiten so, wie `scripts/system/einheiten-installieren.sh` sie
# schreibt, und fragt:
#
#   1. jede Vorlage unter packaging/ wird erzeugt, keine faellt heraus;
#   2. keine erzeugte Einheit nennt /opt/arasul, und jeder ExecStart zeigt auf
#      ein ausfuehrbares Skript in diesem Baum;
#   3. unter /home steht ProtectHome=read-only, sonst sieht der Dienst sein
#      eigenes Skript nicht (gemessen an einem Wegwerfbaum unter $HOME, wenn
#      $HOME unter /home liegt -- auf dem CI-Laeufer ist das so);
#   4. install.sh, ./arasul und der Deploy rufen genau dieses Skript;
#   5. die Skripte hinter den Einheiten nennen keinen ausgedachten
#      Containernamen und keinen Port, den der Host nicht hat;
#   6. nach einem Neustart kommt auch hoch, was ein gesetztes Profil
#      einschaltet (J33, 26.09.2026: der Firmenordner war nach jedem `reboot`
#      weg) -- gemessen an `ordered-startup.sh` selbst, mit einem falschen
#      `docker` davor, das mitschreibt, was gestartet wird.
#
# Rueckgabe 0, wenn alles gruen ist.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SKRIPT="$WURZEL/scripts/system/einheiten-installieren.sh"
VORLAGEN="$WURZEL/packaging/arasul-platform/etc/systemd/system"

gruen=0
rot=0
pruefe() {
  if [ "$2" = ja ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s\n' "$1"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }

AUS="$(mktemp -d)"
trap 'rm -rf "$AUS"' EXIT
fehler="$(bash "$SKRIPT" --ausgabe "$AUS/alle" 2>&1)"
pruefe "einheiten-installieren.sh --ausgabe laeuft" "$(ja [ -d "$AUS/alle" ])" "$fehler"

# 1.
fehlend=""
for v in "$VORLAGEN"/*.service "$VORLAGEN"/*.timer; do
  [ -f "$AUS/alle/$(basename "$v")" ] || fehlend+=" $(basename "$v")"
done
pruefe "jede Vorlage wird erzeugt" "$(ja [ -z "$fehlend" ])" "fehlt:$fehlend"

# 2.
opt="$(grep -l '/opt/arasul' "$AUS"/alle/* 2>/dev/null | xargs -n1 basename 2>/dev/null | tr '\n' ' ')"
pruefe "keine Einheit nennt /opt/arasul" "$(ja [ -z "$opt" ])" "$opt"
kaputt=""
while IFS= read -r p; do
  [ -x "$p" ] && [[ "$p" == "$WURZEL"/* ]] || kaputt+=" $p"
done < <(sed -n 's|^ExecStart=\(/[^ ]*\).*|\1|p' "$AUS"/alle/*.service)
pruefe "jeder ExecStart ist ein ausfuehrbares Skript in diesem Baum" "$(ja [ -z "$kaputt" ])" "$kaputt"
pruefe "die Plattform laeuft im Fassungsordner" \
  "$(ja grep -qx "WorkingDirectory=$WURZEL" "$AUS/alle/arasul-platform.service")"

# 3.
case "$HOME/" in
  /home/*)
    BAUM="$(mktemp -d "$HOME/arasul-einheiten-XXXX")"
    mkdir -p "$BAUM/scripts" "$BAUM/packaging/arasul-platform/etc/systemd"
    cp -R "$WURZEL/scripts/system" "$BAUM/scripts/"
    cp -R "$VORLAGEN" "$BAUM/packaging/arasul-platform/etc/systemd/"
    bash "$BAUM/scripts/system/einheiten-installieren.sh" --nur-plattform --ausgabe "$AUS/home" >/dev/null 2>&1
    pruefe "unter /home steht ProtectHome=read-only" \
      "$(ja grep -qx 'ProtectHome=read-only' "$AUS/home/arasul-platform.service")" \
      "$(grep '^ProtectHome' "$AUS/home/arasul-platform.service" 2>/dev/null)"
    pruefe "und ReadWritePaths ist der Fassungsordner" \
      "$(ja grep -qx "ReadWritePaths=$BAUM" "$AUS/home/arasul-platform.service")"
    rm -rf "$BAUM"
    ;;
  *)
    printf '  --   ProtectHome unter /home (HOME=%s liegt nicht dort)\n' "$HOME"
    ;;
esac

# 4.
for aufrufer in install.sh arasul scripts/deploy/deploy-local.sh; do
  pruefe "$aufrufer ruft einheiten-installieren.sh" \
    "$(ja grep -q 'scripts/system/einheiten-installieren.sh' "$WURZEL/$aufrufer")"
done
pruefe "und niemand kopiert die Vorlagen noch selbst nach /etc/systemd" \
  "$(ja bash -c "! grep -n 'cp .*etc/systemd/system' '$WURZEL/arasul' '$WURZEL/install.sh'")"

# 5.
pruefe "ordered-startup.sh fragt Compose nach dem Container, nicht arasul-platform-<dienst>-1" \
  "$(ja bash -c "! grep -q -- '-\${service}-1\|arasul-platform-.*-1' '$WURZEL/scripts/system/ordered-startup.sh'")"
pruefe "deadman-switch.sh fragt keinen Port 9200 am Host und keinen erfundenen Namen" \
  "$(ja bash -c "! grep -q '9200\|arasul-platform-self-healing' '$WURZEL/scripts/system/deadman-switch.sh'")"

# 6.
ATTRAPPE="$AUS/attrappe"
mkdir -p "$ATTRAPPE/bin"
cat >"$ATTRAPPE/bin/docker" <<'ATTRAPPE_ENDE'
#!/bin/bash
# Compose kennt, was die `.env` einschaltet: hier die zwoelf Dienste samt
# `firmenordner`. Alles andere antwortet so, dass jede Phase sofort gesund ist.
case "$*" in
  "compose config --services")
    printf '%s\n' postgres-db docker-proxy llm-service embedding-service document-indexer \
      dashboard-backend dashboard-frontend reverse-proxy metrics-collector \
      self-healing-agent backup-service firmenordner ;;
  "compose up -d "*) aufruf="$*"; echo "${aufruf#compose up -d }" >>"$ATTRAPPE_LOG" ;;
  "compose ps -q "*) echo "id-${*##* }" ;;
  inspect*) echo healthy ;;
esac
exit 0
ATTRAPPE_ENDE
chmod +x "$ATTRAPPE/bin/docker"
ATTRAPPE_LOG="$ATTRAPPE/gestartet" PATH="$ATTRAPPE/bin:$PATH" STABILIZE_WAIT=0 \
  ARASUL_LOG_DIR="$ATTRAPPE/logs" bash "$WURZEL/scripts/system/ordered-startup.sh" --skip-pull \
  >"$ATTRAPPE/ausgabe" 2>&1
GESTARTET="$(tr ' ' '\n' <"$ATTRAPPE/gestartet" 2>/dev/null)"
pruefe "ordered-startup.sh startet nach Phase 4 den Dienst eines gesetzten Profils" \
  "$(ja grep -qx 'firmenordner' <<<"$GESTARTET")" \
  "gestartet: $(tr '\n' '|' <"$ATTRAPPE/gestartet" 2>/dev/null)"
pruefe "und keinen Dienst zweimal" "$(ja [ -z "$(sort <<<"$GESTARTET" | uniq -d)" ])" \
  "$(sort <<<"$GESTARTET" | uniq -d | tr '\n' ' ')"

echo ""
if [ "$rot" -eq 0 ]; then
  echo "$gruen von $gruen gruen"
  exit 0
fi
echo "$gruen von $((gruen + rot)) gruen, $rot rot"
exit 1
