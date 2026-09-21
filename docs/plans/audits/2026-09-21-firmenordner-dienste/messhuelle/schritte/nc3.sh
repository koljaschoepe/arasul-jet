cd ~/j33mess && . ./lib.sh
N="j33mess-Nutzer-2026"; S=http://j33mess-nextcloud-server
KA=j33mess-nextcloud-klient-a; KB=j33mess-nextcloud-klient-b
docker cp testordner.py $KA:/testordner.py >/dev/null
docker exec $KA sh -c 'mkdir -p /arbeit/firma && python3 /testordner.py /arbeit/firma'
docker exec $KB mkdir -p /arbeit/firma
# Ausschlussliste: nextcloudcmd nimmt --exclude; -h nimmt versteckte Dateien MIT (sonst fehlte .claude)
printf '.git\nnode_modules\n' > /tmp/j33-aus.lst
docker cp /tmp/j33-aus.lst $KA:/aus.lst >/dev/null; docker cp /tmp/j33-aus.lst $KB:/aus.lst >/dev/null
sync_() { # <container> <nutzer>
  docker exec $1 sh -c "nextcloudcmd -h --non-interactive --exclude /aus.lst -u $2 -p $N --path /Firma /arbeit/firma $S >/tmp/sync.log 2>&1; echo rc=\$?"
}
echo "--- Abgleich hoch (Klient A, anna), 2.000 Dateien + Ballast"
ram_mitschreiben nextcloud "$ERGEBNIS/nextcloud-hoch.ram"
t0=$(date +%s.%N); sync_ $KA anna; t1=$(date +%s.%N)
ram_stopp "$ERGEBNIS/nextcloud-hoch.ram"
echo "Dauer hoch: $(echo "$t1 - $t0" | bc) s"; ram_spitze "$ERGEBNIS/nextcloud-hoch.ram"
wacht
echo "--- Abgleich herunter (Klient B, admin)"
ram_mitschreiben nextcloud "$ERGEBNIS/nextcloud-runter.ram"
t0=$(date +%s.%N); sync_ $KB admin; t1=$(date +%s.%N)
ram_stopp "$ERGEBNIS/nextcloud-runter.ram"
echo "Dauer herunter: $(echo "$t1 - $t0" | bc) s"; ram_spitze "$ERGEBNIS/nextcloud-runter.ram"
echo "--- Zaehlung bei B"
docker exec $KB sh -c 'cd /arbeit/firma; echo "Dateien unter Projekte+Prozesse (ohne Ballast): $(find Projekte Prozesse -type f -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.claude/*" -not -name ".sync_*" -not -name "*.md" -o -name "datei-*" -type f | grep -c datei-)"; echo ".git: $(find . -path "*/.git/*" -type f | wc -l)  node_modules: $(find . -path "*/node_modules/*" -type f | wc -l)  .claude: $(find . -path "*/.claude/*" -type f | wc -l)"'
echo "--- zweiter Lauf ohne Aenderung (Klient A)"
t0=$(date +%s.%N); sync_ $KA anna; t1=$(date +%s.%N); echo "Dauer Leerlauf-Abgleich: $(echo "$t1 - $t0" | bc) s"
echo "--- Platte nachher"
for v in j33mess-nextcloud_daten j33mess-nextcloud_db; do echo "$v $(volumen_mb $v) MB"; done
ram_jetzt nextcloud
wacht && echo wacht-ok
