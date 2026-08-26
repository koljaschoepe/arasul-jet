#!/bin/bash
# =============================================================================
# souveraenitaet-abnahme.sh — "Daten verlassen nie das Haus", nachgemessen.
#
# Das ist der Satz, mit dem Arasul verkauft wird, und er stand bis zum
# 23.08.2026 nur in der Broschuere. Ein Gutachten kann man behaupten; eine
# offene Verbindung nicht.
#
# Gemessen wird, waehrend das Geraet ARBEITET, nicht im Leerlauf. Im Leerlauf
# telefoniert fast jede Software nicht. Deshalb laeuft parallel die Abnahme der
# Kernkette (Dokument hochladen, Frage stellen, Antwort mit Quelle), und
# waehrenddessen wird alle zwei Sekunden nachgesehen, wohin die Container
# verbunden sind.
#
# Als "drinnen" gelten: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 und
# der Tailnet-Bereich 100.64/10. Alles andere ist draussen und wird gemeldet.
#
# Der Tailnet-Bereich zaehlt als drinnen, WEIL der Fernzugriff eine bewusst
# eingeschaltete Funktion ist. Er wird trotzdem einzeln ausgewiesen: wer das
# Geraet ohne Fernzugriff betreibt, darf dort nichts sehen.
#
# WAS DIESE MESSUNG NICHT KANN, und das gehoert dazu: sie sieht alle zwei
# Sekunden nach, welche Verbindungen OFFEN sind. Eine Verbindung, die zwischen
# zwei Blicken aufgeht und wieder zu ist, entgeht ihr. Fuer ein Gutachten
# braeuchte es eine Mitschrift auf Paketebene; fuer die Frage "telefoniert das
# Geraet im Betrieb nach Hause" ist die Stichprobe belastbar, weil eine
# Anbindung, die etwas taete, nicht nur Millisekunden offen waere.
#
# Aufruf (SSH-Tunnel auf 8443 vorausgesetzt):
#   bash scripts/test/souveraenitaet-abnahme.sh            nur die Kernkette
#   bash scripts/test/souveraenitaet-abnahme.sh alles      die ganze Reihe
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$WURZEL"

HOST="${ARASUL_SSH:-jetson}"
# Ziele, die eine Erweiterung im Manifest DEKLARIERT hat und die deshalb
# erlaubt sind. Kommagetrennt, als IP oder als Name. Der Fernzugriff braucht
# hier nichts: sein Bereich (100.64/10) zaehlt ohnehin als drinnen.
ERLAUBT="${ARASUL_ERLAUBTE_ZIELE:-}"

# Container, deren Weg nach draussen die FUNKTION ist und nicht ihr Gegenteil.
# Bewusst als Liste von Containern und nicht von Zielen: ein Dienst, der
# Modelle nachlaedt, spricht je Modell mit anderen Adressen, eine Aufzaehlung
# waere am naechsten Tag unvollstaendig. (Bis Phase B5 am 26.08.2026 stand
# hier auch `searxng`, die Websuche der Flows; sie ist ausgebaut.)
#
# `embedding-service` steht seit dem 23.08.2026 hier, und zwar als
# ENTSCHEIDUNG von Kolja, nicht als Nachlaessigkeit: der Dienst laedt seine
# Modelle von huggingface.co, und genau das soll er duerfen. Der Kunde soll
# neue Modelle selbst nachladen koennen, auch wenn sein Geraet nie wieder eine
# Software-Aktualisierung sieht. Ein Geraet, das keine Modelle mehr bekommt,
# altert schneller als eines, das einmal telefoniert.
#
# Was das NICHT heisst: dass Kundendaten hinausgehen. Was hinausgeht, ist der
# Name eines Modells. Der Unterschied gehoert in die Datenschutz-Unterlagen,
# und er steht dort.
NACH_AUSSEN_ERLAUBT="${ARASUL_ERLAUBTE_CONTAINER:-embedding-service}"
# Die Proben BLEIBEN nach dem Lauf liegen, wenn etwas nach draussen ging.
# Am 23.08.2026 stand am Ende `llm-service 34.36.133.15|31|31`, und die Datei
# war schon geloescht — die Frage "wann genau und auf welchem Port" liess sich
# nicht mehr beantworten, und der Fund war danach nicht zu reproduzieren. Eine
# Messung, die ihren eigenen Beleg wegwirft, kostet einen ganzen Nachmittag.
PROBEN_DATEI="/tmp/arasul-souveraenitaet-$$.txt"
STOP_DATEI="/tmp/arasul-souveraenitaet-$$.stop"

