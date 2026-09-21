# Mac. Koljas Arbeitsbaum (619 Dateien, 111 MB) mit dem Klienten am Mac ueber das WLAN: hoch, dann in
# einen zweiten Ordner herunter, dann ein Abgleich ohne Aenderung. RAM/CPU des Dienstes schreibt der
# Orin mit (sampler.sh).   mac-voll.sh oc|nc
. "$(dirname "$0")/../mac.sh"
K=$1; W=/tmp/j33-voll-$K-a; V=/tmp/j33-voll-$K-b; mkdir -p $W $V; find $W $V -mindepth 1 -delete
rsync -a /tmp/j33-arbeitsbaum-clean/ $W/
echo "Ping zum Orin vorher: $(ping -c 5 -q 192.168.0.197 | tail -1 | cut -d= -f2)"
if [ $K = oc ]; then
  D=$(cat /tmp/j33-oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D"); curl -ks -o /dev/null -u admin:j33nach-Admin-2026 -X MKCOL "$OCB/dav/spaces/$DE/Mac-Arbeitsbaum"
  hoch()   { oc anna j33nach-anna-2026 Firma $W --remote-folder Mac-Arbeitsbaum; }
  runter() { oc admin j33nach-Admin-2026 Firma $V --remote-folder Mac-Arbeitsbaum; }
  Kand=opencloud
else
  curl -s -o /dev/null -u anna:j33nach-anna-2026 -X MKCOL "$NCB/remote.php/dav/files/anna/Firma/Mac-Arbeitsbaum"
  hoch()   { ncs anna j33nach-anna-2026 $W --path /Firma/Mac-Arbeitsbaum; }
  runter() { ncs admin j33nach-Admin-2026 $V --path /Firma/Mac-Arbeitsbaum; }
  Kand=nextcloud
fi
ssh $ORIN "~/j33nach/sampler.sh an $Kand $Kand-mac-hoch"; sleep 3
s=$(date +%s); TAIL=1 hoch | grep -v -E 'info |nextcloud.sync'; echo "hoch: $(( $(date +%s) - s )) s"; sleep 3
ssh $ORIN "~/j33nach/sampler.sh aus $Kand-mac-hoch" | tail -1
ssh $ORIN "~/j33nach/sampler.sh an $Kand $Kand-mac-runter"; sleep 3
s=$(date +%s); TAIL=1 runter | grep -v -E 'info |nextcloud.sync'; echo "runter: $(( $(date +%s) - s )) s"; sleep 3
ssh $ORIN "~/j33nach/sampler.sh aus $Kand-mac-runter" | tail -1
s=$(date +%s); TAIL=1 runter | grep -v -E 'info |nextcloud.sync'; echo "Abgleich ohne Aenderung: $(( $(date +%s) - s )) s"
echo "Dateien unten: $(find $V -type f -not -name '.sync_*' -not -name '._sync_*' -not -name '.sync_journal*' | wc -l) von $(find $W -type f -not -name '.sync_*' -not -name '.sync_journal*' | wc -l)"
echo "Ping zum Orin nachher: $(ping -c 5 -q 192.168.0.197 | tail -1 | cut -d= -f2)"
