# Mac. Wie schnell ist der Klient am Mac ueber diese WLAN-Strecke? 60 Dateien aus dem Arbeitsbaum
# (die ersten 60 nach Pfad sortiert, zusammen ~1 MB), hoch und danach in einen zweiten Ordner.
#   mac-rate.sh oc|nc
. "$(dirname "$0")/../mac.sh"
W=/tmp/j33-rate-$1-a; V=/tmp/j33-rate-$1-b; mkdir -p $W $V; find $W $V -mindepth 1 -delete
(cd /tmp/j33-arbeitsbaum-clean && find . -type f -size -20k | sort | head -60 | rsync -a --files-from=- ./ $W/)
echo "Dateien: $(find $W -type f | wc -l), $(du -sk $W | cut -f1) KB; Ping zum Orin: $(ping -c 5 -q 192.168.0.197 | tail -1)"
if [ "$1" = oc ]; then
  D=$(cat /tmp/j33-oc-drive); DE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$D")
  curl -ks -o /dev/null -u admin:j33nach-Admin-2026 -X MKCOL "$OCB/dav/spaces/$DE/ratetest"
  echo "hoch:";   zeit oc anna j33nach-anna-2026 Firma $W --remote-folder ratetest
  echo "runter:"; zeit oc admin j33nach-Admin-2026 Firma $V --remote-folder ratetest
  echo "ohne Aenderung:"; zeit oc admin j33nach-Admin-2026 Firma $V --remote-folder ratetest
else
  curl -s -o /dev/null -u anna:j33nach-anna-2026 -X MKCOL "$NCB/remote.php/dav/files/anna/Firma/ratetest"
  echo "hoch:";   zeit ncs anna j33nach-anna-2026 $W --path /Firma/ratetest
  echo "runter:"; zeit ncs admin j33nach-Admin-2026 $V --path /Firma/ratetest
  echo "ohne Aenderung:"; zeit ncs admin j33nach-Admin-2026 $V --path /Firma/ratetest
fi
echo "Dateien unten: $(find $V -type f -not -name '.sync_*' -not -name '._sync_*' | wc -l)"
