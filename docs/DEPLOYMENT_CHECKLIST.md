# Deployment-Checkliste (Techniker)

## Setup (bei dir zu Hause)

### Vorbereitung

1. JetPack 6.2.1 flashen (NVIDIA SDK Manager)
2. SSH-Verbindung herstellen: `ssh arasul@<jetson-ip>`
3. Repository klonen:
   ```bash
   git clone git@github.com:arasul/arasul-jet.git /opt/arasul
   cd /opt/arasul
   ```

### Installation

4. Vollstaendige Provisionierung:
   ```bash
   ./scripts/setup/preconfigure.sh --full
   ```
5. **Admin-Passwort notieren!** (wird nur einmal angezeigt)

### Verifizierung

6. Services starten und testen:
   ```bash
   docker compose up -d
   ./scripts/test/smoke-test.sh
   ```
7. Pre-Shipping-Check:
   ```bash
   ./scripts/deploy/verify-deployment.sh
   ```
8. Browser-Test: `http://arasul.local` - Login mit Admin-Passwort

### Versand

9. Geraet herunterfahren: `sudo shutdown -h now`
10. Verpacken und versenden

---

## Beim Kunden

1. Ethernet anschliessen
2. Strom anschliessen (Geraet startet automatisch)
3. Browser oeffnen: `http://arasul.local` (oder IP aus Router)
4. Login mit Admin-Passwort
5. Setup-Wizard durchlaufen

---

## Geraet wiederverwenden (neuer Kunde)

```bash
./scripts/setup/factory-reset.sh
```

Loescht alle Kundendaten, behaelt KI-Modelle. Dauert ca. 5 Minuten.

---

## Fehlerbehebung

| Problem                         | Loesung                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `arasul.local` nicht erreichbar | IP direkt verwenden (aus Router-Admin), mDNS pruefen: `avahi-resolve -n arasul.local`            |
| Services starten nicht          | `docker compose logs <service>` pruefen                                                          |
| Smoke-Test schlaegt fehl        | Einzelne Services pruefen: `docker compose ps`                                                   |
| Kein GPU-Zugriff                | `nvidia-smi` pruefen, ggf. `sudo nvidia-ctk runtime configure --runtime=docker --set-as-default` |
