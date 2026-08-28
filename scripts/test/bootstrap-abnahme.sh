#!/bin/bash
# =============================================================================
# Abnahme des Bootstraps auf einem leeren Geraet (Phase C10, 28.08.2026)
# =============================================================================
# WOZU ES DIESES SKRIPT GIBT
#
# Am 27.08.2026 galt die Auslieferung als fertig: die CI baute ein Artefakt,
# das Release hing am Repo, `install.sh` lag im Wurzelverzeichnis. Einen Tag
# spaeter, beim ersten echten Werksreset am Orin, lief die Installation NICHT
# ohne Hand durch. Fuenf Funde, jeder einzeln belegt, jeder eine Zeile:
#
#   1. Der Werksreset rief `preconfigure.sh` und zog dabei ein Modell, das es
#      seit der Kurzliste nicht mehr gibt -- dreissig Minuten gegen einen
#      Dienst, der noch startete. Danach gehoerte die `.env` root.
#   2. `validate-dependencies.sh` suchte `scripts/docker-compose.yml`: ein
#      `dirname` zu wenig. Der Bootstrap brach auf JEDEM frischen Geraet ab.
#   3. `check_registry_reachable` las die 401 von `registry-1.docker.io/v2/`
#      als "keine Verbindung" (`curl -sfI`). Bootstrap ab.
#   4. `tailscale serve` hielt 443 der Tailscale-Adresse, Traefik bekam
#      `0.0.0.0:443` nicht mehr, der reverse-proxy startete nicht.
#   5. Der Bootstrap endete mit Rueckgabewert 1 nach "Waiting for Dashboard..."
#      -- eine Zuweisung aus einer `grep`-Pipe unter `pipefail`. Danach kein
#      document-indexer, kein self-healing-agent, und weder Startpasswort noch
#      Kit-Schluessel wurden je ausgegeben.
#
# KEINER DAVON WAERE VON EINEM TEST GEFUNDEN WORDEN, weil es keinen gab, der
# eine Installation von vorn durchspielt. Das ist dieses Skript.
#
# DER ZWEITE WERKSRESET, spaeter am 28.08.2026 (Release v0.2.0): alles oben war
# zu. Zehn Container healthy, Administrator und Kit-Schluessel angelegt,
# `https://arasul/` mit dem CA-Zertifikat erreichbar -- und `install.sh` endete
# trotzdem mit Rueckgabewert 1. Der Rauchtest am Ende des Bootstraps stiess
# jeden Dienst EINMAL an, statt wie der Deploy auf ihn zu warten: das
# dashboard-frontend war neun Sekunden spaeter healthy, der self-healing-agent
# noch in seiner Startphase. Danach "Critical tests failed", der Fehlerbericht,
# und die Zusammenfassung -- Startpasswort und Kit-Schluessel -- erschien nie,
# denn sie stand im gruenen Zweig. Der Schluessel war angelegt und hat ihn
# niemand gesehen. Abschnitt 8 misst beides.
#
# ZWEI BETRIEBSARTEN
#
#   --trocken     alles, was OHNE laufende Container geht. Laeuft in der CI
#                 (Job "Installation") gegen ein frisch ausgepacktes Artefakt.
#   (ohne)        zusaetzlich das Ergebnis am Geraet: welche Container laufen,
#                 ob es einen Admin und einen Kit-Schluessel gibt, ob
#                 `/api/health` eine Fassung aus dem Bau nennt.
#
# AM GERAET, NACH DEM WERKSRESET:
#
#   sudo bash scripts/setup/factory-reset.sh
#   ./install.sh
#   bash scripts/test/bootstrap-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

TROCKEN=false
[ "${1:-}" = "--trocken" ] && TROCKEN=true

gruen=0
rot=0
uebersprungen=0

