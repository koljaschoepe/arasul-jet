#!/bin/bash
# =============================================================================
# sicherung-staende.sh — die Staende der Sicherung, ohne Geraet (M5, 03.10.2026)
# =============================================================================
# Prueft `services/backup-service/staende.sh` mit echtem restic an
# Wegwerfordnern. Was am Orin gemessen wird (scripts/test/sicherung-staende-abnahme.sh),
# steht dort; hier steht, was sich ohne Geraet sagen laesst, und zwar so, dass
# jede Pruefung auch rot werden KANN:
#
#   1. Zwei Laeufe hintereinander: der zweite schreibt weniger als ein Viertel
#      des ersten (nur das Geaenderte), und beide Staende sind einzeln
#      auflistbar und kommen Byte fuer Byte zurueck, jeder in seinen eigenen
#      Ordner.
#   2. Zurueckgeholt wird nie ueber laufende Daten: /arasul/... und ein
#      nicht leerer Ordner werden abgewiesen.
#   3. Im Repo liegt nur Chiffrat (0 Klartext), und die Pruefung sieht es,
#      wenn doch nicht: ein eingeschmuggeltes gzip, eine veraenderte
#      Schluesselhuelle, ein Tagesordner-Archiv ohne `Salted__`.
#   4. Aufbewahrung 7 Tage, 12 Wochen, 60 Monate an 6 Jahren nachgestellter
#      Naechte -- verglichen mit einer EIGENEN Nachrechnung der Regel, nicht
#      mit restic gegen sich selbst.
#   5. Wer waehrend des Laufs schreibt, laesst den Stand nicht scheitern (der
#      Fall vom 27.09.2026, J35), und alles, was vorher da war, kommt zurueck.
#   6. Ist das Ziel voll, faellt der aelteste Stand (mit Hinweis), der neue
#      steht. Braucht ein kleines Dateisystem: tmpfs ueber `sudo -n` (die CI
#      hat das), sonst wird der Punkt mit Begruendung uebersprungen.
#   7. Ein anderer Schluessel bekommt ein anderes Repo, das alte bleibt.
#   8. Das Image bringt mit, was gebraucht wird.
#
# Braucht restic (>= 0.16), jq, GNU find/stat/coreutils. Am Mac:
#   brew install restic jq findutils coreutils gnu-tar
#
# Aufruf: bash scripts/test/sicherung-staende.sh   (BEHALTEN=1 laesst TMP stehen)
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIENST="$WURZEL/services/backup-service"

for gnu in findutils coreutils gnu-tar; do
  [ -d "/opt/homebrew/opt/$gnu/libexec/gnubin" ] && PATH="/opt/homebrew/opt/$gnu/libexec/gnubin:$PATH"
done
for werkzeug in restic jq sha256sum; do
  if ! command -v "$werkzeug" >/dev/null 2>&1; then
    echo "FEHLT: $werkzeug"
    exit 1
  fi
done
if ! grep -q GNU <<<"$(find --version 2>/dev/null)"; then
  echo "FEHLT: GNU find (am Mac: brew install findutils)"
  exit 1
fi

TMP="$(mktemp -d)"
EINGEHAENGT=""
SCHREIBER=""
aufraeumen() {
  [ -n "$SCHREIBER" ] && kill "$SCHREIBER" 2>/dev/null
  [ -n "$EINGEHAENGT" ] && sudo -n umount "$EINGEHAENGT" 2>/dev/null
  chmod -R u+rwx "$TMP" 2>/dev/null
  rm -rf "$TMP"
}
trap aufraeumen EXIT
[ -n "${BEHALTEN:-}" ] && trap - EXIT && echo "TMP=$TMP"

