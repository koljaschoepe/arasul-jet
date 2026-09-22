# Der Code des Geräts gegen den echten Dienst

`treiber.js` fährt `ordnerdienst.js` **unverändert** gegen einen laufenden
Dateidienst — nicht eine Kette von `curl`-Aufrufen, von der jemand behauptet,
sie sei dasselbe.

**Die Datei liegt hier nicht als Kopie**, und das ist Absicht: eine Kopie im
Auditordner wäre am Tag nach der Messung eine andere Datei als die im Produkt,
und niemand würde es merken. Sie wird beim Messen hineingelegt:

```bash
mkdir -p src/services/firmenordner
cp ../../../../../../apps/dashboard-backend/src/services/firmenordner/ordnerdienst.js \
   src/services/firmenordner/
```

Dann, im Netz des Nebencontainers:

```bash
docker run --rm --network j33grenze_default -v "$PWD:/probe" -w /probe \
  -e COMPOSE_PROFILES=firmenordner \
  -e FIRMENORDNER_INTERN=https://j33grenze-firmenordner:9200 \
  -e FIRMENORDNER_ADMIN=admin \
  -e FIRMENORDNER_ADMIN_PASSWORT=j33grenze-Admin-2026 \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  node:22-alpine node treiber.js raum-weg '<raum-id>'
```

`NODE_TLS_REJECT_UNAUTHORIZED=0` ist der **eine** Unterschied zum Produkt: dort
beendet Traefik das TLS und das Backend spricht `http://firmenordner:9200`;
der Nebencontainer hat keinen Traefik davor und zeigt sein eigenes Zertifikat.
