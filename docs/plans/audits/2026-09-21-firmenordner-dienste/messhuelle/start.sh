#!/usr/bin/env bash
# Vor der ersten Messung: Lage festhalten, Klienten-Abbild bauen.
cd "$(dirname "$0")"; . ./lib.sh
lage "Vor der ersten Messung" | tee "$ERGEBNIS/lage-vorher.md"
wacht_merken
docker build -q -t j33mess-client:1 client
docker image inspect j33mess-client:1 -f 'Klienten-Abbild: {{.Size}} Bytes, {{.Architecture}}'
docker run --rm --memory 256m --name j33mess-versionen j33mess-client:1 sh -c 'nextcloudcmd --version | head -1; owncloudcmd --version | head -1; dpkg -s seafile-cli | grep ^Version'
wacht
