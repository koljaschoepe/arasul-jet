# Orin. Gegenprobe zur CPU-Grenze: derselbe Upload, einmal ohne Grenze (docker update --cpus 0
# am eigenen Messcontainer), danach Grenze wieder gesetzt.
#   cpu-ohne-grenze.sh <kandidat> <container> <basis-url> <nutzer:passwort> <fern-ordner>
cd ~/j33nach && . ./lib.sh; set +e +o pipefail
K=$1; C=$2
echo "Grenze vorher: $(docker inspect -f '{{.HostConfig.NanoCpus}}' $C) NanoCpus"
docker update --cpus 12 $C >/dev/null; echo "zwoelf Kerne (= ohne Grenze): $(docker inspect -f '{{.HostConfig.NanoCpus}}' $C) NanoCpus"
./sampler.sh an $K $K-frei; sleep 3
python3 webdav.py hoch "$3" "$4" ~/j33nach/baum "$5" 4
sleep 3; ./sampler.sh aus $K-frei
docker update --cpus 2 $C >/dev/null; echo "Grenze wieder: $(docker inspect -f '{{.HostConfig.NanoCpus}}' $C) NanoCpus"
wacht && echo wacht-ok