pruefe() { # was, ja|nein, detail
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
uebergehen() {
  uebersprungen=$((uebersprungen + 1))
  printf '  --   %s%s\n' "$1" "${2:+  ($2)}"
}
ja_nein() { if [ "$1" -eq 0 ]; then echo ja; else echo nein; fi; }

# Nur die Zeilen, die die Shell wirklich ausfuehrt. Ohne das misst jede
# Suche nach einem Befehl auch die Kommentare, die erklaeren, warum es ihn
# nicht mehr gibt -- der erste Wurf dieses Skripts hat sich genau daran
# selbst rot gemeldet.
ohne_kommentar() { sed 's/[[:space:]]*#.*$//' "$@" 2>/dev/null; }

# Steht dieser Befehl in einer dieser Dateien, ausserhalb eines Kommentars?
steht_in() { # muster, datei...
  local muster="$1"; shift
  # Hier-String statt Rohr: `grep -q` steigt beim ersten Treffer aus, `sed`
  # schreibt weiter in ein geschlossenes Rohr und endet mit 141, und unter
  # `pipefail` waere die Antwort dann falsch -- gerade WEIL der gesuchte Text
  # da ist (scripts/test/rohrbruch.py).
  grep -qE "$muster" <<<"$(ohne_kommentar "$@")"
}

echo "=== Abnahme des Bootstraps (Phase C10) in $WURZEL ==="
[ "$TROCKEN" = true ] && echo "    Betriebsart: trocken (ohne laufende Container)"
echo

# -----------------------------------------------------------------------------
# 1. Jedes Skript ist syntaktisch heil
# -----------------------------------------------------------------------------
# Billig und trotzdem der haerteste Filter gegen "das Skript bricht am Geraet
# ab": ein Tippfehler in einem Zweig, den nur ein frisches Geraet nimmt, faellt
# sonst genau dort auf und nirgends vorher.
echo "--- 1. Syntax aller Skripte ---"
kaputt=""
gezaehlt=0
while read -r datei; do
  [ -n "$datei" ] || continue
  # `.test.sh` unter scripts/test/setup sind BATS-Dateien: `@test "..." {` ist
  # fuer die Bash ein Syntaxfehler und fuer bats der Normalfall. Gemessen wird
  # am Schebang, nicht am Namen.
  case "$(head -1 "$datei")" in
    *bats*) continue ;;
  esac
  gezaehlt=$((gezaehlt + 1))
  bash -n "$datei" 2>/dev/null || kaputt="${kaputt} ${datei}"
done <<<"$(find scripts -name '*.sh' -type f; echo arasul; echo install.sh)"
pruefe 'Jedes Skript ueberlebt `bash -n`' \
  "$([ -z "$kaputt" ] && echo ja || echo nein)" "${kaputt:-${gezaehlt} Skripte, alle heil}"

# -----------------------------------------------------------------------------
# 2. Fund 2: jedes Skript findet sein eigenes Wurzelverzeichnis
# -----------------------------------------------------------------------------
echo
echo "--- 2. Wurzelverzeichnisse (Fund 2 vom 28.08.2026) ---"
python3 scripts/test/wurzelpfad.py --wurzel . >/dev/null 2>&1
pruefe 'Kein Skript rechnet sein Wurzelverzeichnis falsch aus' "$(ja_nein $?)"

if [ -f docker-compose.yml ]; then
  # Genau der Aufruf, an dem der Bootstrap am 28.08.2026 abbrach. Gemessen wird
  # NICHT, ob der Validator gruen ist (das braucht Docker), sondern ob er seine
  # Compose-Datei ueberhaupt findet.
  ausgabe=$(bash scripts/validate/validate-dependencies.sh 2>&1)
  if grep -q 'not found\|nicht gefunden' <<<"$ausgabe"; then
    pruefe 'validate-dependencies.sh findet docker-compose.yml' nein 'meldet "not found"'
  else
    pruefe 'validate-dependencies.sh findet docker-compose.yml' ja
  fi
fi

