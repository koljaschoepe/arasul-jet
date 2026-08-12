# KI-Brücke — auf die lokale Basis zugreifen

Eine live geschaltete App läuft in einem abgeriegelten iframe. Über die
**KI-Brücke** kann sie kontrolliert die lokale Basis des NVIDIA-Geräts (bzw.
Servers) nutzen: das lokale Sprachmodell, die Wissensbasis, einen eigenen
Datentopf und Automatisierungen.

## 1. Fähigkeiten deklarieren

Im `manifest.json`:

```json
"faehigkeiten": ["llm", "rag", "dateien", "flows"]
```

| Fähigkeit | Was die App darf                                                 |
| --------- | ---------------------------------------------------------------- |
| `llm`     | das lokale Modell fragen (gestreamte Antwort)                    |
| `rag`     | die Wissensbasis durchsuchen (mit Quellen)                       |
| `dateien` | einen **eigenen** Datentopf lesen/schreiben (nicht Kundendaten!) |
| `flows`   | Arasul-Flows auflisten, starten, Ergebnis abholen                |

Deklariere nur, was du wirklich brauchst. Der Admin bestätigt die Liste einmal
beim Live-Schalten; ein Update mit neuen Fähigkeiten braucht eine neue Freigabe.

## 2. SDK einbinden

`arasul-bruecke.js` liegt in der Werkstatt — leg es mit ins Paket und binde es
ein:

```html
<script src="arasul-bruecke.js"></script>
```

Danach steht `window.ArasulBruecke` bereit:

```js
await ArasulBruecke.bereit();
const info = await ArasulBruecke.info();               // { id, name, faehigkeiten }
await ArasulBruecke.llm('Frag mich was', { onChunk: (d, gesamt) => … });
const treffer = await ArasulBruecke.rag('Suchbegriff');
await ArasulBruecke.dateien.schreiben('notiz.txt', 'Inhalt');
const flows = await ArasulBruecke.flows.liste();
const { runId } = await ArasulBruecke.flows.starten('mein-flow', { arg: 1 });
```

Der kurzlebige Zugriffs-Token kommt automatisch vom Dashboard (postMessage) —
die App muss sich nicht anmelden. Nicht freigegebene Fähigkeiten beantwortet das
Backend mit `403`.

Die vollständige API steht im Kopf von `arasul-bruecke.js`.
