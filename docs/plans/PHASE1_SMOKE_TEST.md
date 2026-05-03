# Phase 1 — Smoke-Test-Plan

> Manuelle End-to-End-Verifikation nach Container-Rebuild.
> Stand: 2026-05-03 · Branch: `feat/telegram-bot-overhaul`

## Vorbereitung

```bash
# 1. Container neu bauen (DB-Migrationen 086-089 laufen automatisch)
docker compose up -d --build dashboard-backend dashboard-frontend postgres-db

# 2. Migration-Status prüfen
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 6;"

# Erwartet: 089, 088, 087, 086 in Liste.
```

## 1. Setup-on-First-Login (Phase 1.2)

**Voraussetzung:** Frische DB ohne `admin_users`-Eintrag (nur möglich in Test-Umgebung).
Für bestehende Box: nur das `setup-status`-Endpoint testen.

```bash
# Status checken — sollte requires_initial_setup zurückgeben
curl -s http://arasul.local/api/auth/setup-status | jq .

# Erwartet: { "requires_initial_setup": false, ... } (weil schon Admin existiert)
```

**Frischer Box-Setup (Demo-Reset):**

1. `docker exec postgres-db psql -U arasul -d arasul_db -c "TRUNCATE admin_users CASCADE;"`
2. Browser → http://arasul.local
3. Erwartet: `InitialSetupWizard` zeigt sich (Login ist nicht aufrufbar)
4. Username `admin`, Email, Passwort eintragen
5. Klick "Account anlegen und einloggen"
6. Erwartet: Direkt eingeloggt, Dashboard wird gezeigt

## 2. Compliance-Settings (Phase 1.4 + 1.6)

**Telegram-Default-OFF:**

1. Browser → http://arasul.local
2. Im Store-Tab: Telegram-Bot-Card sollte **nicht sichtbar** sein
3. Direkt-Aufruf von `/telegram-bot` sollte zum Dashboard redirecten

**Telegram aktivieren (mit Disclaimer):**

1. Settings → Compliance
2. Telegram-Disclaimer-Checkbox setzen, "Telegram aktivieren" klicken
3. Erwartet: Toast "Telegram aktiviert"
4. Im Store: Telegram-Bot-Card jetzt sichtbar
5. `/telegram-bot` öffnet jetzt die Page

**KI-Transparenz-Label:**

1. Chat öffnen, beliebige Frage stellen
2. Erwartet: Unter der KI-Antwort steht "🤖 Generiert von KI — bitte Inhalt verifizieren."
3. Settings → Compliance → "Deaktivieren" beim KI-Transparenz-Label
4. Confirmation-Dialog akzeptieren
5. Neuer Chat: Footer ist verschwunden
6. `docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT action, details, timestamp FROM audit_logs WHERE action LIKE 'ai_transparency_%' ORDER BY timestamp DESC LIMIT 2;"`
7. Erwartet: 2 Einträge `ai_transparency_disabled` und (optional) `ai_transparency_enabled`

**Verify Backend-Block:**

```bash
# Telegram deaktiviert → Bot-Erstellung wird geblockt:
curl -s -X POST http://arasul.local/api/telegram-bots \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","token":"123:abc","llmProvider":"ollama","llmModel":"gemma4"}'
# Erwartet: 403 mit code TELEGRAM_DISABLED
```

## 3. n8n External-Whitelist (Phase 1.7)

**Whitelist verwalten:**

1. Settings → Compliance → Section "n8n — Externe Domain-Whitelist"
2. Eintragen: `api.telegram.org`, Beschreibung "Telegram-Bot-API"
3. "Hinzufügen" klicken → Toast erfolgreich
4. Eintrag mit `localhost.invalid` versuchen → Validation-Fehler erwartet (Format)

**Audit-Endpoint testen:**

```bash
# n8n simuliert externen Call (mit API-Key):
curl -s -X POST http://arasul.local/api/v1/external/n8n/audit-call \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target_url":"https://api.openai.com/v1/chat","method":"POST","workflow_name":"test"}'
# Erwartet: { "allowed": false, "block_reason": "Host api.openai.com nicht in n8n-Whitelist", ... }

# Im Postgres prüfen:
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT target_host, blocked, block_reason FROM n8n_external_call_log ORDER BY created_at DESC LIMIT 5;"
```

## 4. Audit-Log-Robustheit (Phase 1.5)

```bash
# Health-Endpoint:
curl -s http://arasul.local/api/audit/health -H "Authorization: Bearer $JWT" | jq .
# Erwartet: { queue_depth, queue_max: 1000, failure_count, last_success_at, ... }

# Security-Logs (letzte 100):
curl -s "http://arasul.local/api/audit/security-logs?limit=10" -H "Authorization: Bearer $JWT" | jq '.logs[].action'
# Erwartet: Mix aus login, telegram_enabled, ai_transparency_*, etc.

# 7-Jahre-Retention (defensive Funktion, NIE weniger als 7J löschen):
docker exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT cleanup_old_security_audit_logs(30);"
# Erwartet: 0 (weil interner Constraint die 30 auf 2555 hochzieht)
```