# -----------------------------------------------------------------------------
# 3. Fund 1: der Werksreset installiert nichts
# -----------------------------------------------------------------------------
echo
echo "--- 3. Der Werksreset (Fund 1) ---"
reset=scripts/setup/factory-reset.sh
if [ -f "$reset" ]; then
  if steht_in 'preconfigure\.sh' "$reset"; then
    pruefe 'Der Werksreset ruft preconfigure.sh NICHT' nein 'der Aufruf steht wieder drin'
  else
    pruefe 'Der Werksreset ruft preconfigure.sh NICHT' ja
  fi
  if steht_in 'ollama pull' "$reset"; then
    pruefe 'Der Werksreset zieht kein Modell' nein
  else
    pruefe 'Der Werksreset zieht kein Modell' ja
  fi
  # Seit dem 28.08.2026 nicht mehr nur `arasul-app-*`: am Orin ueberlebten
  # zehn `arasul-sandbox-*` und ein `arasul-skills-sandbox` den Reset, weil
  # `docker compose down` sie nicht kennt und der Filter sie nicht traf.
  # Gemessen wird an beiden Merkmalen der neuen Regel: Name und Etikett.
  if steht_in '\^arasul-' "$reset" && steht_in '\{\{\.Labels\}\}' "$reset"; then
    pruefe 'Der Werksreset entfernt jeden Container mit Name arasul-* oder Etikett arasul.*' ja
  else
    pruefe 'Der Werksreset entfernt jeden Container mit Name arasul-* oder Etikett arasul.*' nein \
      'weder der Namensfilter noch die Etikettenpruefung stehen drin'
  fi
  if steht_in 'docker volume rm' "$reset"; then
    pruefe 'Der Werksreset entfernt die Volumes des Geraets' ja
  else
    pruefe 'Der Werksreset entfernt die Volumes des Geraets' nein
  fi
  if steht_in 'SUDO_UID' "$reset"; then
    pruefe 'Der Werksreset gibt das Verzeichnis an den Benutzer zurueck' ja
  else
    pruefe 'Der Werksreset gibt das Verzeichnis an den Benutzer zurueck' nein
  fi
else
  uebergehen 'Der Werksreset' 'scripts/setup/factory-reset.sh fehlt'
fi

# -----------------------------------------------------------------------------
# 4. Fund 4: niemand nimmt Traefik den Port 443 weg
# -----------------------------------------------------------------------------
echo
echo "--- 4. Port 443 gehoert Traefik (Fund 4) ---"
# Gesucht wird dort, wo der Befehl WIRKLICH abgesetzt wuerde -- nicht unter
# `scripts/test/`, denn dort steht er in genau dieser Zeile, und eine Pruefung,
# die sich selbst findet, ist immer rot.
setzt_serve=""
while read -r datei; do
  [ -n "$datei" ] || continue
  if steht_in 'tailscale serve --bg' "$datei"; then
    setzt_serve="${setzt_serve} ${datei}"
  fi
done <<<"$(grep -rl 'tailscale serve --bg' \
  scripts/setup scripts/util scripts/ops scripts/system \
  apps/dashboard-backend/src 2>/dev/null || true)"
pruefe 'Kein Skript und kein Dienst schaltet `tailscale serve` ein' \
  "$([ -z "$setzt_serve" ] && echo ja || echo nein)" "${setzt_serve:-nur noch in Kommentaren}"

# -----------------------------------------------------------------------------
# 5. Fund 5: die .env, wie docker compose sie liest
# -----------------------------------------------------------------------------
echo
echo "--- 5. Die .env (Fund 5) ---"
if [ -f .env ]; then
  fassung=$(grep '^SYSTEM_VERSION=' .env 2>/dev/null | tail -1 | cut -d= -f2- || true)
  case "${fassung:-}" in
    ''|Vorserie|0.0.0)
      pruefe 'SYSTEM_VERSION steht in der .env und kommt aus dem Bau' nein "${fassung:-leer}" ;;
    *)
      pruefe 'SYSTEM_VERSION steht in der .env und kommt aus dem Bau' ja "$fassung" ;;
  esac

  # Ein `$` in einem Wert laesst docker compose bei JEDEM Aufruf nach einer
  # Variablen suchen, die es nicht gibt ("The dvbE0IB... variable is not set").
  # Einfache Anfuehrungszeichen schalten das ab.
  offen=$(grep -nE '^[A-Za-z_][A-Za-z0-9_]*=[^'"'"'#]*\$' .env 2>/dev/null | cut -d: -f1 | paste -sd, - || true)
  pruefe 'Kein Wert in der .env traegt ein ungeschuetztes Dollarzeichen' \
    "$([ -z "$offen" ] && echo ja || echo nein)" "${offen:+Zeilen $offen}"

  hash_zeile=$(grep '^ADMIN_HASH=' .env 2>/dev/null | tail -1 || true)
  if [ -n "$hash_zeile" ]; then
    case "$hash_zeile" in
      ADMIN_HASH=\'*\') pruefe 'Der bcrypt-Hash steht in Anfuehrungszeichen' ja ;;
      *) pruefe 'Der bcrypt-Hash steht in Anfuehrungszeichen' nein "$(cut -c1-24 <<<"$hash_zeile")..." ;;
    esac
  else
    uebergehen 'Der bcrypt-Hash steht in Anfuehrungszeichen' 'kein ADMIN_HASH in der .env'
  fi
