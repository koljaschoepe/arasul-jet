# App-Schale nach Klickentwurf 7, zweiter Anlauf (J60, M7)

Stand 27.11.2026. Gemessen am Orin (probe-admin, `https://192.168.0.197`, Stand nach Deploy um 19:04 UTC), an der ausgelieferten Demo (`https://arasul-demo.vercel.app`) und am Klickentwurf (Ansicht „App“), bei 1920x1080, 1440x900 und 390x844. Alle Bilder des Laufs liegen nicht im Repo, hier eine Auswahl unter `bilder/`.

## Gebaut

- Kontrakt 15: optionales Feld `abteilung` in `app.json` (höchstens 40 Zeichen), `GET /api/apps/meine` liefert es, der Store gruppiert danach, ohne Feld unter „Weitere“. Keine Admin-Spalte.
- Plus im Dock öffnet „Neu“: oben die drei zuletzt angelegten Apps, darunter alle weiteren; Suche und Neu zeigen das Symbol der App.
- Demo: „Demo“ im Dock (Menü), schwebendes Glas-X und Escape zur Website; Abteilungen in den Demodaten. Deutsch wie Englisch ohne Rest (`demo/abnahme.mjs`, 65 grün, 0 rot, lokal und gegen die Auslieferung).
- Demo von Hand ausgeliefert (VERCEL_TOKEN fehlt weiter), Projekt `arasul-demo`, danach Abnahme gegen die Adresse grün.
- Start und Store stehen in derselben zentrierten Spalte (70 rem), Platz unten für das Dock.

## Prüfer, Runde 1 (Subagent, nur Bilder)

- Schwer 1 und 2 (Orin dunkel: Text der Aufmerksamkeits-Karte und Such-Icon unlesbar): Artefakt meiner Aufnahme, die das Theme per Attribut erzwang. Mit dem echten Theme aus den Einstellungen (`bilder/orin-start-1440-dunkel.png`) sind beide lesbar.
- Mittel: Start bei 1920 linksbündig ohne Spalte, Dock deckt das Ende ab: behoben (zentrierte Spalte, Platz unten).
- Mittel: kein Rückmelde-Icon in der Leiste der Start- und Store-Ansicht. Das Icon gehört zur geöffneten App (Foto des Rahmens) und steht dort; offen bleibt, ob es auch auf Start stehen soll.
- Mittel: Glas-X und Dock bei 390 px eng: das X schwebt dort über dem Dock, Abstand gemessen, kein Überdecken des Docks.

## Offen

- Zweite Runde des Prüfers nach den Korrekturen nicht gefahren (Runde 1 von höchstens 3).
- Orin-Apps tragen noch keine Abteilung: das Kit schreibt sie erst, wenn die Folgekarte für ara-kit gebaut ist (Kontrakt 15 zählen, `abteilung` in app.json). Bis dahin steht dort alles unter „Weitere“.
- „Erste Schritte“ und „Zuletzt“ liegen je Browser, nicht am Gerät.