## 5. Multi-User-Isolation (Phase 1.1) — KRITISCH

**Setup zwei User:**

1. Settings → Benutzer → Mitarbeiter "alice" anlegen (Rolle: Mitarbeiter)
2. Mitarbeiter "bob" anlegen (Rolle: Mitarbeiter)

**Cross-User-Leak-Test (manuell, der wichtigste Test):**

1. Logout
2. Login als alice → Chat öffnen, Frage stellen → Chat-Verlauf sichtbar
3. Logout
4. Login als bob → `/chat` → bob sieht KEINE Chats von alice
5. bob versucht direkt `/api/chats/<alice-chat-id>` aufzurufen → 404 (NotFound)
6. bob lädt Dokument hoch → bob sieht eigenes Doc, alice's Doc nicht
7. RAG-Test: bob fragt was zu Inhalt eines alice-Dokuments → "Diese Information ist in den vorliegenden Dokumenten nicht enthalten" (oder Quellen leer)

**Knowledge-Space-ACL:**

1. Login als admin → neuen Knowledge-Space "Mandant-Müller" anlegen
2. Logout, Login als alice → `/api/spaces` ruft auf → Space NICHT in Liste (nicht-Admin sieht nur eigene)
3. Logout, Login als admin → Space-Member-Endpoint:
   ```bash
   docker exec postgres-db psql -U arasul -d arasul_db -c \
     "INSERT INTO space_members (space_id, user_id, permission) VALUES ('<space-id>', <alice-id>, 'editor');"
   ```
4. Logout, Login als alice → Space jetzt in Liste

**Admin sieht alles:**

1. Login als admin
2. Settings → Benutzer → bob's Konto deaktivieren
3. Erwartet: Toast erfolgreich, bob's Status = "Deaktiviert"
4. bob versucht sich einzuloggen → 403

## 6. Compliance-Doku (Phase 1.3)

```bash
ls /home/arasul/arasul/arasul-jet/docs/legal/
# Erwartet 9 Dateien:
#   AVV_TEMPLATE.md
#   TOMs.md
#   DSFA_VORLAGE.md
#   AI_ACT_SELF_DECLARATION.md
#   AGB_TEMPLATE.md
#   WARTUNGSVERTRAG.md
#   SLA_STANDARD.md
#   DATENSCHUTZERKLAERUNG.md
#   AI_LITERACY_MODUL.md
```

## Akzeptanz

Phase 1 ist abgeschlossen, wenn:

- [x] Migrationen 086, 087, 088, 089 laufen ohne Fehler
- [x] Setup-on-First-Login funktioniert auf frischer Box
- [x] Telegram-Tab versteckt + Disclaimer-Modal vor Bot-Erstellung
- [x] KI-Transparenz-Label sichtbar + per Admin-Toggle abschaltbar (im Audit-Log)
- [x] n8n-Whitelist im UI verwaltbar + Audit-Endpoint blockt unbekannte Hosts
- [x] Audit-Log mit 7-Jahre-Retention + Health-Endpoint zeigt Queue-Status
- [x] User A sieht KEINE Chats/Documents/Spaces von User B
- [x] RAG respektiert Space-ACL (Cross-User-Leak verhindert)
- [x] Admin kann via Settings → Benutzer Mitarbeiter anlegen, Rollen ändern, deaktivieren
- [x] 9 Compliance-Doku-Vorlagen in `docs/legal/` vorhanden (Anwalts-Review steht aus)

## Bekannte Einschränkungen

- **Compliance-Dokumente sind DRAFTs**, brauchen anwaltliche Prüfung vor Verkauf (siehe Banner in jeder Datei).
- **n8n-Whitelist-Enforcement** ist bisher nur im `audit-call`-Endpoint umgesetzt — Workflows müssen explizit über diesen Endpoint loggen. Native n8n-Custom-Node oder Egress-Firewall folgt in einer Folge-Iteration.
- **`requireOwnership` ist auf Hot-Routes beschränkt** (projects, documents, spaces, rag, chats). Restliche Routes bekommen den Audit in Phase 1 Follow-up. Schon abgesicherte Routes: alle 4 Kern-Resourcen plus chat (war bereits user-scoped).
- **Bestehende Telegram-Bots laufen weiter**, auch wenn Telegram global deaktiviert wird — nur die Bot-Erstellung wird geblockt. Im Sale-Pitch klar kommunizieren.
- **Multi-User-Iso ist MVP**, kein vollständiges Multi-Tenancy. Mandanten-Isolation läuft auf einer Box; getrennte Boxes pro Mandant ist die nächst-höhere Eskalationsstufe.
