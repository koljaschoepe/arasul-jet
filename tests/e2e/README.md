# E2E Tests mit Playwright MCP

End-to-End Tests für die Arasul Platform mit Playwright MCP Integration.

## Voraussetzungen

1. **Playwright MCP Server** muss aktiv sein:
   ```bash
   claude mcp list  # Prüfen ob playwright aufgelistet ist
   ```

2. **Frontend muss laufen**:
   ```bash
   docker compose up -d dashboard-frontend
   # Oder lokal:
   cd services/dashboard-frontend && npm start
   ```

3. **Backend muss erreichbar sein**:
   ```bash
   curl http://localhost:3001/api/health
   ```

## Playwright MCP Setup

Falls noch nicht installiert:

```bash
# MCP Server hinzufügen
claude mcp add playwright -- npx @playwright/mcp@latest

# Browser-Dependencies installieren (einmalig)
npx playwright install chromium
```

## Basis-Test-Flows

### 1. Login/Logout
- Login-Seite aufrufen
- Credentials eingeben
- Dashboard erreichen
- Logout durchführen

### 2. Chat-Konversation
- Neue Konversation erstellen
- Nachricht senden
- Antwort abwarten
- RAG-Toggle testen

### 3. Dokument-Upload
- Document Manager öffnen
- Datei hochladen
- Status prüfen (Pending → Indexed)
- Dokument löschen

### 4. Settings
- Settings-Seite öffnen
- Tabs wechseln
- Passwort ändern (optional)

## Test-Ausführung mit Claude

In einer Claude-Session:

```
Führe E2E-Tests für den Login-Flow durch:
1. Navigiere zu http://localhost:3000/login
2. Fülle das Passwort-Feld aus
3. Klicke auf Login
4. Verifiziere dass das Dashboard erscheint
```

Claude nutzt automatisch die Playwright MCP-Tools:
- `browser_navigate` - Seiten aufrufen
- `browser_fill` - Formulare ausfüllen
- `browser_click` - Elemente klicken
- `browser_snapshot` - Screenshots für Verifikation

## Permissions

Diese Playwright-Permissions sind in `.claude/settings.local.json` konfiguriert:

```json
"mcp__playwright:browser_navigate",
"mcp__playwright:browser_click",
"mcp__playwright:browser_fill",
"mcp__playwright:browser_snapshot",
"mcp__playwright:browser_close"
```

## Troubleshooting

### Browser startet nicht
```bash
# Dependencies prüfen
npx playwright install --with-deps chromium
```

### MCP Server nicht erreichbar
```bash
# MCP Server neustarten
claude mcp remove playwright
claude mcp add playwright -- npx @playwright/mcp@latest
```

### Timeout bei Navigation
- Frontend-Service prüfen: `docker compose ps dashboard-frontend`
- Netzwerk prüfen: `curl -v http://localhost:3000`
