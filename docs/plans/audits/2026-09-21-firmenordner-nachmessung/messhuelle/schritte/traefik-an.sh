# Orin. Traefik (eigener Messcontainer) + Stub der Arasul-Forward-Auth vor einem Kandidaten.
#   traefik-an.sh <netz des Kandidaten> <ziel-url im Netz>      |   traefik-an.sh aus
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
if [ "$1" = aus ]; then docker rm -f j33nach-traefik j33nach-authstub >/dev/null 2>&1; echo weg; exit 0; fi
NETZ=$1; ZIEL=$2
mkdir -p traefik-cfg; sed "s|__ZIEL__|$ZIEL|" traefik/dyn.yml > traefik-cfg/dyn.yml; cp traefik/stub.php traefik-cfg/stub.php
docker rm -f j33nach-traefik j33nach-authstub >/dev/null 2>&1
docker run -d --name j33nach-authstub --network $NETZ --memory 128m --cpus 0.5 -v ~/j33nach/traefik-cfg:/s:ro nextcloud:latest php -S 0.0.0.0:8080 /s/stub.php >/dev/null
docker run -d --name j33nach-traefik --network $NETZ --memory 256m --cpus 0.5 -p 127.0.0.1:18083:8000 -v ~/j33nach/traefik-cfg/dyn.yml:/dyn.yml:ro traefik:v2.11 \
  --entrypoints.web.address=:8000 --providers.file.filename=/dyn.yml --log.level=WARN >/dev/null
sleep 4; docker ps --format '{{.Names}} {{.Status}}' | grep j33nach-
wacht && echo wacht-ok