else
  uebergehen 'Die .env' 'noch keine .env -- lief install.sh?'
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1 && [ -f .env ]; then
  # `config` liest die .env und die Compose-Dateien, startet aber nichts. Jede
  # Zeile auf stderr ist eine Warnung, und die haeufigste ist genau die oben.
  meckern=$(docker compose config -q 2>&1 >/dev/null || true)
  pruefe 'docker compose liest die Konfiguration ohne Warnung' \
    "$([ -z "$meckern" ] && echo ja || echo nein)" "$(head -1 <<<"${meckern:-}")"
else
  uebergehen 'docker compose liest die Konfiguration ohne Warnung' 'kein docker oder keine .env'
fi

# -----------------------------------------------------------------------------
# 6. Fund 3: die Registry gilt als erreichbar, wenn sie antwortet
# -----------------------------------------------------------------------------
echo
echo "--- 6. Die Registry-Pruefung (Fund 3) ---"
if steht_in 'curl -sfI' arasul; then
  pruefe 'Die Registry-Pruefung wertet nicht mehr `curl -sfI` aus' nein 'der Aufruf steht wieder drin'
else
  pruefe 'Die Registry-Pruefung wertet nicht mehr `curl -sfI` aus' ja
fi

# Traefik leitet :80 dauerhaft auf :443 um. Eine 301 ist fuer `curl -f` kein
# Fehler -- `-f` schlaegt erst ab 400 an --, also war jede Messung des
# Dashboards ueber Port 80 gruen, sobald Traefik lief, und sagte ueber das
# Backend gar nichts. Sie haette einen toten Dienst als "OK" gemeldet.
if steht_in 'curl [^|]*http://localhost:\$\{?(dash_port|smoke_port)' arasul; then
  pruefe 'Der Bootstrap misst die Oberflaeche ueber HTTPS, nicht ueber die Umleitung' \
    nein 'es wird wieder Port 80 gemessen'
else
  pruefe 'Der Bootstrap misst die Oberflaeche ueber HTTPS, nicht ueber die Umleitung' ja
fi

if [ "$TROCKEN" = false ] && command -v curl >/dev/null 2>&1; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -I --max-time 5 https://registry-1.docker.io/v2/ 2>/dev/null || true)
  if [ -n "$code" ] && [ "$code" != "000" ]; then
    pruefe 'registry-1.docker.io antwortet' ja "HTTP $code (401 ist die richtige Antwort)"
  else
    pruefe 'registry-1.docker.io antwortet' nein 'keine Antwort -- offline?'
  fi
else
  uebergehen 'registry-1.docker.io antwortet' 'trocken'
fi

# -----------------------------------------------------------------------------
# 7. Das Ergebnis am Geraet
# -----------------------------------------------------------------------------
echo
echo "--- 7. Was nach dem Bootstrap laeuft ---"
if [ "$TROCKEN" = true ] || ! command -v docker >/dev/null 2>&1; then
  uebergehen 'Die Container der Plattform' 'trocken oder kein Docker'
  uebergehen 'Der Kit-Schluessel aus dem Bootstrap' 'trocken oder kein Docker'
  uebergehen 'Die Oberflaeche antwortet' 'trocken oder kein Docker'
  uebergehen 'Keine App-Container aus der Zeit vor dem Reset' 'trocken oder kein Docker'
