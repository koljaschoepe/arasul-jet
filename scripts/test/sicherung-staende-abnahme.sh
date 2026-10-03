#!/bin/bash
# =============================================================================
# sicherung-staende-abnahme.sh — die Staende der Sicherung, am Orin (M5)
# =============================================================================
# Die Frage: schreibt die Nachtsicherung nur Geaendertes, haelt sie 7 Tage,
# 12 Wochen, 60 Monate, laesst sie jeden Stand einzeln zurueckholen, nimmt sie
# bei vollem Ziel den aeltesten Stand mit Hinweis, und liegt auf dem
# Datentraeger nur Verschluesseltes?
#
# GEMESSEN WIRD MIT DEM ECHTEN `backup.sh` AUS DEM ECHTEN IMAGE, aber in einem
# EIGENEN Container mit eigenem Ziel. Der laufende `backup-service`, seine
# Sicherungen, `/mnt/golden` und `/mnt/goldenbackup` werden nicht angefasst:
#
#   /backups        -> /mnt/arasul-sicherung-<stempel>/lokal   (Testziel)
#   /arasul/extern  -> tmpfs im Container (anderes Dateisystem = "Datentraeger")
#   /arasul/flows   -> /mnt/arasul-sicherung-<stempel>/flows   (hier aendert
#                      die Abnahme etwas; die echten Flows liegen leer)
#   /arasul/apps, /arasul/firmenordner, Konfiguration, /backups/wal
#                   -> die echten, NUR LESEND
#   Datenbank       -> pg_dump gegen postgres-db, wie jede Nacht (nur lesend)
#
# Ablauf:
#   1. Zwei Laeufe hintereinander (der zweite steht fuer die zweite Nacht).
#      Der zweite muss messbar weniger schreiben als eine Vollkopie.
#      Waehrend des ersten: Token je Sekunde des Sprachmodells, davor und
#      waehrenddessen (ARASUL_LLM_MODELL, leer = nicht messen).
#   2. Jeder Stand einzeln auflistbar (lokal und auf dem Datentraeger) und
#      einzeln zurueckholbar, in ein eigenes Pruefverzeichnis unter dem
#      Testziel -- nie ueber laufende Daten. Dazu `wiederherstellen.sh --probe`
#      (liest den Stand, fasst nichts an), auch mit Wiederherstellungscode.
#   3. Nur Verschluesseltes: `extern_klartext` und `stand_klartext` 0, und ein
#      Satz, der nur in der Quelle steht, findet sich auf keinem Ziel.
#   4. Ziel voll: ein zweiter Container mit knappem tmpfs, je Nacht neue
#      Daten; der aelteste Stand faellt, mit Hinweis im Bericht.
#   5. Aufbewahrung: 6 Jahre Naechte im Container nachgestellt (restic im
#      Image), verglichen mit einer eigenen Nachrechnung der Regel.
#   6. Der Weg zurueck ECHT, aber in einer Wegwerf-Umgebung: eine eigene
#      Postgres-Instanz in einem eigenen Netz, leere Zielordner, und darin
#      `wiederherstellen.sh` ohne --probe -- das ganze Geraet, eine
#      App-Datenbank, ein App-Paket. Der Betrieb wird dabei nicht beruehrt.
#
# Aufruf vom Mac:
#   ARASUL_GERAET=jetson bash scripts/test/sicherung-staende-abnahme.sh
#   ARASUL_BILD=probe-staende:test ...   # ein eigenes Image statt des laufenden
#
# Kein Konto noetig: alles laeuft ueber `docker` am Geraet. Rueckgabe 0, wenn
# jede Pruefung gruen war. Am Ende ist alles weg, was die Abnahme angelegt hat.
# =============================================================================
set -uo pipefail

