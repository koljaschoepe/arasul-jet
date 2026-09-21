cd ~/j33mess && . ./lib.sh
N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026; S=http://j33mess-nextcloud-server; B=http://127.0.0.1:18081
KA=j33mess-nextcloud-klient-a; KB=j33mess-nextcloud-klient-b
sync_() { docker exec $1 sh -c "nextcloudcmd -h --non-interactive -u $2 -p $3 --path /Firma /arbeit/firma $S >/tmp/sync.log 2>&1; echo rc=\$?"; }
zaehl() { curl -s -u admin:$AP -X PROPFIND -H "Depth: 1" "$B/remote.php/dav/files/admin/Firma/Projekte/proj-00/" | grep -o "proj-00/[^/<]*/" | sort -u | tr '\n' ' '; echo; }
echo "--- am Server unter proj-00 vorher:"; zaehl
echo "--- Ausschluss zweiter Weg: .sync-exclude.lst in der Wurzel des Ordners, Ballast am Server loeschen, neu abgleichen"
for p in .git node_modules; do curl -s -o /dev/null -w "DELETE $p %{http_code}\n" -u admin:$AP -X DELETE "$B/remote.php/dav/files/admin/Firma/Projekte/proj-00/$p"; done
# Ohne Eintrag im lokalen Journal wuerde der Klient das Loeschen nachziehen; deshalb Journal weg = frischer Rechner mit vorhandenem Ordner
docker exec $KA sh -c 'rm -f /arbeit/firma/.sync_*.db*; printf ".git\nnode_modules\n" > /arbeit/firma/.sync-exclude.lst'
sync_ $KA anna $N
echo "am Server nachher:"; zaehl
docker exec $KA sh -c 'cd /arbeit/firma; echo "lokal bei A noch da: .git $(find . -path "*/.git/*" -type f | wc -l), node_modules $(find . -path "*/node_modules/*" -type f | wc -l)"'
wacht && echo wacht-ok