ergebnisse=0
rot=0
pruefe() { # name, ok(ja/nein), detail
  ergebnisse=$((ergebnisse + 1))
  if [ "$2" = "ja" ]; then
    printf 'gruen  %-52s %s\n' "$1" "${3:-}"
  else
    printf 'ROT    %-52s %s\n' "$1" "${3:-}"
    rot=$((rot + 1))
  fi
}

if ! nc -z localhost 8443 2>/dev/null; then
  echo "Kein Tunnel auf localhost:8443. Erst:  ssh -f -N -L 8443:localhost:443 $HOST"
  exit 1
fi

# --- Der Beobachter auf dem Geraet -------------------------------------------
# Laeuft, bis die Stopp-Datei da ist. `nsenter` sieht in den Netz-Namensraum
# jedes Containers; ohne das saehe man nur den Host und nicht die Container.
#
# `state connected` und nicht `state established`. Der Unterschied ist kein
# Detail: am 23.08.2026 hielt `embedding-service` eine Verbindung zu
# `huggingface.co` im Zustand CLOSE-WAIT, und die Messung sah sie NICHT. Sie
# meldete "keine einzige" nach draussen, waehrend das Kabel noch dranhing.
#
#   CLOSE-WAIT 25 0  172.30.0.74:45468  3.160.39.100:443
#
# Ein halb geschlossener Anschluss ist der Beweis, dass gesprochen WURDE, und
# ein TIME-WAIT genauso. Fuer ein Gate, das "Daten bleiben auf dem Geraet"
# heisst, zaehlt beides.
#
# Mit dem Zustandsfilter `connected` traegt `ss` eine Spalte mehr: der
# Gegenueber steht in $5 statt in $4. Dieselbe Falle wie am 22.08.2026 bei den
# awk-Feldnummern, deshalb steht sie hier.
lauscher() {
  ssh "$HOST" "rm -f $PROBEN_DATEI $STOP_DATEI
    while [ ! -f $STOP_DATEI ]; do
      for c in \$(docker ps --format '{{.Names}}'); do
        pid=\$(docker inspect \$c --format '{{.State.Pid}}' 2>/dev/null)
        [ -z \"\\\$pid\" ] && continue
        [ \"\\\$pid\" = 0 ] && continue
        sudo -n nsenter -t \$pid -n ss -tn state connected 2>/dev/null |
          tail -n +2 | awk -v c=\$c 'NF>=5 {print c, \$5, \$1}'
      done >> $PROBEN_DATEI
      sleep 2
    done" 2>/dev/null
}

echo "=== Souveraenitaets-Abnahme, $(date '+%d.%m. %H:%M') ==="
echo "Der Beobachter laeuft, waehrend die Kernkette arbeitet."
echo ""

lauscher &
LAUSCHER_PID=$!
sleep 3

# --- Die Arbeit ---------------------------------------------------------------
# Ohne Argument die Kernkette (drei Minuten), mit `alles` die ganze Reihe
# (eine Viertelstunde). Je laenger gearbeitet wird, desto mehr sagt das
# Ergebnis.
if [ "${1:-}" = "alles" ]; then
  ARBEIT='bash scripts/test/abnahmen.sh'
  WAS='die ganze Abnahme-Reihe'
  # Die Bruecken-Abnahme baut eine Erweiterung mit der Faehigkeit `netz` und
  # dem Ziel `https://example.com/` im Manifest. Sie ruft also mit Absicht
  # nach draussen — das ist die Funktion, nicht ihr Gegenteil. Ohne diese
  # Zeile meldete die Messung ihren eigenen Aufruf als Verstoss (23.08.2026).
  ERLAUBT="${ERLAUBT:+$ERLAUBT,}example.com"
else
  # Bis B2 lief hier die Dokument-Abnahme (hochladen, fragen, Quelle). Chat und
  # Explorer sind gefallen; die Oberflaechen-Abnahme geht durch jede Ansicht
  # und haelt das Geraet waehrend der Messung genauso beschaeftigt.
  ARBEIT='node scripts/test/oberflaeche-abnahme.mjs'
  WAS='die Oberflaechen-Abnahme'
fi
[ -n "$ERLAUBT" ] && echo "Erlaubte, deklarierte Ziele: $ERLAUBT" && echo ""
$ARBEIT > /tmp/arasul-souv-kette-$$.log 2>&1
KETTE=$?
KETTE_ZEILE=$(tail -2 /tmp/arasul-souv-kette-$$.log | tr '\n' ' ')

ssh "$HOST" "touch $STOP_DATEI" 2>/dev/null
wait "$LAUSCHER_PID" 2>/dev/null

pruefe "$WAS lief waehrend der Messung" \
  "$([ "$KETTE" = "0" ] && echo ja || echo nein)" "$KETTE_ZEILE"

# --- Auswertung ---------------------------------------------------------------
AUSWERTUNG=$(ssh "$HOST" "cat $PROBEN_DATEI 2>/dev/null" | awk '
{
  peer=$2; zustand=$3;
  # IPv6 steht in eckigen Klammern: [::1]:33008, [fe80::1]:80. Vorher lief nur
  # `sub(/\]/,"")` und danach ein Split an ":" — aus [::1]:33008 wurde damit die
  # "Adresse" [ , und die zaehlte als DRAUSSEN. Am 23.08.2026 standen so
  # `minio [` 317-mal, `docker-proxy [` 317-mal und `n8n [` 211-mal in der
  # Auswertung, alles in Wahrheit die eigene Maschine (23.08.2026).
  if (peer ~ /^\[/) {
    klammer = peer; sub(/^\[/,"",klammer); n6 = index(klammer, "]");
    ip6 = (n6 > 1 ? substr(klammer, 1, n6 - 1) : "");
    if (ip6 ~ /^::ffff:/) { sub(/^::ffff:/,"",ip6); ip = ip6 }
    else {
      # ::1 ist die Rueckschleife, fe80:: das Verbindungslokale, fc00::/7 das
      # eindeutig lokale. Alles andere waere eine echte Adresse nach draussen.
      if (ip6 == "::1" || ip6 ~ /^fe80:/ || ip6 ~ /^f[cd]/) next;
      ip = ip6;
    }
  } else {
    n = split(peer, a, ":"); ip = a[1];
  }
  if (zustand != "") zustaende[$1 " " ip] = zustaende[$1 " " ip] (index(zustaende[$1 " " ip], zustand) ? "" : (zustaende[$1 " " ip] ? "," : "") zustand);
  if (ip == "") next;
  if (ip ~ /^10\./ || ip ~ /^127\./ || ip ~ /^192\.168\./ || ip ~ /^169\.254\./) next;
  if (ip ~ /^172\.(1[6-9]|2[0-9]|3[01])\./) next;
  if (ip ~ /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./) { tailnet[$1 " " ip]++; next }
  draussen[$1 " " ip]++
}
END {
  for (k in tailnet) print "TAILNET|" k "|" tailnet[k];
  for (k in draussen) print "DRAUSSEN|" k "|" draussen[k] "|" zustaende[k];
}')

PROBEN=$(ssh "$HOST" "wc -l < $PROBEN_DATEI 2>/dev/null" | tr -d ' ')
# Die Proben nur dann wegwerfen, wenn NICHTS nach draussen ging. Ging etwas,
# bleiben sie liegen und ihr Pfad steht am Ende — sonst ist der einzige Beleg
# weg, bevor jemand ihn ansehen kann (23.08.2026 genau so passiert).
if printf '%s' "$AUSWERTUNG" | grep -q '^DRAUSSEN|'; then
  BELEG=$(ssh "$HOST" "cp $PROBEN_DATEI /tmp/arasul-souveraenitaet-beleg.txt 2>/dev/null && echo /tmp/arasul-souveraenitaet-beleg.txt")
fi
ssh "$HOST" "rm -f $PROBEN_DATEI $STOP_DATEI" 2>/dev/null
rm -f /tmp/arasul-souv-kette-$$.log

pruefe 'es wurde ueberhaupt beobachtet' \
  "$([ "${PROBEN:-0}" -gt 50 ] && echo ja || echo nein)" "${PROBEN:-0} Verbindungszeilen gesehen"

# Jede Adresse rueckwaerts aufloesen, damit in der Meldung ein Name steht und
# nicht nur eine Zahl. Danach gegen die erlaubten Ziele halten.
GEPRUEFT=""
while IFS= read -r zeile; do
  case "$zeile" in
    DRAUSSEN\|*) ;;
    *) continue ;;
  esac
  # Die Zeile sieht so aus:  DRAUSSEN|<container> <ip>|<anzahl>|<zustaende>
  # Mit -F'[| ]' ist also $2 der Container und $3 die Adresse. Vorher stand
  # hier $4, und das ist die ANZAHL: die Rueckwaertsaufloesung bekam eine Zahl
  # zu sehen, fand nichts, und schrieb die Zahl als "Namen" in die Meldung.
  # Genau deshalb las der erste Fund sich als `llm-service 34.36.133.15|31|31`
  # (23.08.2026).
  container=$(printf '%s' "$zeile" | awk -F'[| ]' '{print $2}')
  ip=$(printf '%s' "$zeile" | awk -F'[| ]' '{print $3}')
  # `ssh -n`: OHNE das liest ssh die Eingabe der Schleife mit auf, und die
  # Schleife endet nach dem ERSTEN Eintrag. Genau daran hat diese Messung
  # bisher immer nur ein einziges Ziel geprueft — in einem Lauf mit sechs
  # Zielen stand eines in der Meldung, und die anderen fuenf, darunter
  # `embedding-service` nach huggingface.co, fielen still unter den Tisch
  # (23.08.2026).
  name=$(ssh -n "$HOST" "getent hosts $ip 2>/dev/null | awk '{print \$2}'" 2>/dev/null | head -1)
  [ -z "$name" ] && name="$ip"
  erlaubt=nein
  for erlaubter in $(printf '%s' "$NACH_AUSSEN_ERLAUBT" | tr ',' ' '); do
    [ "$container" = "$erlaubter" ] && erlaubt=ja
  done
  if [ -n "$ERLAUBT" ]; then
    IFS=',' read -r -a ziele <<< "$ERLAUBT"
    for z in "${ziele[@]}"; do
      z=$(printf '%s' "$z" | tr -d ' ')
      [ -z "$z" ] && continue
      case "$name" in *"$z"*) erlaubt=ja ;; esac
      [ "$ip" = "$z" ] && erlaubt=ja
    done
  fi
  GEPRUEFT="$GEPRUEFT$erlaubt|$zeile|$name"$'\n'
done <<< "$AUSWERTUNG"

DRAUSSEN=$(printf '%s' "$GEPRUEFT" | grep -c '^nein|' 2>/dev/null)
ERLAUBTE_TREFFER=$(printf '%s' "$GEPRUEFT" | grep -c '^ja|' 2>/dev/null)
TAILNET=$(printf '%s\n' "$AUSWERTUNG" | grep -c '^TAILNET|' 2>/dev/null)

pruefe 'kein Container hat unangekuendigt nach draussen verbunden' \
  "$([ "${DRAUSSEN:-0}" = "0" ] && echo ja || echo nein)" \
  "$([ "${DRAUSSEN:-0}" = "0" ] && echo 'keine einzige' || echo "${DRAUSSEN} Stueck, siehe unten")"

# Alle roten Ziele einzeln, nicht die ersten fuenf in einer Zeile. Am
# 23.08.2026 standen neun in den Daten und eines in der Meldung.
if [ "${DRAUSSEN:-0}" != "0" ]; then
  echo ""
  echo "Unangekuendigt nach draussen:"
  printf '%s' "$GEPRUEFT" | grep '^nein|' | while IFS= read -r z; do
    echo "  $(printf '%s' "$z" | sed 's/^nein|DRAUSSEN|/  /')"
  done
fi

if [ "${ERLAUBTE_TREFFER:-0}" != "0" ]; then
  echo ""
  echo "Deklarierte Ziele, die wirklich gerufen wurden:"
  printf '%s' "$GEPRUEFT" | grep '^ja|' | sed 's/^ja|/  /'
fi

if [ "${TAILNET:-0}" != "0" ]; then
  echo ""
  echo "Hinweis: Verbindungen im Tailnet-Bereich (Fernzugriff, bewusst eingeschaltet):"
  printf '%s\n' "$AUSWERTUNG" | grep '^TAILNET|' | sed 's/^/  /'
fi

if [ -n "${BELEG:-}" ]; then
  echo ""
  echo "Die Rohproben liegen auf dem Geraet: $BELEG"
  echo "Darin steht je Zeile Container, lokale und entfernte Adresse mit Port."
fi

echo ""
echo "$((ergebnisse - rot)) von $ergebnisse gruen"
[ "$rot" -eq 0 ] || exit 1
