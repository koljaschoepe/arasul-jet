cd ~/j33mess && . ./lib.sh
D=$(cut -d' ' -f1 $ERGEBNIS/oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D"); N="j33mess-Nutzer-2026"; AP=j33mess-Admin-2026
S=https://j33mess-opencloud-server:9200; U="$S/dav/spaces/$D"; B=https://127.0.0.1:18082
KA=j33mess-opencloud-klient-a; KB=j33mess-opencloud-klient-b
sync_() { docker exec -e LANG=C.UTF-8 $1 sh -c "owncloudcmd --trust --sync-hidden-files --non-interactive --exclude /aus.lst -u $2 -p $3 --server $S /arbeit/firma '$U' >/tmp/sync.log 2>&1; echo $1 rc=\$?"; }
zeig() { for k in $KA $KB; do echo "[$k]"; docker exec $k sh -c "cd /arbeit/firma/Projekte/proj-01 && for f in $1*; do echo \"  \$f: \$(cat \"\$f\")\"; done"; done; echo "[Server] $(curl -ks -u admin:$AP -X PROPFIND -H "Depth: 1" "$B/dav/spaces/$DE/Projekte/proj-01/" | grep -o "proj-01/$1[^<]*" | sort -u | tr '\n' ' ') -> $(curl -ks -u admin:$AP "$B/dav/spaces/$DE/Projekte/proj-01/$1.md")"; }
echo "=== Variante 2: Aenderungen 3 s auseinander, Abgleich gleichzeitig"
F=Projekte/proj-01/konflikt2.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma/$F"; sync_ $KA anna $N; sync_ $KB admin $AP
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma/$F"; sleep 3
docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma/$F"
sync_ $KA anna $N & sync_ $KB admin $AP & wait
sync_ $KA anna $N; sync_ $KB admin $AP; sync_ $KA anna $N
zeig konflikt2
echo "=== Variante 3: nacheinander -- A gleicht ab, B hat den Stand nicht geholt und gleicht danach ab"
F=Projekte/proj-01/konflikt3.md
docker exec $KA sh -c "echo 'Ausgangsfassung' > /arbeit/firma/$F"; sync_ $KA anna $N; sync_ $KB admin $AP
docker exec $KA sh -c "echo 'Fassung von A (anna)' > /arbeit/firma/$F"; sleep 2
docker exec $KB sh -c "echo 'Fassung von B (admin)' > /arbeit/firma/$F"
sync_ $KA anna $N; sync_ $KB admin $AP; sync_ $KA anna $N
zeig konflikt3
wacht && echo wacht-ok
