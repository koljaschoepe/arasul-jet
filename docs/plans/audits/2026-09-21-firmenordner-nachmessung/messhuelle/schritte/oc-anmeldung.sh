# Orin. Probe 5 (OpenCloud): Anmeldung ueber die Nutzer von Arasul hinter Traefik.
# Traefik + Stub der Arasul-Forward-Auth (traefik-an.sh) stehen vor dem Dienst, Port 18083.
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
T=http://127.0.0.1:18083
c() { curl -s -o /tmp/j33-antwort -w '%{http_code}' "$@"; echo "  $(head -c 110 /tmp/j33-antwort | tr '\n' ' ')"; }
echo "1 ohne Sitzung (kein Cookie)                       : $(c $T/graph/v1.0/me)"
echo "2 mit Sitzung, Kopfzeilen X-Arasul-User=anna kommen an: $(c -H 'Cookie: arasul_session=gueltig-anna' $T/graph/v1.0/me)"
echo "3 mit Sitzung + selbst mitgeschickte Kopfzeilen (X-Arasul-User, Remote-User, X-Forwarded-User): $(c -H 'Cookie: arasul_session=gueltig-anna' -H 'X-Arasul-User: anna' -H 'Remote-User: anna' -H 'X-Forwarded-User: anna' $T/graph/v1.0/me)"
echo "4 mit Sitzung + Basic-Anmeldung anna am Dienst      : $(c -H 'Cookie: arasul_session=gueltig-anna' -u anna:j33nach-anna-2026 $T/graph/v1.0/me)"
echo "5 ohne Sitzung, aber Basic-Anmeldung (Sync-Klient)  : $(c -u anna:j33nach-anna-2026 $T/graph/v1.0/me)"
echo "--- was der Dienst als Anmeldeweg anbietet (well-known)"
curl -ks https://127.0.0.1:18082/.well-known/openid-configuration | python3 -c 'import json,sys; d=json.load(sys.stdin); print("  issuer:", d["issuer"]); print("  Anmeldeweg: OIDC (eingebauter Anbieter idp), Code-Flow mit PKCE")'
docker exec j33nach-opencloud-server sh -c 'ls /var/lib/opencloud/idm /var/lib/opencloud/idp 2>/dev/null | head -4'
wacht && echo wacht-ok
