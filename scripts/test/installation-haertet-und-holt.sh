#!/bin/bash
# =============================================================================
# Die Installation holt das Modell und haertet ohne stille Fehler (J35)
# =============================================================================
# Am Orin (25.09.2026) holte die Installation kein Modell, der Healthcheck
# erklaerte ein Geraet ohne Modell fuer krank, die Haertung lief ohne sudo und
# schwieg darueber, und setup-mdns.sh benannte das System um. Diese Pruefung
# misst die Skripte dahinter an einem Wegwerfbaum, mit Attrappen fuer docker,
# sudo und sshd -- kein Geraet, kein Netz:
#
#   1. modell-holen.sh: Digest stimmt -> 0; Digest weicht ab -> 3; Kennung
#      nicht in der Kurzliste -> 1; ein abgebrochener Pull wird wiederholt;
#      die Ausgabe traegt keine Steuerzeichen; waehrend des Pulls steht das
#      Wartungsfenster; ein stehender Pull wird erkannt, beendet und nach
#      einem Neustart von llm-service wiederholt; nach SIGTERM ist das Fenster
#      zu und bleibt es; --nur-env zieht eine alte LLM_MODEL-Kennung nach.
#   2. healthcheck.sh: eine leere Modellliste ist gesund.
#   3. haerten.sh: ohne passwortloses sudo steht der Grund da; mit sudo und
#      einem Portwechsel steht "SSH-Port geaendert", ARASUL_SSH_PORT und
#      config/ssh-port; ein scheiterndes Skript nennt seine letzte Zeile.
#   4. Zurueckgelegte Modell-Volumes zaehlen nicht als Zustand eines Geraets
#      (installation.sh, dieselbe Liste wie im Werksreset).
#   5. setup-mdns.sh ruft kein hostnamectl und schreibt nicht /etc/hostname;
#      ./arasul ruft die Haertung nicht mehr mit 2>/dev/null.
#
# Rueckgabe 0, wenn alles gruen ist.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

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

# --- Wegwerfbaum ------------------------------------------------------------
baum() {
  local ziel="$1"
  mkdir -p "$ziel/scripts/util" "$ziel/scripts/lib" "$ziel/scripts/security" \
    "$ziel/config/modelle" "$ziel/logs" "$ziel/bin"
  cp "$WURZEL/scripts/util/modell-holen.sh" "$ziel/scripts/util/"
  cp "$WURZEL/scripts/lib/wartungsfenster.sh" "$ziel/scripts/lib/"
  cp "$WURZEL/scripts/security/haerten.sh" "$ziel/scripts/security/"
  cat > "$ziel/config/modelle/kurzliste.json" <<'JSON'
{"modelle": [
  {"id": "gross:27b", "aufgabe": "text", "standard": true,
   "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
  {"id": "klein", "aufgabe": "embedding", "standard": true,
   "digest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}
]}
JSON
}

# Die docker-Attrappe. `tags` steht in einer Datei, damit ein Pull sie aendern
# kann; `pull-plan` nennt je Versuch "fehler" oder "ok".
docker_attrappe() {
  local ziel="$1"
  cat > "$ziel/bin/docker" <<'SH'
#!/bin/bash
zustand="$ATTRAPPE"
[ "$1" = inspect ] && exit 1
if [ "$1" = volume ]; then
  # `volume ls` mit oder ohne Filter: die Namen stehen in einer Datei, der
  # Filter `name=^<projekt>_` wird hier nachgebaut.
  filter=$(printf '%s\n' "$@" | sed -n 's/^name=//p')
  if [ -n "$filter" ]; then grep -E "$filter" "$zustand/volumes" || true; else cat "$zustand/volumes"; fi
  exit 0
fi
[ "$1" = compose ] || exit 1
shift
case "$1" in
  ps) echo llm-service; exit 0 ;;
  restart) echo "$2" >> "$zustand/neustarts"; exit 0 ;;
  exec)
    shift; shift; shift   # exec -T llm-service
    case "$*" in
      kill\ *) kill "$@" 2>/dev/null; echo "$*" >> "$zustand/getoetet" ;;
      *api/version*) echo '{"version":"0"}' ;;
      *api/tags*) cat "$zustand/tags" ;;
      *api/pull*)
        echo "versuch" >> "$zustand/versuche"
        [ -f "$zustand/wartung-gesehen" ] || cp "$zustand/../logs/wartung.aktiv" "$zustand/wartung-gesehen" 2>/dev/null
        plan=$(head -1 "$zustand/pull-plan"); sed -i.bak 1d "$zustand/pull-plan"
        # Wie `sh -c 'echo $$; exec curl ...'` im Container: zuerst die PID,
        # ueber die modell-holen.sh den Pull dort beendet.
        echo "$$"
        echo "$$" > "$zustand/pull-pid"
        printf '{"status":"pulling manifest"}\n'
        printf '{"status":"pulling abc","digest":"sha256:abcdef0123456789","total":1000,"completed":500}\n'
        if [ "$plan" = haengt ]; then
          # Wie am Orin: Ollama schickt weiter Zeilen, der Stand bewegt sich nicht.
          while :; do
            printf '{"status":"pulling abc","digest":"sha256:abcdef0123456789","total":1000,"completed":150}\n'
            sleep 0.2
          done
        elif [ "$plan" = fehler ]; then
          printf '{"error":"unexpected EOF"}\n'
        else
          printf '{"status":"pulling abc","digest":"sha256:abcdef0123456789","total":1000,"completed":1000}\n'
          printf '{"status":"verifying sha256 digest"}\n{"status":"success"}\n'
          cp "$zustand/tags-danach" "$zustand/tags"
        fi ;;
    esac ;;