GERAET="${ARASUL_GERAET:-jetson}"
STEMPEL="probe-staende-$(date +%m%d%H%M%S)"
ZIEL="/mnt/arasul-sicherung-${STEMPEL}"
C1="${STEMPEL}-a"
C2="${STEMPEL}-voll"
C3="${STEMPEL}-zurueck"
PG="${STEMPEL}-pg"
NETZ2="${STEMPEL}-netz"
LLM_MODELL="${ARASUL_LLM_MODELL-gemma4:e4b}"
ARBEIT="$(mktemp -d)"

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
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
am_geraet() { ssh -o BatchMode=yes "$GERAET" "$@"; }
# Ein Befehl im Abnahme-Container, als bash -c.
drin() { local c="$1"; shift; ssh -o BatchMode=yes "$GERAET" "docker exec $c bash -c $(printf '%q' "$*")"; }
bericht() { drin "$1" 'cat /backups/backup_report.json'; }
feld() { python3 -c 'import sys,json; d=json.load(sys.stdin); v=d
for k in sys.argv[1].split("."): v = v.get(k) if isinstance(v, dict) else None
print("" if v is None else v)' "$1" 2>/dev/null; }
mb() { awk -v b="$1" 'BEGIN { printf "%.1f MB", b / 1048576 }'; }

aufraeumen() {
  am_geraet "docker rm -f $C1 $C2 $C3 $PG >/dev/null 2>&1; docker network rm $NETZ2 >/dev/null 2>&1; docker run --rm -v /mnt:/mnt alpine:3.19 rm -rf '$ZIEL'" >/dev/null 2>&1
  rm -rf "$ARBEIT"
  echo "aufgeraeumt  Container ${C1}, ${C2}, ${C3}, ${PG}, Netz ${NETZ2}, Testziel ${ZIEL}"
}
trap aufraeumen EXIT

# --- Was laeuft, und woher kommen die Quellen? --------------------------------
quelle_von() { # Ziel im laufenden backup-service
  am_geraet "docker inspect backup-service -f '{{range .Mounts}}{{if eq .Destination \"$1\"}}{{.Source}}{{end}}{{end}}'"
}
BILD="${ARASUL_BILD:-$(am_geraet "docker inspect backup-service -f '{{.Config.Image}}'")}"
NETZ="$(am_geraet "docker inspect backup-service -f '{{range \$k, \$v := .NetworkSettings.Networks}}{{\$k}} {{end}}'" | tr ' ' '\n' | grep backend | head -n1)"
APPS="$(quelle_von /arasul/apps)"
FIRMA="$(quelle_von /arasul/firmenordner)"
ENVD="$(quelle_von /arasul/konfiguration/.env)"
KONF="$(quelle_von /arasul/konfiguration/config)"
PGPW="$(quelle_von /run/secrets/postgres_password)"
KEY="$(quelle_von /run/secrets/backup_encryption_key)"
WAL="$(am_geraet "docker inspect backup-service -f '{{range .Mounts}}{{if eq .Destination \"/backups/wal\"}}{{.Name}}{{end}}{{end}}'")"
PGU="$(am_geraet "docker inspect backup-service -f '{{range .Config.Env}}{{println .}}{{end}}'" | sed -n 's/^POSTGRES_USER=//p')"
PGD="$(am_geraet "docker inspect backup-service -f '{{range .Config.Env}}{{println .}}{{end}}'" | sed -n 's/^POSTGRES_DB=//p')"
echo "Staende am Geraet ${GERAET}: Image ${BILD}, Testziel ${ZIEL}"
for v in BILD NETZ APPS FIRMA ENVD KONF PGPW KEY; do
  if [ -z "${!v}" ]; then
    echo "FEHLT: ${v} (laeuft backup-service?)"
    exit 1
  fi
done
pruefe "das Image bringt restic mit" \
  "$(ja_wenn "$(am_geraet "docker run --rm --entrypoint restic $BILD version" 2>/dev/null | cut -d' ' -f1)" restic)"

starte() { # name tmpfs-groesse reserve-mb
  am_geraet "docker run -d --name $1 --network $NETZ \
    --tmpfs /arasul/extern:size=$2 \
    -v $ZIEL/lokal:/backups -v $ZIEL/flows:/arasul/flows \
    ${WAL:+-v $WAL:/backups/wal:ro} \
    -v $APPS:/arasul/apps:ro -v $FIRMA:/arasul/firmenordner:ro \
    -v $ENVD:/arasul/konfiguration/.env:ro -v $KONF:/arasul/konfiguration/config:ro \
    -v $PGPW:/run/secrets/postgres_password:ro -v $KEY:/run/secrets/backup_encryption_key:ro \
    -e POSTGRES_HOST=postgres-db -e POSTGRES_USER=$PGU -e POSTGRES_DB=$PGD \
    -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password -e BACKUP_ENCRYPT=true \
    -e TZ=Europe/Berlin -e BACKUP_EXTERN_AN=auto -e BACKUP_STAND_RESERVE_MB=$3 \
    --entrypoint sleep $BILD infinity" >/dev/null
}
am_geraet "docker run --rm -v /mnt:/mnt alpine:3.19 sh -c 'mkdir -p $ZIEL/lokal $ZIEL/flows'"
KANARIE="ARASUL-KANARIE-$(head -c 9 /dev/urandom | base64 | tr -d '/+=')"
starte "$C1" 4g 64
drin "$C1" "printf 'Kanarie %s\n' '$KANARIE' > /arasul/flows/kanarie.md; touch /backups/.vor_lauf1"

# --- 1. Zwei Laeufe -------------------------------------------------------------
tok_s() {
  am_geraet "docker exec llm-service curl -s localhost:11434/api/generate -d '{\"model\":\"$LLM_MODELL\",\"prompt\":\"Beschreibe ein Lagerhaus in 300 Woertern.\",\"stream\":false,\"keep_alive\":\"5m\",\"options\":{\"num_predict\":300,\"temperature\":0,\"seed\":1}}'" \
    | python3 -c 'import sys,json; d=json.load(sys.stdin); print("%.2f" % (d["eval_count"]/(d["eval_duration"]/1e9)))' 2>/dev/null
}
LLM_VORHER=""
LLM_WAEHREND=""
if [ -n "$LLM_MODELL" ]; then
  tok_s >/dev/null
  LLM_VORHER="$(tok_s)"
fi
drin "$C1" 'backup.sh' >"$ARBEIT/lauf1.log" 2>&1 &
LAUF1=$!
if [ -n "$LLM_MODELL" ]; then
  sleep 3
  LLM_WAEHREND="$(tok_s)"
fi
wait "$LAUF1"
R1="$(bericht "$C1")"
pruefe "Lauf 1 (erste Nacht) steht" "$(ja_wenn "$(feld status <<<"$R1")/$(feld stand_status <<<"$R1")/$(feld extern_status <<<"$R1")" completed/ok/kopiert)" \
  "$(feld status <<<"$R1"), Stand $(feld stand_status <<<"$R1"), Datentraeger $(feld extern_status <<<"$R1")"
[ "$(feld status <<<"$R1")" = completed ] || sed 's/^/      /' "$ARBEIT/lauf1.log" | tail -30
if [ -n "$LLM_VORHER" ] && [ -n "$LLM_WAEHREND" ]; then
  pruefe "das Sprachmodell merkt die Sicherung kaum (hoechstens 10 % langsamer)" \
    "$(awk -v a="$LLM_VORHER" -v b="$LLM_WAEHREND" 'BEGIN { print (b >= a * 0.9) ? "ja" : "nein" }')" \
    "${LLM_VORHER} Token/s vorher, ${LLM_WAEHREND} waehrend"
fi

# Was die zweite Nacht vorfindet: eine neue Flow-Datei. Alles andere ist, wie
# es am Geraet eben ist (die Datenbank hat sich vielleicht bewegt).
drin "$C1" "printf '# Neu in Nacht 2\n' > /arasul/flows/nacht2.md"
drin "$C1" 'backup.sh' >"$ARBEIT/lauf2.log" 2>&1
R2="$(bericht "$C1")"
pruefe "Lauf 2 (zweite Nacht) steht" "$(ja_wenn "$(feld status <<<"$R2")/$(feld stand_status <<<"$R2")/$(feld extern_status <<<"$R2")" completed/ok/kopiert)"
G1="$(feld stand_geschrieben_bytes <<<"$R1")"; G2="$(feld stand_geschrieben_bytes <<<"$R2")"
E1="$(feld extern_geschrieben_bytes <<<"$R1")"; E2="$(feld extern_geschrieben_bytes <<<"$R2")"
L2="$(feld stand_gelesen_bytes <<<"$R2")"
pruefe "Lauf 2 schreibt lokal weniger als ein Zehntel der Vollkopie" \
  "$(awk -v a="${G1:-0}" -v b="${G2:-0}" 'BEGIN { print (a > 0 && b * 10 < a) ? "ja" : "nein" }')" \
  "Vollkopie $(mb "${G1:-0}"), Nacht 2 $(mb "${G2:-0}"), gelesen $(mb "${L2:-0}")"
pruefe "Lauf 2 schreibt auf den Datentraeger weniger als ein Zehntel der Vollkopie" \
  "$(awk -v a="${E1:-0}" -v b="${E2:-0}" 'BEGIN { print (a > 0 && b * 10 < a) ? "ja" : "nein" }')" \
  "Vollkopie $(mb "${E1:-0}"), Nacht 2 $(mb "${E2:-0}")"
SICH="$(quelle_von /backups)"
VORHER_TAGESORDNER="$(am_geraet "f=\$(ls -t $SICH/firmenordner 2>/dev/null | grep '^firmenordner_2' | head -n1); [ -n \"\$f\" ] && stat -c %s $SICH/firmenordner/\$f")"
[ -n "$VORHER_TAGESORDNER" ] && echo "       zum Vergleich: der Tagesordner von vor M5 schrieb je Nacht allein fuer den Firmenordner $(mb "$VORHER_TAGESORDNER")"

# --- 2. Einzeln auflistbar und zurueckholbar --------------------------------------
LISTE_L="$(drin "$C1" 'staende.sh liste --json')"
LISTE_E="$(drin "$C1" 'staende.sh liste --json --quelle extern')"
pruefe "zwei Staende auf diesem Geraet, einzeln aufgelistet" "$(ja_wenn "$(jq 'length' <<<"$LISTE_L" 2>/dev/null)" 2)" "$(jq -c '[.[].kurz]' <<<"$LISTE_L" 2>/dev/null)"
pruefe "zwei Staende auf dem Datentraeger, einzeln aufgelistet" "$(ja_wenn "$(jq 'length' <<<"$LISTE_E" 2>/dev/null)" 2)" "$(jq -c '[.[].kurz]' <<<"$LISTE_E" 2>/dev/null)"
pruefe "die Liste nennt auch der Bericht fuers Dashboard (staende.json)" \
  "$(ja_wenn "$(drin "$C1" "jq '.staende | length' /backups/staende.json")" 2)"

for n in 1 2; do
  for quelle in lokal extern; do
    if [ "$quelle" = lokal ]; then L="$LISTE_L"; else L="$LISTE_E"; fi
    ID="$(jq -r ".[$((n - 1))].id" <<<"$L")"
    P="/backups/pruef-${quelle}-${n}"
    drin "$C1" "staende.sh zurueckholen $ID $P --quelle $quelle" >"$ARBEIT/zurueck-$quelle-$n.log" 2>&1
    # Stand 1 kennt nacht2.md nicht, Stand 2 schon; beide die Kanarie.
    ERWARTET="ja"; [ "$n" = 1 ] && ERWARTET="nein"
    PRUEF="$(drin "$C1" "
      d=$P/arasul/datenbank/arasul_db.sql
      grep -q 'dump complete' <<<\"\$(tail -n 10 \$d 2>/dev/null)\" && echo db=ja || echo db=nein
      [ -f $P/arasul/flows/kanarie.md ] && echo kanarie=ja || echo kanarie=nein
      [ -f $P/arasul/flows/nacht2.md ] && echo nacht2=ja || echo nacht2=nein
      # Firmenordner: jede Datei, die seit vor Lauf 1 unveraendert ist, gleich.
      # (ctime, nicht mtime: der Abgleich setzt die mtime auf die des Rechners)
      cd /arasul/firmenordner && find . -type f ! -cnewer /backups/.vor_lauf1 -print0 2>/dev/null \
        | xargs -0 sha256sum 2>/dev/null > /tmp/q.sha
      if cd $P/arasul/firmenordner 2>/dev/null; then
        falsch=\$(sha256sum -c /tmp/q.sha 2>/dev/null | grep -vc ': OK\$')
        [ \"\$falsch\" = 0 ] && echo firma=ja || echo firma=nein:\$falsch
      else
        echo firma=fehlt
      fi
      echo dateien=\$(wc -l < /tmp/q.sha)
      apps=\$(ls $P/arasul/apps 2>/dev/null | wc -l); echo apps=\$apps
    ")"
    ok=nein
    grep -q '^db=ja' <<<"$PRUEF" && grep -q '^kanarie=ja' <<<"$PRUEF" && grep -q "^nacht2=${ERWARTET}" <<<"$PRUEF" \
      && grep -q '^firma=ja' <<<"$PRUEF" && ok=ja
    pruefe "Stand ${n} (${quelle}) einzeln zurueckgeholt nach ${P}" "$ok" \
      "$(tr '\n' ' ' <<<"$PRUEF")"
  done
done
drin "$C1" 'staende.sh zurueckholen latest /arasul/firmenordner/x' >/dev/null 2>&1
RC=$?
pruefe "ueber laufende Daten wird nicht zurueckgeholt (/arasul/... abgewiesen)" "$(ja_wenn "$RC" 2)"

# wiederherstellen.sh nur lesend: --probe holt den Stand und prueft den Abzug.
drin "$C1" 'wiederherstellen.sh --probe' >"$ARBEIT/probe.log" 2>&1
PRC=$?
pruefe "wiederherstellen.sh --probe liest den neuesten Stand (fasst nichts an)" \
  "$( { [ "$PRC" = 0 ] && grep -q 'Quelle: Stand' "$ARBEIT/probe.log" && grep -q 'Sicherung lesbar' "$ARBEIT/probe.log"; } && echo ja || echo nein)" \
  "$(grep -m1 'Quelle: Stand' "$ARBEIT/probe.log")"
ID1L="$(jq -r '.[0].kurz' <<<"$LISTE_L")"
drin "$C1" "wiederherstellen.sh --probe --stand $ID1L" >"$ARBEIT/probe1.log" 2>&1
RC=$?
pruefe "... auch einen bestimmten Stand (--stand ${ID1L})" \
  "$( { [ "$RC" = 0 ] && grep -q "Quelle: Stand ${ID1L}" "$ARBEIT/probe1.log"; } && echo ja || echo nein)"
drin "$C1" 'ARASUL_WIEDERHERSTELLUNGSCODE="$(cat /run/secrets/backup_encryption_key | sed -E "s/(.{4})/\1-/g")" BACKUP_ENCRYPT_KEY_FILE=/nicht/da wiederherstellen.sh --probe --quelle extern' >"$ARBEIT/code.log" 2>&1
RC=$?
pruefe "... vom Datentraeger, nur mit dem Wiederherstellungscode (ohne Schluesseldatei)" \
  "$( { [ "$RC" = 0 ] && grep -q 'Wiederherstellungscode angenommen' "$ARBEIT/code.log" && grep -q 'Datentraeger' "$ARBEIT/code.log"; } && echo ja || echo nein)"
APP1="$(drin "$C1" 'ls /arasul/apps | grep -v "^\." | head -n1')"
if [ -n "$APP1" ]; then
  drin "$C1" "wiederherstellen.sh --probe --app-paket $APP1" >"$ARBEIT/paket.log" 2>&1
  RC=$?
  pruefe "... und das Paket einer App (${APP1}) aus dem Stand" "$(ja_wenn "$RC" 0)" "$(tail -n1 "$ARBEIT/paket.log")"
fi

# --- 3. Nur Verschluesseltes ------------------------------------------------------
pruefe "extern_klartext ist 0" "$(ja_wenn "$(feld extern_klartext <<<"$R2")" 0)"
pruefe "stand_klartext (dieses Geraet) ist 0" "$(ja_wenn "$(feld stand_klartext <<<"$R2")" 0)"
KANARIE_TREFFER="$(drin "$C1" "grep -rlF '$KANARIE' /arasul/extern /backups/staende-* 2>/dev/null | wc -l")"
pruefe "ein Satz aus der Quelle steht auf keinem Ziel im Klartext" "$(ja_wenn "$KANARIE_TREFFER" 0)" \
  "$(drin "$C1" 'find /arasul/extern -type f | wc -l') Dateien auf dem Datentraeger durchsucht"
drin "$C1" 'staende.sh klartext /arasul/extern/arasul-sicherung' >"$ARBEIT/klartext.log" 2>&1
pruefe "staende.sh klartext auf dem Datentraeger: 0" "$(ja_wenn "$(tail -n1 "$ARBEIT/klartext.log")" klartext=0)"
pruefe "auf dem Datentraeger liegt neben dem Repo nur das Manifest" \
  "$(ja_wenn "$(drin "$C1" 'ls /arasul/extern/arasul-sicherung | grep -v "^staende-" | tr "\n" " "')" "MANIFEST.json ")"

# --- 4. Ziel voll -------------------------------------------------------------------
# Ein zweiter Container mit einem tmpfs, das den ersten Stand und zwei Naechte
# fasst, nicht mehr. Je Nacht 60 MB neue Daten, die die Nacht darauf wieder
# verschwinden -- so bindet jeder alte Stand eigenen Platz.
VOLL_MB=$(( ($(feld extern_bytes <<<"$R2") / 1048576) + 160 ))
starte "$C2" "${VOLL_MB}m" 16
HINWEISE=""
for nacht in 1 2 3 4 5; do
  ZEIT="$(date -d "+${nacht} day" '+%Y-%m-%d 02:00:00' 2>/dev/null || date -v+${nacht}d '+%Y-%m-%d 02:00:00')"
  drin "$C2" "rm -f /arasul/flows/voll-*.bin; head -c 62914560 /dev/urandom > /arasul/flows/voll-${nacht}.bin"
  drin "$C2" "STAND_ZEIT='$ZEIT' backup.sh" >"$ARBEIT/voll-$nacht.log" 2>&1
  RV="$(bericht "$C2")"
  printf '       Nacht %s: Datentraeger %s, %s frei, Hinweis: %s\n' "$nacht" "$(feld extern_status <<<"$RV")" \
    "$(mb "$(feld extern_frei_bytes <<<"$RV")")" "$(feld stand_hinweis <<<"$RV")"
  HINWEISE+="$(feld stand_hinweis <<<"$RV")"
done
LISTE_V="$(drin "$C2" 'staende.sh liste --json --quelle extern')"
pruefe "ist das Ziel voll, faellt der aelteste Stand" \
  "$( { [ -n "$HINWEISE" ] && grep -q 'Das Ziel ist voll' "$ARBEIT"/voll-*.log; } && echo ja || echo nein)" \
  "$(grep -h 'Das Ziel ist voll' "$ARBEIT"/voll-*.log | head -n2 | sed 's/^\[[^]]*\] //' | tr '\n' ' ')"
pruefe "... mit Hinweis im Bericht (stand_hinweis)" "$( [ -n "$HINWEISE" ] && echo ja || echo nein)" "${HINWEISE:0:120}"
pruefe "... und der Stand der letzten Nacht steht auf dem Datentraeger" \
  "$(ja_wenn "$(jq -r '.[-1].zeit[0:10]' <<<"$LISTE_V")" "$(date -d '+5 day' '+%Y-%m-%d' 2>/dev/null || date -v+5d '+%Y-%m-%d')")" \
  "$(jq -c '[.[].zeit[0:10]]' <<<"$LISTE_V")"
pruefe "... und auch dann nur Verschluesseltes (extern_klartext 0)" "$(ja_wenn "$(feld extern_klartext <<<"$RV")" 0)"

# --- 5. Aufbewahrung ----------------------------------------------------------------
python3 - >"$ARBEIT/zeiten" <<'PY'
import datetime as d
ende = d.datetime(2026, 10, 3, 2, 0, 0)
t = [ende - d.timedelta(days=i) for i in range(21)]
x = ende - d.timedelta(days=21)
while x > ende - d.timedelta(days=6 * 365):
    t.append(x); x -= d.timedelta(days=20)
for z in sorted(t): print(z.strftime("%Y-%m-%d %H:%M:%S"))
PY
am_geraet "docker exec -i $C1 bash -c 'cat > /tmp/zeiten'" <"$ARBEIT/zeiten"
drin "$C1" '
  source /usr/local/bin/staende.sh
  export TZ=UTC
  R=/backups/aufbewahrung/staende-test; K=/run/secrets/backup_encryption_key
  mkdir -p /tmp/klein; stand_anlegen $R $K
  while IFS= read -r z; do echo "$z" > /tmp/klein/nacht.txt
    stand_restic $R $K backup -q --host arasul --tag arasul --time "$z" /tmp/klein >/dev/null 2>&1; done < /tmp/zeiten
  stand_aufbewahren $R $K
  stand_liste $R $K | jq -r ".[].zeit[0:19]" | sed "s/T/ /" | sort' >"$ARBEIT/behalten" 2>/dev/null
python3 - "$ARBEIT/zeiten" >"$ARBEIT/erwartet" <<'PY'
import sys, datetime as d
zeiten = sorted((d.datetime.strptime(z.strip(), "%Y-%m-%d %H:%M:%S") for z in open(sys.argv[1]) if z.strip()), reverse=True)
regeln = [(7, lambda t: t.strftime("%Y-%m-%d")), (12, lambda t: "%04d-%02d" % t.isocalendar()[:2]), (60, lambda t: t.strftime("%Y-%m"))]
rest = [n for n, _ in regeln]; letzte = [None] * 3; behalten = []
for t in zeiten:
    keep = False
    for i, (_, eimer) in enumerate(regeln):
        if rest[i] > 0 and eimer(t) != letzte[i]:
            keep = True; letzte[i] = eimer(t); rest[i] -= 1
    if keep: behalten.append(t)
for t in sorted(behalten): print(t.strftime("%Y-%m-%d %H:%M:%S"))
PY
pruefe "Aufbewahrung 7 Tage, 12 Wochen, 60 Monate (restic im Image, eigene Nachrechnung)" \
  "$(diff -q "$ARBEIT/behalten" "$ARBEIT/erwartet" >/dev/null && echo ja || echo nein)" \
  "$(wc -l <"$ARBEIT/zeiten" | tr -d ' ') Naechte -> $(wc -l <"$ARBEIT/behalten" | tr -d ' ') Staende, erwartet $(wc -l <"$ARBEIT/erwartet" | tr -d ' ')"

# --- 6. Der Weg zurueck, echt, in einer Wegwerf-Umgebung -------------------------
# Was C1 als Quelle sah, als Pruefsummen (nur, was seit vor Lauf 1 unveraendert
# ist); geprueft wird es im Wegwerf-Container, der die Quelle nicht sieht.
drin "$C1" 'cd /arasul/firmenordner && find . -type f ! -cnewer /backups/.vor_lauf1 -print0 | xargs -0 sha256sum > /backups/q-firma.sha
            ls /arasul/apps | grep -v "^\." | sort > /backups/q-apps.txt'
am_geraet "docker network create --internal $NETZ2 >/dev/null
  docker run --rm -v /mnt:/mnt alpine:3.19 sh -c 'mkdir -p $ZIEL/z-apps $ZIEL/z-flows $ZIEL/z-firma; head -c 18 /dev/urandom | base64 | tr -d \"/+=\" > $ZIEL/pg-wort'
  docker run -d --name $PG --network $NETZ2 -e POSTGRES_USER=$PGU -e POSTGRES_DB=$PGD \
    -e POSTGRES_PASSWORD_FILE=/run/secrets/pw -v $ZIEL/pg-wort:/run/secrets/pw:ro postgres:16-alpine >/dev/null
  docker run -d --name $C3 --network $NETZ2 \
    -v $ZIEL/lokal:/backups -v $ZIEL/z-apps:/arasul/apps -v $ZIEL/z-flows:/arasul/flows -v $ZIEL/z-firma:/arasul/firmenordner \
    -v $ZIEL/pg-wort:/run/secrets/postgres_password:ro -v $KEY:/run/secrets/backup_encryption_key:ro \
    -e POSTGRES_HOST=$PG -e POSTGRES_USER=$PGU -e POSTGRES_DB=$PGD -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password \
    -e TZ=Europe/Berlin --entrypoint sleep $BILD infinity >/dev/null"
drin "$C3" 'for i in $(seq 1 60); do PGPASSWORD=$(cat /run/secrets/postgres_password) psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "select 1" >/dev/null 2>&1 && break; sleep 1; done'
drin "$C3" 'wiederherstellen.sh' >"$ARBEIT/zurueck-geraet.log" 2>&1
RC=$?
WB="$(drin "$C3" 'cat /backups/wiederherstellung_bericht.json')"
pruefe "das ganze Geraet aus dem neuesten Stand zurueck (Wegwerf-Datenbank)" \
  "$( { [ "$RC" = 0 ] && [ "$(feld status <<<"$WB")" = fertig ]; } && echo ja || echo nein)" \
  "$(feld status <<<"$WB"), $(feld tabellen <<<"$WB") Tabellen, Stand $(feld stand <<<"$WB" | cut -c1-8), $(feld dauer_sekunden <<<"$WB") s"
[ "$RC" = 0 ] || tail -n 15 "$ARBEIT/zurueck-geraet.log" | sed 's/^/      /'
PRUEF6="$(drin "$C3" '
  cd /arasul/firmenordner && f=$(sha256sum -c /backups/q-firma.sha 2>/dev/null | grep -vc ": OK$"); echo "firma_falsch=$f von $(wc -l < /backups/q-firma.sha)"
  a=$(ls /arasul/apps | grep -v "^\." | sort | diff - /backups/q-apps.txt >/dev/null && echo gleich || echo anders); echo "apps=$a"
  [ -f /arasul/flows/kanarie.md ] && echo flows=ja || echo flows=nein
  export PGPASSWORD=$(cat /run/secrets/postgres_password)
  echo "app_dbs=$(psql -h $POSTGRES_HOST -U $POSTGRES_USER -d postgres -tAc "select count(*) from pg_database where datname like '"'"'arasul\_app\_%'"'"'")"
')"
pruefe "... Firmenordner Byte fuer Byte, alle Apps, die Flows, die App-Datenbanken" \
  "$( { grep -q '^firma_falsch=0 ' <<<"$PRUEF6" && grep -q '^apps=gleich' <<<"$PRUEF6" && grep -q '^flows=ja' <<<"$PRUEF6" && ! grep -q '^app_dbs=0' <<<"$PRUEF6"; } && echo ja || echo nein)" \
  "$(tr '\n' ' ' <<<"$PRUEF6")"
APPDB="$(drin "$C3" 'ls /arasul/apps | grep -v "^\." | head -n1')"
APPDBNAME="$(drin "$C3" "PGPASSWORD=\$(cat /run/secrets/postgres_password) psql -h \$POSTGRES_HOST -U \$POSTGRES_USER -d \$POSTGRES_DB -tAc \"select datenbank from app_datenbanken where app_id='$APPDB' order by stand limit 1\"")"
if [ -n "$APPDBNAME" ]; then
  drin "$C3" "wiederherstellen.sh --app-datenbank $APPDBNAME" >"$ARBEIT/zurueck-appdb.log" 2>&1
  RC=$?
  pruefe "... eine App-Datenbank allein (${APPDBNAME})" "$(ja_wenn "$RC" 0)" "$(tail -n1 "$ARBEIT/zurueck-appdb.log" | sed 's/^\[[^]]*\] //')"
fi
drin "$C3" "wiederherstellen.sh --app-paket $APPDB" >"$ARBEIT/zurueck-paket.log" 2>&1
RC=$?
pruefe "... ein App-Paket allein (${APPDB})" "$(ja_wenn "$RC" 0)" "$(tail -n1 "$ARBEIT/zurueck-paket.log" | sed 's/^\[[^]]*\] //')"

echo
echo "Zahlen fuer den PR:"
echo "  Lauf 1 (Vollkopie): lokal $(mb "${G1:-0}"), Datentraeger $(mb "${E1:-0}"), gelesen $(mb "$(feld stand_gelesen_bytes <<<"$R1")")"
echo "  Lauf 2 (Nacht 2):   lokal $(mb "${G2:-0}"), Datentraeger $(mb "${E2:-0}"), gelesen $(mb "${L2:-0}")"
[ -n "$LLM_VORHER" ] && echo "  Sprachmodell:       ${LLM_VORHER} Token/s vorher, ${LLM_WAEHREND} waehrend Lauf 1"
echo
echo "gruen ${gruen}, rot ${rot}"
[ "$rot" = 0 ]
