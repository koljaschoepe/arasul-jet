# Frontend Store/Marketplace — Findings

## UNCOMMITTED-CHANGE-REVIEW (WICHTIG!)

Alle 5 modifizierten Files zeigen einen Refactor, der **funktionale Rückschritte** enthält:

- `ActivationButton.tsx`: Icon Play→Zap, variant="secondary" entfernt
- `StoreApps.tsx`: OctagonX→Square, ConfirmIconButton entfernt, Tags zugefügt
- `StoreDetailModal.tsx`: OctagonX→Square, ConfirmIconButton entfernt (509-530)
- `StoreHome.tsx`: Dynamische CSS-Klassen für Status entfernt
- `StoreModels.tsx`: Dynamische CSS-Klassen entfernt

Trend: Simplifizierung → **Stop-Bestätigung entfernt, Status-Visual gelöscht**. User-Input nötig.

## MAJORS

### FE-ST-01: Stop-Aktion ohne Confirm-Dialog

- `StoreApps.tsx:548-559` — direkter handleAction('stop') ohne Dialog
- `StoreDetailModal.tsx:509-530` — gleich
- Uninstall hat Dialog (699-725), Stop nicht — inkonsistent
- Fix: Uninstall-Pattern übernehmen

### FE-ST-02: Status-CSS-Klassen gelöscht

- Alt: `running`→`border-l-2 border-l-primary`, `installing`→`animate-pulse border-primary/30`
- Neu: Alle Cards gleich — visueller Status geht verloren
- Fix: Dynamische Classes wiederherstellen

### FE-ST-03: Install-Error nach 5s verschwindet

- `StoreApps.tsx:244-245` — setTimeout löscht error silently
- Kein Retry-Button in Fehler-UI
- Fix: Längere Anzeige + expliziter Close- oder Retry-Button

### FE-ST-04: Download-Cancel in Card nicht nutzbar

- `StoreApps.tsx:482` — `<DownloadProgress>` ohne `onCancel` prop
- `DownloadProgress.tsx:53` hätte onCancel — wird nicht genutzt
- Fix: onCancel-Prop übergeben

### FE-ST-05: Gleichzeitige Actions visuell nicht unterscheidbar

- `actionLoading[appId]` speichert nur Aktions-Name, aber beide Buttons disabled
- User sieht nicht welche Aktion läuft

## MINORS

### FE-ST-06: Icon-Inkonsistenz Play vs. Zap

- ActivationButton nutzt Zap, andere Stellen Play

### FE-ST-07: Tailwind-Syntax-Fehler

- `DownloadProgress.tsx:127` — `bg-linear-to-r` ist KEIN Tailwind, muss `bg-gradient-to-r`

### FE-ST-08: `any` in StoreDetailModal.tsx:70-71

- Sollte `unknown` statt `any` sein

### FE-ST-09: Modal-Focus-Restore fehlt

- Nach Close kein Focus-Return zum öffnenden Button

### FE-ST-10: Offline-Handling minimal

- Keine explizite Offline-Detection, kein Offline-Toast

## OK / FUNKTIONIERT

- Backend-Endpoints vorhanden: /api/apps (list/install/start/stop/restart/uninstall), /store/search, /store/recommendations
- SSE-Streaming mit AbortController + Polling-Fallback
- Global State via DownloadContext, ActivationContext
- TypeScript fast durchgehend, nur 1 any
- useApi-Hook mit Auth, CSRF, Timeout, 401-Handling
- Dialog für Uninstall (ConfirmIconButton-Pattern)

## Priorität

1. FE-ST-01, FE-ST-02 (Stop-Dialog zurück + Modal) — vor Rollout
2. FE-ST-03 (Status-Visuals zurück) — UX
3. FE-ST-04 (Error-Anzeige) — UX
4. FE-ST-05 (Cancel-Button in Card)
5. FE-ST-07 (Tailwind-Fix) — optisch broken
