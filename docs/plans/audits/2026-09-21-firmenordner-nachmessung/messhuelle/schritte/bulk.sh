# Orin. Dauer, RAM und CPU fuer Koljas Arbeitsbaum, nur der Dienst (ohne WLAN dazwischen).
#   bulk.sh <kandidat> <basis-url> <nutzer:passwort> <fern-ordner> <datenpfad-am-geraet>
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
K=$1; URL=$2; AUTH=$3; FERN=$4; DATEN=$5
find ~/j33nach/baum -type f | sed "s|$HOME/j33nach/baum/||" > ergebnis/liste.txt
echo "Baum: $(wc -l < ergebnis/liste.txt) Dateien, $(du -sm ~/j33nach/baum | cut -f1) MB, $(find ~/j33nach/baum -type d | wc -l) Ordner"
echo "--- Leerlauf (5 Proben ueber 10 s)"; for i in 1 2 3 4 5; do ram_jetzt $K; sleep 2; done
echo "Platte des Dienstes vorher: $(sudo -n du -sm "$DATEN" 2>/dev/null | cut -f1 || du -sm "$DATEN" | cut -f1) MB"
./sampler.sh an $K $K-hoch; sleep 3
python3 webdav.py hoch "$URL" "$AUTH" ~/j33nach/baum "$FERN" 4
sleep 5; ./sampler.sh aus $K-hoch
echo "RAM nach 30 s Ruhe:"; sleep 30; ram_jetzt $K
echo "Platte des Dienstes nachher: $(sudo -n du -sm "$DATEN" 2>/dev/null | cut -f1 || du -sm "$DATEN" | cut -f1) MB"
./sampler.sh an $K $K-abgleich; sleep 2
python3 webdav.py abgleich "$URL" "$AUTH" ~/j33nach/baum "$FERN" 1
sleep 2; ./sampler.sh aus $K-abgleich
mkdir -p ~/j33nach/runter
./sampler.sh an $K $K-runter; sleep 3
QUELLE=ergebnis/liste.txt python3 webdav.py runter "$URL" "$AUTH" ~/j33nach/runter "$FERN" 4
sleep 5; ./sampler.sh aus $K-runter
echo "Vergleich hoch/runter: $(diff -rq ~/j33nach/baum ~/j33nach/runter | wc -l) Abweichungen"
wacht && echo wacht-ok
