# Orin. Probe 5 (Nextcloud): Anmeldung ueber die Nutzer von Arasul hinter Traefik.
# Weg: App user_saml im Modus "Umgebungsvariable" (Nextcloud liest den Nutzernamen aus der von
# der Forward-Auth gesetzten Kopfzeile X-Arasul-User, in PHP HTTP_X_ARASUL_USER).
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
occ() { docker exec -u www-data j33nach-nextcloud-server php occ "$@"; }
occ config:app:set user_saml type --value=environment-variable >/dev/null
occ config:app:set user_saml general-require_provisioned --value=0 >/dev/null 2>&1
occ saml:config:set 1 --general-uid_mapping=HTTP_X_ARASUL_USER --general-idp0_display_name=Arasul >/dev/null
occ config:system:set trusted_domains 6 --value=127.0.0.1:18083 >/dev/null
bash traefik/traefik-an.sh j33nach-nextcloud_default http://j33nach-nextcloud-server:80 >/dev/null
T=http://127.0.0.1:18083
c() { curl -s -o /tmp/j33-antwort -w '%{http_code}' "$@"; echo "  $(head -c 90 /tmp/j33-antwort | tr '\n' ' ')"; }
echo "1 ohne Sitzung (kein Cookie), WebDAV                 : $(c -X PROPFIND $T/remote.php/dav/files/anna/)"
echo "2 Sitzung (Cookie), OHNE Nextcloud-Passwort, WebDAV  : $(c -X PROPFIND -H 'Cookie: arasul_session=gueltig-anna' $T/remote.php/dav/files/anna/)"
echo "3 dasselbe, Ordner Firma/ des Teamordners            : $(c -X PROPFIND -H 'Cookie: arasul_session=gueltig-anna' $T/remote.php/dav/files/anna/Firma/)"
echo "4 Web-Oberflaeche /apps/files/ mit Sitzung           : $(c -H 'Cookie: arasul_session=gueltig-anna' $T/apps/files/)"
echo "5 mit Sitzung als anna, aber Kopfzeile X-Arasul-User: admin selbst mitgeschickt (Forward-Auth ueberschreibt?): $(c -X PROPFIND -H 'Cookie: arasul_session=gueltig-anna' -H 'X-Arasul-User: admin' $T/remote.php/dav/files/admin/)"
echo "6 SPOOF: mit Sitzung, dazu X_Arasul_User: admin (Unterstrich statt Bindestrich), Ziel /files/admin/: $(c -X PROPFIND -H 'Cookie: arasul_session=gueltig-anna' -H 'X_Arasul_User: admin' $T/remote.php/dav/files/admin/)"
echo "7 SPOOF ohne Sitzung: nur X_Arasul_User: admin      : $(c -X PROPFIND -H 'X_Arasul_User: admin' $T/remote.php/dav/files/admin/)"
echo "8 Umgehung der Forward-Auth: Kopfzeile direkt am Dienst (Port 18081, nicht ueber Traefik): $(c -X PROPFIND -H 'X-Arasul-User: admin' http://127.0.0.1:18081/remote.php/dav/files/admin/)"
echo "9 Basic-Anmeldung durch Traefik (Sync-Klient ohne Sitzung): $(c -X PROPFIND -u anna:j33nach-anna-2026 $T/remote.php/dav/files/anna/)"
wacht && echo wacht-ok