else
  laufen=$(docker ps --format '{{.Names}}' 2>/dev/null || true)
  # Genau die beiden, die am 28.08.2026 fehlten, weil der Bootstrap vorher
  # starb -- und die drei davor, ohne die nichts geht.
  fehlend=""
  for dienst in postgres-db reverse-proxy dashboard-backend dashboard-frontend \
                document-indexer self-healing-agent; do
    grep -qx "$dienst" <<<"$laufen" || fehlend="${fehlend} ${dienst}"
  done
  pruefe 'Der Bootstrap ist bis zum letzten Dienst gelaufen' \
    "$([ -z "$fehlend" ] && echo ja || echo nein)" "${fehlend:+es fehlen:$fehlend}"

  apps=$(grep -c '^arasul-app-' <<<"$laufen" || true)
  pruefe 'Keine App-Container aus der Zeit vor dem Reset' \
    "$([ "${apps:-0}" -eq 0 ] && echo ja || echo nein)" "${apps:-0} gefunden"

  liste=$(bash scripts/util/kit-schluessel.sh liste 2>/dev/null || true)
  grep -q '^gueltig' <<<"$liste"
  pruefe 'Es gibt einen gueltigen Kit-Schluessel' "$(ja_nein $?)"

  # UEBER HTTPS und ohne Rueckfall auf Port 80. Traefik leitet den ganzen
  # Einstiegspunkt `web` dauerhaft auf `websecure` um; eine Messung auf Port 80
  # bekommt eine 301 und sagt ueber das Backend nichts. Genau daran haben die
  # Rauchtests des Bootstraps bis zum 28.08.2026 "OK" gemeldet.
  port=$(grep '^HTTPS_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2 || true)
  basis="https://localhost"
  [ -n "${port:-}" ] && [ "$port" != "443" ] && basis="https://localhost:${port}"
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 \
    "${basis}/api/health" 2>/dev/null || true)
  pruefe 'Die Oberflaeche antwortet auf /api/health' \
    "$([ "$code" = "200" ] && echo ja || echo nein)" "${basis} -> HTTP ${code:-000}"
fi

# -----------------------------------------------------------------------------
# 8. Die Erstausgabe: Startpasswort und Kit-Schluessel, einmal und immer
# -----------------------------------------------------------------------------
# Der Fund des zweiten Versuchs (28.08.2026, Release v0.2.0): die Installation
# war in Ordnung -- zehn Container healthy, Admin und Kit-Schluessel angelegt --
# und trotzdem endete `install.sh` mit Rueckgabewert 1, weil der Rauchtest nicht
# wartete. Die Zusammenfassung stand im gruenen Zweig und erschien deshalb nie.
# Der Kit-Schluessel war angelegt und hat nie jemand gesehen.
echo
echo "--- 8. Die Erstausgabe (Fund vom 28.08.2026) ---"

# 8a. Der Rauchtest wartet, statt einmal zu stossen.
if steht_in 'dienst_pruefen' arasul && steht_in 'wait_for_healthy "\$dienst"' arasul; then
  pruefe 'Der Rauchtest wartet je Dienst mit Zeitgrenze' ja
else
  pruefe 'Der Rauchtest wartet je Dienst mit Zeitgrenze' nein 'kein wait_for_healthy je Dienst'
fi
if steht_in 'pgrep -f healing_engine' arasul; then
  pruefe 'Der Rauchtest sucht den Heil-Prozess NICHT mehr mit pgrep' nein 'der Aufruf steht wieder drin'
else
  pruefe 'Der Rauchtest sucht den Heil-Prozess NICHT mehr mit pgrep' ja 'Health-Status des Containers'
fi

# 8b. Die Zusammenfassung steht VOR dem Fehlerbericht und in keinem Zweig.
# Gemessen an der Reihenfolge der Zeilen, denn genau die war der Fehler.
zeile_ausgabe=$(grep -n '^    show_completion_summary$' arasul 2>/dev/null | tail -1 | cut -d: -f1 || true)
zeile_bericht=$(grep -n 'generate_error_report 1 "smoke_tests"' arasul 2>/dev/null | tail -1 | cut -d: -f1 || true)
if [ -n "${zeile_ausgabe:-}" ] && [ -n "${zeile_bericht:-}" ] && [ "$zeile_ausgabe" -lt "$zeile_bericht" ]; then
  pruefe 'Die Erstausgabe steht vor dem Fehlerbericht' ja "Zeile $zeile_ausgabe vor $zeile_bericht"
