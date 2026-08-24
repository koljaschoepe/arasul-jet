# Suche in Dokumenten

**Es gibt kein Vektor-RAG mehr.** Plan 021 Schritt 8 hatte es durch agentisches
ersetzt; am 24.08.2026 ist Qdrant samt Code ausgebaut worden, weil drei
Features still durchfielen, statt ihren Ausfall zu melden. Wer in diesem Ordner
eine Beschreibung von `ragCore`, `hybridSearch` oder Qdrant-Fehlercodes sucht:
die Datei stand voll davon und ist deshalb neu geschrieben.

## Wie heute gesucht wird

```
Frage
  ↓ der Agent waehlt ein Werkzeug
  ├─ dateien_suchen   → Glob ueber Namen, grep ueber Inhalte
  ├─ symbol_suche     → Funktionen und Klassen ueber den Symbolindex
  ├─ dateien_lesen    → eine benannte Datei, ganz
  └─ web_suche        → SearXNG, wenn es nach draussen gehen darf
  ↓
Antwort mit Fundstellen
```

Der Textlayer liegt in PostgreSQL: `document_chunks` (kleine Abschnitte fuer
die Fundstelle) und `document_parent_chunks` (grosse fuer den Zusammenhang).
Der `document-indexer` schreibt beide, aus PDF, DOCX und Bildern. Am
24.08.2026 auf dem Orin: 1217 Dokumente, 37 638 Abschnitte.

## Was der embedding-service noch tut

Er laeuft weiter und traegt kein Compose-Profil. Drei Verbraucher:

| Wer                               | Wofuer                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `routes/external/openaiCompat.js` | `/v1/embeddings`, die OpenAI-kompatible Schnittstelle                                                    |
| `routes/ai/spaces.js`             | Wissensraum-Routing: `knowledge_spaces.description_embedding`, Aehnlichkeit wird in JavaScript gerechnet |
| `routes/ai/embeddings.js`         | die eigene Route                                                                                         |

Keiner davon braucht eine Vektordatenbank.

## Die Bruecke fuer Erweiterungen

Die Faehigkeit `rag` in `brueckeService.js` verlangt jetzt `dateiname` und
liest die benannte Datei aus dem Textlayer. Ohne Dateinamen kommt ein
Eingabefehler mit dem Hinweis auf `dateien_suchen` — frueher lief der Zweig in
ein nicht erreichbares Qdrant und lieferte eine leere Liste.
