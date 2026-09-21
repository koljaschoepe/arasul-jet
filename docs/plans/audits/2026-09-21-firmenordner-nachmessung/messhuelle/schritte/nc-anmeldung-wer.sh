# Orin. Wer ist angemeldet? (OCS /cloud/user nennt die Kennung) -- fuer die Kopfzeilen-Faelle
cd ~/j33nach
T=http://127.0.0.1:18083
wer() { curl -s -H 'OCS-APIRequest: true' -H 'Accept: application/json' "$@" $T/ocs/v2.php/cloud/user?format=json | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["ocs"]["data"]["id"])
except Exception: print("-- niemand --")'; }
echo "Sitzung anna                                           -> $(wer -H 'Cookie: arasul_session=gueltig-anna')"
echo "Sitzung anna + eigene X-Arasul-User: admin             -> $(wer -H 'Cookie: arasul_session=gueltig-anna' -H 'X-Arasul-User: admin')"
echo "Sitzung anna + X_Arasul_User: admin (Unterstrich)      -> $(wer -H 'Cookie: arasul_session=gueltig-anna' -H 'X_Arasul_User: admin')"
echo "keine Sitzung + X_Arasul_User: admin (Unterstrich)     -> $(wer -H 'X_Arasul_User: admin')"
echo "keine Sitzung + X-Arasul-User: admin                   -> $(wer -H 'X-Arasul-User: admin')"
echo "direkt am Dienst (18081) + X-Arasul-User: admin        -> $(curl -s -H 'OCS-APIRequest: true' -H 'Accept: application/json' -H 'X-Arasul-User: admin' 'http://127.0.0.1:18081/ocs/v2.php/cloud/user?format=json' | python3 -c 'import sys,json
try: print(json.load(sys.stdin)["ocs"]["data"]["id"])
except Exception: print("-- niemand --")')"
echo "--- die Web-Oberflaeche (Browser) mit Sitzung: Weiterleitung?"
curl -s -o /dev/null -w "GET /index.php/apps/files/ (Sitzung anna): %{http_code} -> %{redirect_url}\n" -H 'Cookie: arasul_session=gueltig-anna' $T/index.php/apps/files/
curl -s -o /dev/null -w "GET /login (Sitzung anna): %{http_code} -> %{redirect_url}\n" -H 'Cookie: arasul_session=gueltig-anna' $T/login