else
  pruefe 'Die Erstausgabe steht vor dem Fehlerbericht' nein \
    "Ausgabe Zeile ${zeile_ausgabe:-keine}, Fehlerbericht Zeile ${zeile_bericht:-keine}"
fi

# 8c. Das Skript selbst, ausgefuehrt: es schreibt die Datei, und zwar mit 600.
#     Kein Blick in den Quelltext -- der Lauf ist der Beleg.
if [ -f scripts/util/erstausgabe.sh ]; then
  probe_ordner=$(mktemp -d)
  probe_datei="${probe_ordner}/erstausgabe.txt"
  probe_ausgabe=$(bash scripts/util/erstausgabe.sh \
    --passwort 'ProbeStartpasswort9' --schluessel 'aras_probeschluessel' \
    --datei "$probe_datei" 2>&1 || true)

  grep -q 'ProbeStartpasswort9' <<<"$probe_ausgabe" &&
    grep -q 'aras_probeschluessel' <<<"$probe_ausgabe"
  pruefe 'Die Erstausgabe nennt beide Geheimnisse auf der Konsole' "$(ja_nein $?)"

  if [ -f "$probe_datei" ]; then
    rechte=$(stat -c '%a' "$probe_datei" 2>/dev/null || stat -f '%Lp' "$probe_datei" 2>/dev/null || echo '?')
    pruefe 'erstausgabe.txt hat die Rechte 600' \
      "$([ "$rechte" = "600" ] && echo ja || echo nein)" "Rechte $rechte"

    grep -q 'ProbeStartpasswort9' "$probe_datei" && grep -q 'aras_probeschluessel' "$probe_datei"
    pruefe 'erstausgabe.txt traegt beide Geheimnisse' "$(ja_nein $?)"

    grep -qi 'LOESCHEN' "$probe_datei"
    pruefe 'erstausgabe.txt sagt, dass sie zu loeschen ist' "$(ja_nein $?)"
  else
    pruefe 'erstausgabe.txt wird geschrieben' nein "$probe_datei fehlt"
  fi

  # Ohne Geheimnis wird nichts geschrieben: ein zweiter Bootstrap-Lauf kennt
  # das Startpasswort nicht mehr und darf die Erstausgabe nicht leeren.
  leer_datei="${probe_ordner}/leer.txt"
  bash scripts/util/erstausgabe.sh --datei "$leer_datei" >/dev/null 2>&1 || true
  pruefe 'Ohne Geheimnis wird keine Erstausgabe geschrieben' \
    "$([ ! -f "$leer_datei" ] && echo ja || echo nein)"

  rm -rf "$probe_ordner"
else
  pruefe 'scripts/util/erstausgabe.sh gibt es' nein 'Datei fehlt'
fi

# 8d. Am Geraet: die Datei liegt wirklich da, direkt nach der Installation.
if [ "$TROCKEN" = true ]; then
  uebergehen 'config/secrets/erstausgabe.txt liegt am Geraet' 'trocken'
elif [ -f config/secrets/erstausgabe.txt ]; then
  rechte=$(stat -c '%a' config/secrets/erstausgabe.txt 2>/dev/null || echo '?')
  grep -q 'aras_' config/secrets/erstausgabe.txt
  treffer=$?
  pruefe 'config/secrets/erstausgabe.txt liegt am Geraet und nennt den Kit-Schluessel' \
    "$([ "$rechte" = "600" ] && [ "$treffer" -eq 0 ] && echo ja || echo nein)" "Rechte $rechte"
else
  pruefe 'config/secrets/erstausgabe.txt liegt am Geraet' nein \
    'Datei fehlt -- schon geloescht, oder der Bootstrap hat sie nie geschrieben'
fi

echo
echo "=== $gruen gruen, $rot rot, $uebersprungen uebersprungen ==="
if [ "$rot" -gt 0 ]; then
  exit 1
fi
if [ "$TROCKEN" = true ]; then
  echo
  echo "Trocken gemessen. Was nur am Geraet zu messen ist:"
  echo "  sudo bash scripts/setup/factory-reset.sh"
  echo "  ./install.sh"
  echo "  bash scripts/test/bootstrap-abnahme.sh"
fi
exit 0
