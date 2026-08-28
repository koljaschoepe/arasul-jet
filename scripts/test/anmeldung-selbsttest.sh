#!/bin/bash
# =============================================================================
# Selbsttest der Shell-Seite der Anmeldung, ohne Geraet (28.08.2026).
# =============================================================================
# Drei Dinge, die sonst nur am Orin auffallen, und dort erst, wenn die Drossel
# wirklich voll ist:
#   1. die Drossel-Helfer in `anmeldung.sh` lesen die Kopfzeilen richtig und
#      warten so lange, wie das Geraet sagt (mit gefaelschten Kopfzeilen);
#   2. `scripts/util/pruefbenutzer.sh` weist ab, was es abweisen muss, und
#      haengt nicht, wenn kein Geraet da ist;
#   3. die drei Skripte sind syntaktisch heil (und shellcheck-sauber, wo es
#      shellcheck gibt).
#
# Aufruf: bash scripts/test/anmeldung-selbsttest.sh
# Rueckgabe 0, wenn jede Frage gruen war.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"
fehler=0
pruefe() {
  if [ "$2" = "$3" ]; then
    echo "gruen  $1"
  else
    echo "ROT    $1 (erwartet '$2', ist '$3')"
    fehler=$((fehler + 1))
  fi
}
ORDNER="$(mktemp -d)"
trap 'rm -rf "$ORDNER"' EXIT

for f in scripts/test/anmeldung.sh scripts/util/pruefbenutzer.sh scripts/test/abnahmen.sh; do
  bash -n "$f"
  pruefe "Syntax $f" 0 $?
done
if command -v shellcheck >/dev/null; then
  shellcheck -S warning scripts/test/anmeldung.sh scripts/util/pruefbenutzer.sh scripts/test/abnahmen.sh
  pruefe "shellcheck" 0 $?
else
  echo "weg    shellcheck fehlt hier"
fi

export ARASUL_DROSSEL_DATEI="$ORDNER/drossel.json"
# shellcheck source=scripts/test/anmeldung.sh
source scripts/test/anmeldung.sh
kopf="$ORDNER/kopf"
namen() { python3 -c 'import json,sys; print(",".join(sorted(json.load(open(sys.argv[1])))))' "$1"; }

printf 'HTTP/2 200\r\nRateLimit-Remaining: 0\r\nRateLimit-Reset: 2\r\n' > "$kopf"
arasul_drossel_merken GET /api/auth/session "$kopf" 200
pruefe "die Sitzungsprobe wird als probe gemerkt" "probe" "$(namen "$ARASUL_DROSSEL_DATEI")"
pruefe "probe: Restzeit 3 s (2 s plus Rand)" "3" "$(_arasul_drossel_py restzeit probe 1)"
pruefe "auth: frei" "0" "$(_arasul_drossel_py restzeit auth 2)"
arasul_drossel_merken GET /api/auth/needs-setup "$kopf" 200
pruefe "needs-setup traegt dieselbe Drossel" "probe" "$(namen "$ARASUL_DROSSEL_DATEI")"
start=$SECONDS
arasul_drossel_abwarten probe 1 2>/dev/null
if [ $((SECONDS - start)) -ge 2 ]; then geschlafen=ja; else geschlafen=nein; fi
pruefe "abwarten hat geschlafen" ja "$geschlafen"

printf 'HTTP/2 429\r\n' > "$kopf"
arasul_drossel_merken POST /api/auth/login "$kopf" 429
pruefe "429 ohne Zahlen: ein Fenster (901 s)" "901" "$(_arasul_drossel_py restzeit anmeldung 1)"
printf 'HTTP/2 200\r\nRateLimit: limit=10, remaining=7, reset=880\r\n' > "$kopf"
arasul_drossel_merken POST /api/auth/login "$kopf" 200
pruefe "gebuendelte Kopfzeile: sieben uebrig, frei fuer zwei" "0" "$(_arasul_drossel_py restzeit anmeldung 2)"
printf 'HTTP/2 200\r\nRateLimit-Remaining: 99\r\n' > "$kopf"
arasul_drossel_merken GET /api/apps "$kopf" 200
pruefe "ein Weg ohne Drossel steht nicht in der Datei" "anmeldung,probe" "$(namen "$ARASUL_DROSSEL_DATEI")"

