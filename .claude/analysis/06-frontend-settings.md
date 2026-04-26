# Frontend Settings — Inventar & Findings

## INVENTAR — alle Settings-Tabs

| Reiter       | File                                              | Endpoints                                                             | Status               |
| ------------ | ------------------------------------------------- | --------------------------------------------------------------------- | -------------------- |
| Allgemein    | `GeneralSettings.tsx`                             | GET /system/info                                                      | Info-only, kein Save |
| KI-Profil    | `AIProfileSettings.tsx`                           | GET/POST /memory/profile, GET/PUT /settings/company-context           | Fragmentiert (2 EP)  |
| Sicherheit   | `SecuritySettings.tsx` → `PasswordManagement.tsx` | /settings/password-requirements, /settings/password/{dashboard,minio} | OK                   |
| Services     | `ServicesSettings.tsx`                            | GET /services/all, POST /services/restart/:name                       | OK, 15s auto-refresh |
| Fernzugriff  | `RemoteAccessSettings.tsx`                        | /tailscale/{status,install,connect,disconnect}                        | OK, 30s refresh      |
| Updates      | `UpdatePage.tsx`                                  | /update/{history,upload,apply,usb-devices,install-from-usb}           | OK, USB-Update       |
| Self-Healing | `SelfHealingEvents.tsx`                           | GET /self-healing/events                                              | OK, 15s refresh      |

## FEHLENDE SEITEN (kritisch für autonomous appliance)

- **LLM-Konfiguration-Tab** — Model-Auswahl, Default setzen (Gemma 4), Download-Status. Backend hat /services/llm/models, aber kein UI
- **User-Management-Tab** — Admin-CRUD für Benutzer. Backend vorhanden, keine UI
- **Backup-Settings-Tab** — Schedule, Retention, Restore, Integrity-Check. Backend hat /backup/history, keine UI
- **RAG-Settings-Tab** — Chunk-Size, Top-K, Thresholds, Collection — nicht exponiert

## MAJORS

### S-01: AIProfileSettings benutzt zwei Endpoints nicht-transaktional

- `AIProfileSettings.tsx:115-163` lädt via Promise.all, speichert als 2 separate Calls
- Teilerfolg möglich → inkonsistent
- Fix: Backend-Endpoint `/settings/ai-profile` mergen ODER Frontend-Rollback

### S-02: Frontend-Validierung (Zod) fehlt bei meisten Settings

- PasswordManagement nutzt Regex, aber nur Teile
- AIProfileSettings: keine
- Tailscale-Authkey: keine Regex-Prüfung (`tskey-*`)
- Update-Datei: nur Extension `.araupdate`, keine Größenvalidierung (Backend akzeptiert 2GB)
- Fix: Zod-Schemas aus shared-schemas nutzen (FE-20-Pattern)

### S-03: AIProfileSettings — optimistic save ohne Server-Echo

- `AIProfileSettings.tsx:238-244` — kopiert lokalen State
- Backend normalisiert ggf. (Trim) → UI out-of-sync
- Fix: Server-Response nutzen

### S-04: Services-Endpoint-Verwirrung (/services vs /services/all)

- Backend hat beide: `/services/` (Summary) und `/services/all` (Array)
- Frontend nutzt nur `/all`
- Fix: Backend konsolidieren, eines umbenennen oder löschen

## MINORS

### S-05: SelfHealingEvents Auto-Refresh ohne Error-Count

- Bei dauerhaftem API-Fehler: silent failures, User merkt nichts
- Fix: Nach 3 Errors → autoRefresh=false + Toast

### S-06: Update-Upload keine Client-Size-Check

- UpdatePage.tsx:158-169, nur Extension-Check
- Fix: `MAX_UPDATE_SIZE = 500MB` im Frontend

### S-07: Theme-Persistenz nicht sichtbar

- GeneralSettings.tsx:93-98 delegiert an Parent — wo wird gespeichert?
- Dokumentation fehlt

## OK

- Tab-Navigation mit ErrorBoundary
- Alle implementierten Endpoints funktionieren
- CSRF, Auth, Rate-Limits
- Toast-Feedback
- Password-Change-Dialog mit Confirm bei Tab-Wechsel
