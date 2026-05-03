# Phase 2.6 — Container-Image-Signierung mit Cosign

> Schützt vor manipulierten Image-Pulls. Box verifiziert vor jedem
> Container-Start, dass das Image vom Arasul-Build-Server signiert ist.
> Verhindert Supply-Chain-Angriffe via Registry-Kompromittierung.

---

## Bedrohungsmodell

Ohne Cosign: Wenn Docker Hub / die private Registry kompromittiert ist,
kann ein Angreifer ein verändertes `arasul-platform-dashboard-backend:latest`
ausspielen, das die Box nach dem nächsten Update unbemerkt übernimmt.

Mit Cosign: Box pullt nur Images mit gültiger Signatur. Manipulierte
Images werden vor dem Start abgelehnt.

---

## Build-Server Setup (CI / Solo-Dev-Workstation)

```bash
# 1. Cosign installieren
curl -L https://github.com/sigstore/cosign/releases/download/v2.4.0/cosign-linux-amd64 \
    -o /usr/local/bin/cosign
chmod +x /usr/local/bin/cosign

# 2. Schlüsselpaar generieren (1× initial)
cd /opt/arasul-build
cosign generate-key-pair
# Erzeugt cosign.key (private — sicher aufbewahren) + cosign.pub (public)

# 3. Public Key auf Build-Server in der Repo-Doku ablegen
cp cosign.pub config/cosign-public-key.pem
git add config/cosign-public-key.pem && git commit -m "Phase 2.6: cosign public key"

# 4. Build + Sign in einem Schritt
docker build -t registry.arasul.io/dashboard-backend:v1.2.3 .
docker push registry.arasul.io/dashboard-backend:v1.2.3

cosign sign --key cosign.key registry.arasul.io/dashboard-backend:v1.2.3
# Bestätigt mit "tlog entry created with index ..."
```

---

## Box-seitige Verifikation (vor jedem `docker compose pull`)

Wrapper-Skript, das `docker compose pull` ersetzt:

`scripts/deploy/safe-pull.sh`:

```bash
#!/bin/bash
set -e

PUBLIC_KEY="${COSIGN_PUBLIC_KEY:-/opt/arasul/config/cosign-public-key.pem}"

# Liste aller Images aus docker-compose extrahieren
IMAGES=$(docker compose config --images | sort -u)

for img in $IMAGES; do
    # Skip externe Images (die werden NICHT signiert)
    case "$img" in
        registry.arasul.io/*) ;;
        *)
            echo "[SKIP] $img (extern, nicht signiert)"
            continue
            ;;
    esac

    echo "[VERIFY] $img"
    if ! cosign verify --key "$PUBLIC_KEY" "$img" >/dev/null 2>&1; then
        echo "[FAIL] $img Signatur ungültig — Pull abgebrochen"
        exit 1
    fi
done

echo "[OK] Alle Images verifiziert. Pull starten..."
docker compose pull
```

Dieses Skript ersetzt `docker compose pull` im Update-Workflow.

---

## Rollback-Skript

`scripts/deploy/rollback.sh`:

```bash
#!/bin/bash
# Rollback zur letzten erfolgreichen Container-Konfiguration.
# State-Snapshot liegt in /var/backups/arasul/last-good/.
set -e

BACKUP_DIR=/var/backups/arasul/last-good
if [ ! -d "$BACKUP_DIR" ]; then
    echo "Kein Last-Good-Snapshot gefunden — Rollback nicht möglich"
    exit 1
fi

echo "Rollback zu Snapshot vom $(stat -c %y "$BACKUP_DIR")..."
sudo cp "$BACKUP_DIR/.env" /opt/arasul/.env
sudo cp -r "$BACKUP_DIR/compose/" /opt/arasul/compose/
sudo docker compose -f /opt/arasul/docker-compose.yml down
sudo docker compose -f /opt/arasul/docker-compose.yml up -d

# Health-Check
sleep 30
HEALTHY=$(docker ps --filter "label=com.arasul.service" --format "{{.Status}}" | grep -c "healthy")
TOTAL=$(docker ps --filter "label=com.arasul.service" -q | wc -l)
echo "Rollback fertig: $HEALTHY/$TOTAL Container healthy"
```

Aufruf:

```bash
sudo /opt/arasul/scripts/deploy/rollback.sh
```

---

## Update-Pipeline mit Auto-Rollback

`scripts/deploy/safe-update.sh`:

```bash
#!/bin/bash
set -e

BACKUP_DIR=/var/backups/arasul/last-good
NOW=$(date +%Y%m%d_%H%M%S)

# 1. Snapshot aktueller Konfiguration
sudo mkdir -p "$BACKUP_DIR"
sudo cp /opt/arasul/.env "$BACKUP_DIR/.env"
sudo cp -r /opt/arasul/compose/ "$BACKUP_DIR/compose/"
echo "$NOW" | sudo tee "$BACKUP_DIR/timestamp" >/dev/null

# 2. Cosign-verifizierter Pull
/opt/arasul/scripts/deploy/safe-pull.sh

# 3. Apply
sudo docker compose -f /opt/arasul/docker-compose.yml up -d

# 4. Health-Check (5 Min Frist)
TIMEOUT=300
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    sleep 15
    ELAPSED=$((ELAPSED+15))
    HEALTHY=$(docker ps --filter "label=com.arasul.service" --format "{{.Status}}" | grep -c "healthy")
    TOTAL=$(docker ps --filter "label=com.arasul.service" -q | wc -l)
    if [ "$HEALTHY" -eq "$TOTAL" ] && [ "$TOTAL" -gt 0 ]; then
        echo "Update erfolgreich: $HEALTHY/$TOTAL healthy"
        exit 0
    fi
done

# 5. Auto-Rollback wenn nicht alle healthy
echo "Update fehlgeschlagen ($HEALTHY/$TOTAL healthy nach 5min) — Rollback..."
/opt/arasul/scripts/deploy/rollback.sh
exit 1
```

---

## CI-Integration (GitHub Actions Beispiel)

`.github/workflows/build-and-sign.yml`:

```yaml
name: Build, Sign, Push

on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      id-token: write # für keyless signing via OIDC
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push
        uses: docker/build-push-action@v6
        with:
          context: ./apps/dashboard-backend
          push: true
          tags: ghcr.io/arasul/dashboard-backend:${{ github.ref_name }}

      - uses: sigstore/cosign-installer@v3

      - name: Cosign sign keyless
        run: |
          cosign sign --yes ghcr.io/arasul/dashboard-backend:${{ github.ref_name }}
```

Keyless-Signing braucht keinen private key auf der CI — die Signatur wird
via OIDC + Sigstore-Transparency-Log etabliert.

---

## Bekannte Einschränkungen (MVP-Stand)

- Eigene Registry (`registry.arasul.io`) ist noch nicht aufgesetzt.
  Bisher Build-from-source pro Box → keine Pulls von extern.
- Cosign-Verifikation ist noch nicht in `arasul update`-Skript integriert.
- Rollback funktioniert nur via Compose-Config-Snapshot, nicht via
  Volume-Snapshot. Bei DB-Schema-Änderungen ohne Migration-Reverse muss
  manuell gefixt werden.

## Risk if skipped

Supply-Chain-Angriff: Manipuliertes Image im nächsten Update → Box
übernommen, Mandanten-/Patientendaten verloren. Ohne Auto-Rollback bricht
ein einzelnes fehlerhaftes Update alle Boxen gleichzeitig.
