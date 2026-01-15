# Test-Workflow

Für Komponente/Feature: $ARGUMENTS

## Schritte

1. **Code-Analyse**
   - Existierenden Code der Komponente lesen
   - Abhängigkeiten identifizieren
   - Testbare Einheiten bestimmen

2. **Testfall-Identifikation**
   - **Happy Path**: Normale Nutzung
   - **Edge Cases**: Grenzwerte, leere Eingaben
   - **Error Handling**: Fehlerszenarien, ungültige Eingaben
   - **Integration**: Zusammenspiel mit anderen Komponenten

3. **Test-Implementierung**
   - Tests mit beschreibenden Namen schreiben
   - Test-Locations:
     - Backend: `services/dashboard-backend/__tests__/unit/`
     - Frontend: `services/dashboard-frontend/src/__tests__/`
     - Python: `tests/unit/`
   - Existierende Test-Patterns folgen

4. **Ausführung & Validierung**
   - Tests ausführen und Coverage prüfen
   - Backend Coverage-Threshold: 20% (lines)
   - Bei Lücken: Weitere Tests ergänzen

5. **Dokumentation**
   - Neue Test-Kategorien in README dokumentieren
   - Komplexe Test-Setups kommentieren

## Test-Commands

```bash
# Backend (Jest)
cd services/dashboard-backend
npm test                    # Alle Tests mit Coverage
npm run test:unit          # Nur Unit-Tests
npm run test:watch         # Watch-Modus

# Frontend (React Testing Library)
cd services/dashboard-frontend
CI=true npm test            # Non-interactive

# Python (pytest)
pytest tests/unit -v        # Verbose
pytest --cov=. --cov-report=html  # Mit Coverage
```