gruen=0
rot=0
pruefe() {
  if [ "$2" = ja ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$1" "${3:+  ($3)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$1" "${3:+  ($3)}"
  fi
}
ja() { if "$@"; then echo ja; else echo nein; fi; }

export TZ=UTC
export BACKUP_STAND_CACHE="$TMP/cache"
export BACKUP_ENCRYPT_KEY_FILE="$TMP/schluessel"
head -c 20 /dev/urandom | base32 | tr -d '=\n' >"$BACKUP_ENCRYPT_KEY_FILE"
# shellcheck source=../../services/backup-service/staende.sh
source "$DIENST/staende.sh"
S="$BACKUP_ENCRYPT_KEY_FILE"

baum_abdruck() { # ordner -> sha256 je Datei, relativ, sortiert
  (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
}

echo "Staende der Sicherung (restic $(restic version | awk '{print $2}'))"

# --- 1. Zwei Laeufe -------------------------------------------------------------
Q="$TMP/quelle"
mkdir -p "$Q/firmenordner/vertraege" "$Q/apps/demo" "$Q/datenbank"
for i in $(seq 1 12); do
  head -c 1048576 /dev/urandom >"$Q/firmenordner/vertraege/vertrag$i.bin"
done
for i in $(seq 1 200); do
  echo "Zeile $i einer Regel, die sich selten aendert" >>"$Q/firmenordner/regeln.txt"
done
python3 -c 'import random,sys; random.seed(7); sys.stdout.write("".join("INSERT INTO t VALUES (%d, %r);\n" % (i, "x"*random.randint(20,80)) for i in range(40000)))' >"$Q/datenbank/arasul_db.sql"
echo '{"id":"demo"}' >"$Q/apps/demo/app.json"
baum_abdruck "$Q" >"$TMP/stand1.sha"

REPO="$(stand_repo "$TMP/ziel" "$S")"
pruefe "das Repo traegt den Abdruck des Schluessels im Namen" \
  "$(ja [ "$(basename "$REPO")" = "staende-$(stand_abdruck "$S")" ])" "$(basename "$REPO")"

stand_sichern "$REPO" "$S" "$Q"
RC1=$?
ID1="$STAND_ID"
G1="$STAND_GESCHRIEBEN"
pruefe "Lauf 1 legt einen Stand an" "$(ja [ "$RC1" = 0 ] && [ -n "$ID1" ])" "${STAND_FEHLER:-${ID1:0:8}, ${G1} Bytes}"

# Was eine Nacht im Alltag aendert: ein neuer Vertrag, eine Zeile in der
# Regel, ein paar Zeilen in der Datenbank.
head -c 1048576 /dev/urandom >"$Q/firmenordner/vertraege/vertrag-neu.bin"
echo "Neue Zeile" >>"$Q/firmenordner/regeln.txt"
sed -i.bak '100,110s/x/y/' "$Q/datenbank/arasul_db.sql" && rm -f "$Q/datenbank/arasul_db.sql.bak"
baum_abdruck "$Q" >"$TMP/stand2.sha"
sleep 1
stand_sichern "$REPO" "$S" "$Q"
RC2=$?
ID2="$STAND_ID"
G2="$STAND_GESCHRIEBEN"
pruefe "Lauf 2 legt einen Stand an" "$(ja [ "$RC2" = 0 ] && [ -n "$ID2" ] && [ "$ID2" != "$ID1" ])" "${STAND_FEHLER:-${ID2:0:8}}"
pruefe "Lauf 2 schreibt nur das Geaenderte (< 1/4 von Lauf 1)" \
  "$(ja [ "$G2" -gt 0 ] && [ $((G2 * 4)) -lt "$G1" ])" "Lauf 1 ${G1} Bytes, Lauf 2 ${G2} Bytes"

LISTE="$(stand_liste "$REPO" "$S")"
pruefe "beide Staende einzeln auflistbar" \
  "$(ja [ "$(jq -r '[.[].id] | join(" ")' <<<"$LISTE")" = "$ID1 $ID2" ])" "$(jq -c '[.[].kurz]' <<<"$LISTE")"
BEFEHL_LISTE="$(BACKUP_DIR="$TMP/ziel" bash "$DIENST/staende.sh" liste 2>&1)"
pruefe "die Liste als Befehl (staende.sh liste)" \
  "$(ja grep -q "^${ID2:0:8} " <<<"$BEFEHL_LISTE")" "$(tr '\n' ';' <<<"$BEFEHL_LISTE")"

for n in 1 2; do
  id_var="ID$n"
  ZIEL_N="$TMP/zurueck$n"
  stand_zurueckholen "$REPO" "$S" "${!id_var}" "$ZIEL_N" >/dev/null 2>&1
  if [ -d "$ZIEL_N$Q" ] && diff <(baum_abdruck "$ZIEL_N$Q") "$TMP/stand$n.sha" >/dev/null; then
    pruefe "Stand $n kommt Byte fuer Byte zurueck, in seinen eigenen Ordner" ja "$(wc -l <"$TMP/stand$n.sha") Dateien"
  else
    pruefe "Stand $n kommt Byte fuer Byte zurueck, in seinen eigenen Ordner" nein
  fi
done
if [ -n "$(cmp -s "$TMP/zurueck1$Q/firmenordner/regeln.txt" "$TMP/zurueck2$Q/firmenordner/regeln.txt" || echo verschieden)" ]; then
  pruefe "die zwei Staende sind wirklich zwei (Regel unterscheidet sich)" ja
else
  pruefe "die zwei Staende sind wirklich zwei (Regel unterscheidet sich)" nein
fi

# Nur einen Pfad: der Firmenordner allein.
stand_zurueckholen "$REPO" "$S" "$ID2" "$TMP/nur-firmenordner" "$Q/firmenordner" >/dev/null 2>&1
pruefe "ein Pfad allein laesst sich zurueckholen" \
  "$(ja [ -f "$TMP/nur-firmenordner$Q/firmenordner/regeln.txt" ] && [ ! -e "$TMP/nur-firmenordner$Q/datenbank" ])"

# --- 2. Nie ueber laufende Daten ------------------------------------------------
stand_zurueckholen "$REPO" "$S" "$ID2" /arasul/firmenordner >/dev/null 2>&1
pruefe "nach /arasul/... wird nicht zurueckgeholt" "$(ja [ $? = 2 ])"
mkdir -p "$TMP/belegt" && echo da >"$TMP/belegt/datei"
stand_zurueckholen "$REPO" "$S" "$ID2" "$TMP/belegt" >/dev/null 2>&1
pruefe "in einen nicht leeren Ordner wird nicht zurueckgeholt" "$(ja [ $? = 2 ] && [ "$(ls "$TMP/belegt")" = datei ])"

# --- 3. Nur Chiffrat --------------------------------------------------------------
stand_klartext "$TMP/ziel"
N=$STAND_KLARTEXT
pruefe "im Repo liegt kein Klartext" "$(ja [ "$N" = 0 ])" "$N Dateien, $(find "$TMP/ziel" -type f | wc -l) geprueft"
# Gegenproben an einer Kopie: jede muss als Klartext zaehlen.
zaehle_gegen() { stand_klartext "$TMP/ziel-gegen"; [ "$STAND_KLARTEXT" = "$1" ]; }
cp -a "$TMP/ziel" "$TMP/ziel-gegen"
chmod -R u+w "$TMP/ziel-gegen"
GREPO="$TMP/ziel-gegen/$(basename "$REPO")"
gzip -c "$Q/datenbank/arasul_db.sql" >"$GREPO/data/00/eingeschmuggelt"
pruefe "Gegenprobe: ein gzip im Repo zaehlt als Klartext" "$(ja zaehle_gegen 1)"
SCHLUESSELHUELLE="$(find "$GREPO/keys" -type f | head -n1)"
jq '. + {"klartext":"geheim"}' "$SCHLUESSELHUELLE" >"$TMP/huelle" && cp "$TMP/huelle" "$SCHLUESSELHUELLE"
pruefe "Gegenprobe: eine Schluesselhuelle mit fremdem Feld zaehlt" "$(ja zaehle_gegen 2)"
mkdir -p "$TMP/ziel-gegen/20260930"
gzip -c "$Q/firmenordner/regeln.txt" >"$TMP/ziel-gegen/20260930/firmenordner_20260930_020000.tar.gz"
echo '{"apps":[]}' >"$TMP/ziel-gegen/MANIFEST.json"
pruefe "Gegenprobe: ein Tagesordner-Archiv ohne Salted__ zaehlt, das Manifest nicht" \
  "$(ja zaehle_gegen 3)"
# Und die Quelle im Klartext ist im Repo nirgends zu finden.
if grep -rqF "Zeile 17 einer Regel" "$TMP/ziel"; then
  pruefe "ein Satz aus der Quelle steht nirgends im Repo" nein
else
  pruefe "ein Satz aus der Quelle steht nirgends im Repo" ja
fi

# --- 4. Aufbewahrung 7 / 12 / 60 ------------------------------------------------
# Sechs Jahre Naechte, damit alle drei Grenzen greifen: die letzten 21 Tage
# jede Nacht, davor jede zwanzigste (72 Monate mit Stand, mehr als 60). Eine winzige Quelle, damit es schnell geht.
AQ="$TMP/klein"
mkdir -p "$AQ"
AREPO="$TMP/aufbewahrung/staende-test"
ZEITEN="$TMP/zeiten"
python3 - >"$ZEITEN" <<'PY'
import datetime as d
ende = d.datetime(2026, 10, 3, 2, 0, 0)
t = []
for i in range(21):
    t.append(ende - d.timedelta(days=i))
x = ende - d.timedelta(days=21)
while x > ende - d.timedelta(days=6 * 365):
    t.append(x)
    x -= d.timedelta(days=20)
for z in sorted(t):
    print(z.strftime("%Y-%m-%d %H:%M:%S"))
PY
ANZAHL_NAECHTE=$(wc -l <"$ZEITEN")
stand_anlegen "$AREPO" "$S"
# Hier restic direkt und nicht `stand_sichern`: gemessen wird die Aufbewahrung,
# und ein Aufruf je Nacht statt vier haelt den Test unter zwei Minuten.
while IFS= read -r zeit; do
  echo "$zeit" >"$AQ/nacht.txt"
  stand_restic "$AREPO" "$S" backup -q --host "$STAND_HOST" --tag "$STAND_TAG" --time "$zeit" "$AQ" >/dev/null 2>&1 ||
    echo "  Nacht $zeit: restic $?"
done <"$ZEITEN"
VORHER=$(stand_liste "$AREPO" "$S" | jq 'length')
pruefe "alle nachgestellten Naechte stehen als Stand da" "$(ja [ "$VORHER" = "$ANZAHL_NAECHTE" ])" "$VORHER von $ANZAHL_NAECHTE"
stand_aufbewahren "$AREPO" "$S"
stand_liste "$AREPO" "$S" | jq -r '.[].zeit[0:19]' | sed 's/T/ /' | sort >"$TMP/behalten"
# Die eigene Nachrechnung der Regel: neueste zuerst; je Regel wird ein Stand
# behalten, wenn sein Tag/seine Woche/sein Monat ein anderer ist als der des
# zuletzt fuer DIESE Regel behaltenen, bis die Zahl erreicht ist.
python3 - "$ZEITEN" >"$TMP/erwartet" <<'PY'
import sys, datetime as d
zeiten = sorted((d.datetime.strptime(z.strip(), "%Y-%m-%d %H:%M:%S") for z in open(sys.argv[1]) if z.strip()), reverse=True)
regeln = [(7, lambda t: t.strftime("%Y-%m-%d")),
          (12, lambda t: "%04d-%02d" % t.isocalendar()[:2]),
          (60, lambda t: t.strftime("%Y-%m"))]
rest = [n for n, _ in regeln]
letzte = [None] * len(regeln)
behalten = []
for t in zeiten:
    keep = False
    for i, (_, eimer) in enumerate(regeln):
        if rest[i] > 0 and eimer(t) != letzte[i]:
            keep = True
            letzte[i] = eimer(t)
            rest[i] -= 1
    if keep:
        behalten.append(t)
for t in sorted(behalten):
    print(t.strftime("%Y-%m-%d %H:%M:%S"))
PY
NACHHER=$(wc -l <"$TMP/behalten")
if diff "$TMP/behalten" "$TMP/erwartet" >/dev/null; then
  pruefe "Aufbewahrung 7 Tage, 12 Wochen, 60 Monate stimmt mit der eigenen Nachrechnung" ja \
    "${VORHER} -> ${NACHHER} Staende, entfallen ${STAND_ENTFALLEN}"
else
  pruefe "Aufbewahrung 7 Tage, 12 Wochen, 60 Monate stimmt mit der eigenen Nachrechnung" nein \
    "behalten $(wc -l <"$TMP/behalten"), erwartet $(wc -l <"$TMP/erwartet")"
  diff "$TMP/behalten" "$TMP/erwartet" | head -10 | sed 's/^/      /'
fi
pruefe "die Monatsgrenze greift (ein Stand aus dem 61. Monat zurueck ist weg)" \
  "$(ja [ "$(head -n1 "$TMP/behalten" | cut -c1-7)" \> "2021-09" ])" "aeltester $(head -n1 "$TMP/behalten")"
pruefe "die letzten 7 Naechte sind alle da" \
  "$(ja [ "$(tail -n 7 "$TMP/behalten" | cut -c1-10 | tr '\n' ' ')" = "2026-09-27 2026-09-28 2026-09-29 2026-09-30 2026-10-01 2026-10-02 2026-10-03 " ])"

# --- 5. Schreiben waehrend des Laufs ---------------------------------------------
WQ="$TMP/waehrend"
mkdir -p "$WQ/vorher"
for i in $(seq 1 30); do
  mkdir -p "$WQ/vorher/ordner$i"
  for j in $(seq 1 60); do head -c 8192 /dev/urandom >"$WQ/vorher/ordner$i/datei$j.bin"; done
done
echo "weg" >"$WQ/geloescht.txt"
baum_abdruck "$WQ" | grep -v 'geloescht.txt' >"$TMP/waehrend.sha"
WREPO="$TMP/ziel-waehrend/staende-w"
stand_anlegen "$WREPO" "$S"
# Der Schreiber laeuft, bis der Lauf vorbei ist (Merker `halt`), nicht eine
# feste Zahl Dateien lang: auf einem schnellen Rechner (der CI) war er sonst
# fertig, bevor restic zu lesen begann, und der Fall nicht hergestellt.
(
  mkdir -p "$WQ/wegwerf"
  n=0
  while [ ! -e "$TMP/halt" ] && [ "$n" -lt 50000 ]; do
    n=$((n + 1))
    head -c 2048 /dev/urandom >"$WQ/wegwerf/neu$n.bin"
    [ "$n" = 300 ] && rm -f "$WQ/geloescht.txt"
    sleep 0.002
  done
) &
SCHREIBER=$!
until [ -e "$WQ/wegwerf/neu400.bin" ]; do sleep 0.05; done
stand_sichern "$WREPO" "$S" "$WQ" >"$TMP/waehrend.log" 2>&1
WRC=$?
SCHREIBT_NOCH=nein
kill -0 "$SCHREIBER" 2>/dev/null && SCHREIBT_NOCH=ja
touch "$TMP/halt"
wait "$SCHREIBER" 2>/dev/null
SCHREIBER=""
pruefe "der Stand steht, obwohl waehrenddessen geschrieben wird" "$(ja [ "$WRC" = 0 ] && [ -n "$STAND_ID" ])" "rc ${WRC}, restic ${STAND_RC}"
stand_zurueckholen "$WREPO" "$S" "$STAND_ID" "$TMP/waehrend-zurueck" >/dev/null 2>&1
# Ist der Fall hergestellt? Ja, wenn der Schreiber nach dem Lauf noch schrieb
# (er begann davor). Sonst misst dieser Abschnitt nichts und muss das sagen.
IM_STAND=$(find "$TMP/waehrend-zurueck$WQ/wegwerf" -type f 2>/dev/null | wc -l | tr -d ' ')
GESCHRIEBEN=$(find "$WQ/wegwerf" -type f | wc -l | tr -d ' ')
pruefe "der Fall ist hergestellt: geschrieben wurde waehrend des Laufs" "$SCHREIBT_NOCH" \
  "im Stand ${IM_STAND} von ${GESCHRIEBEN} geschriebenen"
if (cd "$TMP/waehrend-zurueck$WQ" 2>/dev/null && sha256sum --quiet -c "$TMP/waehrend.sha") >/dev/null 2>&1; then
  pruefe "jede Datei von vorher kommt Byte fuer Byte zurueck" ja "$(wc -l <"$TMP/waehrend.sha")"
else
  pruefe "jede Datei von vorher kommt Byte fuer Byte zurueck" nein
fi

# --- 6. Das Ziel ist voll ----------------------------------------------------------
if sudo -n true 2>/dev/null && [ "$(uname)" = Linux ]; then
  VOLL="$TMP/voll"
  mkdir -p "$VOLL"
  sudo -n mount -t tmpfs -o size=48m,mode=0777 tmpfs "$VOLL" && EINGEHAENGT="$VOLL"
  VQ="$TMP/voll-quelle"
  mkdir -p "$VQ"
  head -c $((10 * 1048576)) /dev/urandom >"$VQ/sockel.bin"
  VREPO="$VOLL/staende-v"
  STAND_RESERVE_MB=4
  ENTFALLEN=""
  LETZTE=""
  for nacht in 1 2 3 4 5 6; do
    rm -f "$VQ"/nacht-*.bin
    head -c $((9 * 1048576)) /dev/urandom >"$VQ/nacht-$nacht.bin"
    STAND_ENTFALLEN_PLATZ=""
    if STAND_ZEIT="2026-09-2$nacht 02:00:00" stand_sichern "$VREPO" "$S" "$VQ" >"$TMP/voll-$nacht.log" 2>&1; then
      LETZTE="$STAND_ID"
    else
      echo "      Nacht $nacht: ${STAND_FEHLER}"
    fi
    ENTFALLEN+="$STAND_ENTFALLEN_PLATZ"
  done
  STAND_RESERVE_MB=2048
  pruefe "ist das Ziel voll, faellt der aelteste Stand" "$(ja [ -n "$ENTFALLEN" ])" \
    "entfallen: $(printf '%s' "$ENTFALLEN" | cut -c1-10 | tr '\n' ' ')"
  pruefe "... mit Hinweis im Protokoll" "$(ja grep -qh 'Das Ziel ist voll' "$TMP"/voll-*.log)"
  pruefe "... und der Stand der letzten Nacht steht" \
    "$(ja [ "$(stand_liste "$VREPO" "$S" | jq -r '.[-1].id')" = "$LETZTE" ])"
  stand_zurueckholen "$VREPO" "$S" "$LETZTE" "$TMP/voll-zurueck" >/dev/null 2>&1
  pruefe "... und kommt zurueck" "$(ja cmp -s "$TMP/voll-zurueck$VQ/nacht-6.bin" "$VQ/nacht-6.bin")"
  pruefe "... und der aelteste ist wirklich weg" \
    "$(ja [ "$(stand_liste "$VREPO" "$S" | jq -r '.[0].zeit[0:10]')" != "2026-09-21" ])"
else
  echo "--     volles Ziel: kein tmpfs ohne sudo hier (am Orin misst es sicherung-staende-abnahme.sh)"
fi

# --- 7. Ein anderer Schluessel ----------------------------------------------------
ANDERER="$TMP/anderer-schluessel"
head -c 20 /dev/urandom | base32 | tr -d '=\n' >"$ANDERER"
AREPO2="$(stand_repo "$TMP/ziel" "$ANDERER")"
pruefe "ein anderer Schluessel bekommt ein anderes Repo" "$(ja [ "$AREPO2" != "$REPO" ])"
if stand_oeffnet "$REPO" "$ANDERER"; then
  pruefe "der andere Schluessel oeffnet das erste Repo nicht" nein
else
  pruefe "der andere Schluessel oeffnet das erste Repo nicht" ja
fi
stand_sichern "$AREPO2" "$ANDERER" "$Q" >/dev/null 2>&1
pruefe "... und das erste Repo bleibt, wie es war" \
  "$(ja [ "$(stand_liste "$REPO" "$S" | jq -r '[.[].id] | join(" ")')" = "$ID1 $ID2" ])"

# --- 8. Das Image ------------------------------------------------------------------
for paket in restic util-linux-misc findutils jq; do
  if grep -qE "^[[:space:]]+${paket}( |\\\\|$)" "$DIENST/Dockerfile"; then
    pruefe "Image bringt ${paket} mit" ja
  else
    pruefe "Image bringt ${paket} mit" nein
  fi
done
pruefe "Image legt staende.sh ab" "$(ja grep -q 'staende.sh /usr/local/bin/staende.sh' "$DIENST/Dockerfile")"
# Am Orin nach dem Deploy von M5 gefunden: `cleanup` laeuft im
# Wiederherstellungstest auch VOR dem Start und nahm den Bereitstellungsordner
# mit -- der Test fand seinen eigenen Abzug nicht, der Bericht blieb leer, und
# der Healthcheck haette den Dienst rot gefaerbt.
pruefe "restore-drill.sh: cleanup (laeuft auch vorher) laesst den Stand stehen" \
  "$(ja bash -c "! sed -n '/^cleanup() {/,/^}/p' '$DIENST/restore-drill.sh' | grep -q DRILL_STAGE")"
pruefe "backup.sh schreibt kein tar mehr je Nacht" "$(ja bash -c "! grep -qE '^[^#]*tar -c' '$DIENST/backup.sh'")"
pruefe "backup.sh loescht keine Tagesordner mehr" \
  "$(ja bash -c "! grep -qE '^[^#]*find /backups/(postgres|apps|flows|config|firmenordner|wal-archive)[^|]*-delete' '$DIENST/backup.sh'")"

echo
echo "gruen ${gruen}, rot ${rot}"
[ "$rot" = 0 ]
