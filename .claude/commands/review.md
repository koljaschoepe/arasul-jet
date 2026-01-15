# Code-Review Workflow

Für: $ARGUMENTS

## Review-Checkliste

### 1. Änderungen analysieren
```bash
git diff                    # Unstaged changes
git diff --cached          # Staged changes
git log -3 --oneline       # Recent commits
```

### 2. Code-Standards prüfen

**Allgemein:**
- [ ] Keine hartcodierten Credentials
- [ ] Keine console.log/print im Production-Code
- [ ] Keine auskommentierten Code-Blöcke
- [ ] Sinnvolle Variablen-/Funktionsnamen

**JavaScript/Node.js:**
- [ ] async/await statt raw Promises
- [ ] Error-Handling vorhanden
- [ ] Keine unsicheren eval() oder innerHTML

**Python:**
- [ ] Type Hints wo sinnvoll
- [ ] Docstrings für öffentliche Funktionen
- [ ] Keine bare except-Klauseln

**React/Frontend:**
- [ ] Design-System Farben (nur #45ADFF als Akzent)
- [ ] Responsive Design beachtet
- [ ] Accessibility (alt-Tags, aria-labels)

### 3. Sicherheit (OWASP Top 10)
- [ ] Keine SQL-Injection-Möglichkeiten
- [ ] Keine XSS-Schwachstellen
- [ ] Input-Validierung vorhanden
- [ ] Authentifizierung/Autorisierung korrekt

### 4. Test-Coverage
- [ ] Neue Funktionen haben Tests
- [ ] Edge Cases abgedeckt
- [ ] Tests sind aussagekräftig benannt

### 5. Dokumentation
- [ ] API-Änderungen in docs/API_REFERENCE.md
- [ ] Schema-Änderungen in docs/DATABASE_SCHEMA.md
- [ ] Env-Variablen in docs/ENVIRONMENT_VARIABLES.md

## Review-Ergebnis

**Bewertung:** APPROVE | REQUEST_CHANGES | COMMENT

**Kommentare:**
```
Datei:Zeile - Problem - Vorschlag
```

**Zusammenfassung:**
_Gesamteindruck und Empfehlung_