esac
SH
  chmod +x "$ziel/bin/docker"
}

tags() { printf '{"models":[{"name":"%s","digest":"%s"}]}\n' "$1" "$2"; }

# --- 1. modell-holen.sh -------------------------------------------------------
B="$TMP/m1"; baum "$B"; docker_attrappe "$B"; mkdir -p "$B/z"
tags "gross:27b" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" > "$B/z/tags"
echo "LLM_MODEL=gross:27b" > "$B/.env"
aus=$(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" bash scripts/util/modell-holen.sh --pruefen 2>&1); rc=$?
pruefe 'modell-holen: Digest stimmt -> 0' "$(ja [ "$rc" = 0 ])" "rc=$rc $aus"

tags "gross:27b" "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" > "$B/z/tags"
aus=$(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" bash scripts/util/modell-holen.sh --pruefen 2>&1); rc=$?
abweichung=nein
[ "$rc" = 3 ] && grep -q 'DIGEST WEICHT AB' <<<"$aus" && abweichung=ja
pruefe 'modell-holen: Digest weicht ab -> 3, und es wird gesagt' "$abweichung" "rc=$rc"

aus=$(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" bash scripts/util/modell-holen.sh fremd:1b 2>&1); rc=$?
pruefe 'modell-holen: Kennung ausserhalb der Kurzliste -> 1' "$(ja [ "$rc" = 1 ])" "rc=$rc"

# Ein Pull, der beim ersten Mal abbricht und beim zweiten gelingt.
printf '{"models":[]}\n' > "$B/z/tags"
tags "gross:27b" "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" > "$B/z/tags-danach"
printf 'fehler\nok\n' > "$B/z/pull-plan"
aus=$(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" MODELL_HOLEN_PAUSE_SEKUNDEN=0 \
  WARTUNG_TAKT_SEKUNDEN=1 bash scripts/util/modell-holen.sh 2>&1); rc=$?
versuche=$(wc -l < "$B/z/versuche" | tr -d ' ')
wiederholt=nein
[ "$rc" = 0 ] && [ "$versuche" = 2 ] && wiederholt=ja
pruefe 'modell-holen: abgebrochener Pull wird wiederholt und dann geprueft -> 0' \
  "$wiederholt" "rc=$rc versuche=$versuche"
pruefe 'modell-holen: die Ausgabe traegt keine Steuerzeichen' \
  "$(ja bash -c '! LC_ALL=C grep -q "[[:cntrl:]]" <<<"$(tr -d "\n" <<<"$1")"' _ "$aus")"
pruefe 'modell-holen: der Fehler des Pulls steht in der Ausgabe' "$(ja grep -q 'unexpected EOF' <<<"$aus")"
pruefe 'modell-holen: waehrend des Pulls stand das Wartungsfenster' \
  "$(ja grep -q 'modell-holen gross:27b' "$B/z/wartung-gesehen")"
pruefe 'modell-holen: danach ist das Fenster zu (ende=)' "$(ja grep -q 'ende=' "$B/logs/wartung.aktiv")"

# Ein Pull, der stehenbleibt: Zeilen kommen, der Stand nicht (J35, Orin 15 %).
rm -f "$B/z/versuche" "$B/z/neustarts" "$B/z/getoetet"
printf '{"models":[]}\n' > "$B/z/tags"
printf 'haengt\nok\n' > "$B/z/pull-plan"
beginn=$(date +%s)
aus=$(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" MODELL_HOLEN_PAUSE_SEKUNDEN=0 \
  MODELL_HOLEN_STILLSTAND_SEKUNDEN=2 WARTUNG_TAKT_SEKUNDEN=1 bash scripts/util/modell-holen.sh 2>&1); rc=$?
dauer=$(( $(date +%s) - beginn ))
versuche=$(wc -l < "$B/z/versuche" | tr -d ' ')
pruefe 'modell-holen: ein stehender Download wird erkannt und wiederholt -> 0' \
  "$(ja [ "$rc" = 0 ] && [ "$versuche" = 2 ])" "rc=$rc versuche=$versuche $aus"
pruefe 'modell-holen: ... nach Sekunden, nicht nach Stunden' "$(ja [ "$dauer" -lt 30 ])" "${dauer}s"
pruefe 'modell-holen: ... und sagt es' "$(ja grep -q 'Kein Fortschritt seit 2 s' <<<"$aus")"
pruefe 'modell-holen: ... der Pull im Container wird ueber seine PID beendet' \
  "$(ja grep -q '^kill -TERM [0-9]' "$B/z/getoetet")"
pruefe 'modell-holen: ... und llm-service vor dem naechsten Versuch neu gestartet' \
  "$(ja grep -qx llm-service "$B/z/neustarts")"

# SIGTERM mitten im Download: das Fenster geht zu, und es bleibt zu.
rm -f "$B/z/versuche" "$B/z/getoetet" "$B/logs/wartung.aktiv"
printf '{"models":[]}\n' > "$B/z/tags"
printf 'haengt\n' > "$B/z/pull-plan"
(cd "$B" && PATH="$B/bin:$PATH" ATTRAPPE="$B/z" MODELL_HOLEN_STILLSTAND_SEKUNDEN=600 \
  WARTUNG_TAKT_SEKUNDEN=1 exec bash scripts/util/modell-holen.sh >"$B/z/term.log" 2>&1) &
pid=$!
for _ in $(seq 1 50); do [ -s "$B/z/versuche" ] && break; sleep 0.2; done
sleep 1
kill -TERM "$pid"
wait "$pid"; rc=$?
pruefe 'modell-holen: SIGTERM endet mit 143' "$(ja [ "$rc" = 143 ])" "rc=$rc $(cat "$B/z/term.log")"
pruefe 'modell-holen: nach SIGTERM ist das Fenster zu (ende=)' "$(ja grep -q 'ende=' "$B/logs/wartung.aktiv")"
sleep 3
pruefe 'modell-holen: ... und kein Herzschlag macht es danach wieder auf' \
  "$(ja grep -q 'ende=' "$B/logs/wartung.aktiv")" "$(cat "$B/logs/wartung.aktiv")"
haengt_noch=nein
kill -0 "$(cat "$B/z/pull-pid")" 2>/dev/null && haengt_noch=ja
pruefe 'modell-holen: ... und der Pull im Container laeuft nicht als Waise weiter' "$(ja [ "$haengt_noch" = nein ])"

# --nur-env: eine Kennung, die die Kurzliste nicht mehr fuehrt.
printf 'A=1\nLLM_MODEL=hf.co/unsloth/Alt-GGUF:IQ4_XS\nB="x$y"\n' > "$B/.env"
chmod 600 "$B/.env"
(cd "$B" && PATH="$B/bin:$PATH" bash scripts/util/modell-holen.sh --nur-env >/dev/null 2>&1)
pruefe 'modell-holen --nur-env: alte Kennung wird zum Standard der Kurzliste' \
  "$(ja grep -qx 'LLM_MODEL=gross:27b' "$B/.env")"
pruefe 'modell-holen --nur-env: der Rest der .env bleibt Zeichen fuer Zeichen' \
  "$(ja [ "$(grep -v LLM_MODEL "$B/.env")" = "$(printf 'A=1\nB="x$y"')" ])"
rechte=$(stat -c %a "$B/.env" 2>/dev/null || stat -f %Lp "$B/.env")
pruefe 'modell-holen --nur-env: die Rechte der .env bleiben 600' "$(ja [ "$rechte" = 600 ])" "$rechte"

# --- 2. healthcheck.sh ------------------------------------------------------
mkdir -p "$TMP/h/bin"
cat > "$TMP/h/bin/curl" <<'SH'
#!/bin/bash
case "$*" in
  *api/tags*) echo '{"models":[]}' ;;
  *) echo '{"version":"0"}' ;;
esac
SH
chmod +x "$TMP/h/bin/curl"
PATH="$TMP/h/bin:$PATH" OLLAMA_HOST=http://attrappe bash "$WURZEL/services/llm-service/healthcheck.sh" >/dev/null 2>&1
rc=$?
pruefe 'healthcheck: eine leere Modellliste ist gesund' "$(ja [ "$rc" = 0 ])" "rc=$rc"

# --- 3. haerten.sh ----------------------------------------------------------
H="$TMP/s"; baum "$H"
printf 'NODE_ENV=production\n' > "$H/.env"
cat > "$H/bin/sudo-nein" <<'SH'
#!/bin/bash
exit 1
SH
cat > "$H/bin/sudo-ja" <<'SH'
#!/bin/bash
[ "$1" = -n ] && shift
exec "$@"
SH
cat > "$H/bin/sshd" <<'SH'
#!/bin/bash
[ "$1" = -T ] && echo "port $(cat "$ATTRAPPE/port")"
SH
chmod +x "$H/bin/"*
mkdir -p "$H/z"; echo 22 > "$H/z/port"
cat > "$H/scripts/security/harden-ssh.sh" <<'SH'
echo "[3/7] Setting SSH port to $2..."
echo "$2" > "$ATTRAPPE/port"
SH
cat > "$H/scripts/security/setup-firewall.sh" <<'SH'
echo "ERROR: ufw kaputt"
exit 1
SH

if [ "$(id -u)" -ne 0 ]; then
  aus=$(cd "$H" && ARASUL_SUDO="$H/bin/sudo-nein" ARASUL_SSHD="$H/bin/sshd" ATTRAPPE="$H/z" \
    bash scripts/security/haerten.sh 2>&1)
  pruefe 'haerten: ohne passwortloses sudo steht der Grund da' \
    "$(ja grep -q "sudo -n" <<<"$aus")" "$aus"
  pruefe 'haerten: ... und wie man es nachholt' "$(ja grep -q 'Nachholen: sudo bash' <<<"$aus")"
fi

aus=$(cd "$H" && ARASUL_SUDO="$H/bin/sudo-ja" ARASUL_SSHD="$H/bin/sshd" ATTRAPPE="$H/z" \
  bash scripts/security/haerten.sh 2>&1); rc=$?
pruefe 'haerten: gibt immer 0 zurueck' "$(ja [ "$rc" = 0 ])"
pruefe 'haerten: der Portwechsel steht als Warnung da' "$(ja grep -q 'SSH-Port geaendert: 22 -> 2222' <<<"$aus")" "$aus"
pruefe 'haerten: ... und als Zeile fuer eine Maschine' "$(ja grep -qx 'ARASUL_SSH_PORT=2222' <<<"$aus")"
pruefe 'haerten: ... und in config/ssh-port' "$(ja grep -qx 2222 "$H/config/ssh-port")"
pruefe 'haerten: die Ausgabe des Skripts wird gezeigt, nicht verschluckt' \
  "$(ja grep -q 'Setting SSH port to 2222' <<<"$aus")"
pruefe 'haerten: eine gescheiterte Firewall nennt ihren Grund' \
  "$(ja grep -q 'Firewall-Setup fehlgeschlagen: ERROR: ufw kaputt' <<<"$aus")"
pruefe 'haerten: die Firewall bekommt den Port NACH der Haertung' \
  "$(ja grep -q 'SSH 2222' <<<"$aus")"

aus=$(cd "$H" && NODE_ENV=development ARASUL_SUDO="$H/bin/sudo-ja" bash scripts/security/haerten.sh 2>&1)
pruefe 'haerten: ausserhalb von production wird es gesagt' "$(ja grep -q 'uebersprungen: NODE_ENV' <<<"$aus")"

# --- 4. Zurueckgelegte Modelle sind keine Daten eines Geraets (J35) ----------
# Der Werksreset legt die Modell-Volumes zurueck; der Installer darf sie danach
# nicht als Datenbank eines fremden Geraets zaehlen. Beide lesen dieselbe
# Liste aus scripts/lib/installation.sh -- hier gegen die docker-Attrappe.
V="$TMP/v"; mkdir -p "$V/bin" "$V/z"; docker_attrappe "$V"
zustand() {
  PATH="$V/bin:$PATH" ATTRAPPE="$V/z" ARASUL_PROJEKT=arasul-platform bash -c \
    "source '$WURZEL/scripts/lib/installation.sh'; $1"
}
printf 'arasul-platform_arasul-llm-models\narasul-platform_arasul-embeddings-models\n' > "$V/z/volumes"
nur_modelle=ja
zustand zustand_vorhanden && nur_modelle=nein
pruefe 'installation.sh: nur Modell-Volumes -> kein Zustand eines Geraets' "$nur_modelle"
pruefe 'installation.sh: modell_volumes nennt beide' \
  "$(ja [ "$(zustand modell_volumes | wc -l | tr -d ' ')" = 2 ])"
printf 'arasul-platform_arasul-llm-models\narasul-platform_arasul-postgres\n' > "$V/z/volumes"
pruefe 'installation.sh: mit der Datenbank daneben -> Zustand vorhanden' \
  "$(ja zustand zustand_vorhanden)"
pruefe 'installation.sh: ... und genannt wird nur die Datenbank' \
  "$(ja [ "$(zustand zustand_volumes)" = arasul-platform_arasul-postgres ])"
pruefe 'factory-reset.sh: fuehrt keine eigene Liste, sondern liest installation.sh' \
  "$(ja bash -c "! grep -qE '^(modell|arasul)_volumes\\(\\)' '$WURZEL/scripts/setup/factory-reset.sh' && grep -q 'scripts/lib/installation.sh' '$WURZEL/scripts/setup/factory-reset.sh'")"

# --- 5. Der Bootstrap startet, was die Profile einschalten (J35) ------------
# Die Aktualisierung 0.8.10 -> 0.8.11 am Orin nahm den Firmenordner mit `down`
# weg, und `start_services` legte ihn nicht wieder an. Die Funktion dahinter
# wird aus `arasul` gelesen und gegen eine Attrappe gefragt.
P="$TMP/p"; mkdir -p "$P/bin"
cat > "$P/bin/docker" <<'SH'
#!/bin/bash
case "$*" in
  "compose config --services") printf 'postgres-db\nfirmenordner\ndashboard-backend\n' ;;
  "compose ps --status running --services") printf 'postgres-db\ndashboard-backend\n' ;;
esac
SH
chmod +x "$P/bin/docker"
funktion="$(sed -n '/^profil_dienste_ohne_schicht()/,/^}/p' "$WURZEL/arasul")"
aus=$(PATH="$P/bin:$PATH" bash -c "$funktion"$'\n'"profil_dienste_ohne_schicht")
pruefe 'bootstrap: ein Profil-Dienst, der nicht laeuft, wird gestartet' "$(ja [ "$aus" = firmenordner ])" "$aus"
pruefe 'bootstrap: start_services fragt danach' \
  "$(ja bash -c "sed -n '/^start_services()/,/^}/p' '$WURZEL/arasul' | grep -q 'profil_dienste_ohne_schicht'")"

# --- 6. Quelltext -----------------------------------------------------------
pruefe 'setup-mdns.sh ruft kein hostnamectl set-hostname' \
  "$(ja bash -c "! grep -qE 'hostnamectl|/etc/hostname|^[[:space:]]*hostname ' <<<\"\$(grep -v '^[[:space:]]*#' '$WURZEL/scripts/setup/setup-mdns.sh')\"")"
pruefe './arasul ruft die Haertung ueber haerten.sh, ohne 2>/dev/null' \
  "$(ja bash -c "grep -q 'scripts/security/haerten.sh' '$WURZEL/arasul' && ! grep -qE 'harden-ssh.sh|setup-firewall.sh' '$WURZEL/arasul'")"
pruefe './arasul holt das Standardmodell im Bootstrap' \
  "$(ja grep -q '^    standardmodell_holen$' "$WURZEL/arasul")"

echo ""
echo "installation-haertet-und-holt: ${gruen} gruen, ${rot} rot"
[ "$rot" -eq 0 ]
