# KI-Einstellungen und Selbstheilung deutsch (J35, 26.09.2026)

Drei Bilder bei 1440 px, aufgenommen **vor** dem Merge am lokalen Vite-Bau
dieses Stands; die Antworten der API sind in Playwright gestellt (Werte wie am
Orin: `llm_num_predict_default` 2048, Keep-Alive 3600, Kontextfenster leer).

| Bild                                | Was es zeigt                                                                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `ki-sprachmodell-1440.png`          | Einstellungen → KI: die Standardwerte aus `GET /api/settings/sprachmodell`, ohne das gefallene Firmenprofil |
| `selbstheilung-1440.png`            | Einstellungen → System → Selbstheilung: Meldung und Maßnahme in den Sätzen, die der Agent jetzt schreibt    |
| `selbstheilung-alte-zeile-1440.png` | Eine Zeile von vor J35: vorn das deutsche Wort, der englische Wortlaut nur unter „Technische Angaben"       |

Die Sätze in den gestellten neuen Zeilen sind wörtlich die aus
`services/self-healing-agent/category_handlers.py` und `healing_engine.py`;
die alte Zeile ist wörtlich die, die am 25.09.2026 am Orin stand.

Gefragt hat die Oberfläche dabei `/settings/sprachmodell` und keinen der drei
Wege, die am Gerät 404 gaben (`/memory/profile`, `/settings/company-context`,
`/rag/settings`).