ARASUL_PASSWORT= bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
pruefe "pruefbenutzer ohne Passwort: 2" 2 $?
ARASUL_BENUTZER="x'; drop" ARASUL_PASSWORT=p bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
pruefe "pruefbenutzer mit unzulaessigem Namen: 2" 2 $?
# Kein Container hier, kein Geraet unter dem Namen: ein Fehler in Sekunden,
# kein Haenger. 124 waere die Zeitgrenze von `timeout`.
ARASUL_GERAET=gibt-es-nicht.invalid ARASUL_PASSWORT=p timeout 60 bash scripts/util/pruefbenutzer.sh >/dev/null 2>&1
rc=$?
if [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ]; then ohne=ja; else ohne="nein ($rc)"; fi
pruefe "pruefbenutzer ohne Geraet: Fehler, kein Haenger" ja "$ohne"

# DER GELUNGENE FALL, mit einem gefaelschten `docker` statt eines Geraets.
#
# Bis zum 28.08.2026 kannte dieser Selbsttest nur die drei Wege, auf denen
# `pruefbenutzer.sh` ABLEHNT. Der Weg, auf dem es wirklich einen Benutzer
# anlegt, war nie gelaufen -- und trug zwei Fehler, die beide erst auffielen,
# als nach dem Werksreset zum ersten Mal jemand einen Benutzer brauchte:
#
#   1. Der Ersatz fuer `\x27` setzte `\'` statt `'` ein (Backslash und
#      Apostroph stehen in doppelten Anfuehrungszeichen beide fuer sich
#      selbst). psql sah `\'pruefer` und sagte "invalid command".
#   2. `RETURNING` gibt eine Zeile aus, danach schreibt psql `INSERT 0 1`.
#      Der Vergleich las beides als einen Text und meldete den gelungenen
#      Anlauf als Fehler.
#
# Beide sind hier zu sehen, ohne Geraet: der Stub nimmt die SQL entgegen,
# legt sie ab und antwortet wie psql -- mit Quittung.
stub=$(mktemp -d)
sql="$stub/sql.txt"
cat > "$stub/docker" <<'STUB'
#!/bin/bash
case "$1" in
  inspect) echo true ;;
  exec)
    shift
    while [ "${1:0:1}" = "-" ]; do shift; done   # -i
    shift                                        # Containername
    if [ "$1" = "psql" ]; then
      cat > "$ARASUL_STUB_SQL"
      # Genau wie psql: die Zeile aus RETURNING, dann der Befehlsanhang.
      printf 'angelegt\nINSERT 0 1\n'
    else
      cat > /dev/null
      printf '$2b$12$0123456789012345678901234567890123456789012'
    fi
    ;;
esac
STUB
chmod +x "$stub/docker"
ausgabe=$(PATH="$stub:$PATH" ARASUL_STUB_SQL="$sql" ARASUL_BENUTZER=pruefer \
  ARASUL_PASSWORT='geheim' bash scripts/util/pruefbenutzer.sh 2>&1)
pruefe "pruefbenutzer legt an: Rueckgabe 0" 0 $?

gemeldet="nein ($ausgabe)"
if [[ "$ausgabe" == *"pruefer angelegt"* ]]; then gemeldet=ja; fi
pruefe "pruefbenutzer meldet, was geschah" ja "$gemeldet"

sauber="nein ($(grep -o "..pruefer.." "$sql" 2>/dev/null | head -n1))"
if grep -q "'pruefer'" "$sql" 2>/dev/null &&
   ! grep -q "\\\\'" "$sql" && ! grep -q 'x27' "$sql"; then sauber=ja; fi
pruefe "die SQL traegt Apostrophe, keine Backslashes" ja "$sauber"
rm -rf "$stub"

if [ "$fehler" = 0 ]; then echo "alles gruen"; else echo "$fehler rot"; fi
exit "$fehler"
