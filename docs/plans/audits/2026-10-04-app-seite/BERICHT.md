# Abnahme: eine Seite je App in der Verwaltung (M5), 04.10.2026

Auftrag `verwaltung-app-seite`, PR #883 (Seite, Schalter „aktiv", Verbindungen
auf der App-Seite) und PR #884 (Kachel ohne leeres Feld, Fund an den Bildern
von Lauf 1). Gemessen am Orin nach den Deploys 37186676058 (Migration 200
angewendet) und 37187180172, alle Dienste gesund, mit
`scripts/test/app-seite-abnahme.sh` und `app-seite-bilder.mjs`. Probe-App
`probe-seite-1004` aus `tests/probe-stufen`, eingetragen `example.org` und
`localtest.me`. Konten: `probe-admin`, `probe-j36-a` (Testperson),
`probe-j36-b` (nur Live), keine neuen. `abschluss`, `belege` und
die Probe zu `belege` blieben unberührt.

## Ergebnis

| Lauf | Stand         | Ergebnis       |
| ---- | ------------- | -------------- |
| 1    | nach #883     | 40 von 40 grün |
| 2    | nach #883+884 | 40 von 40 grün |
| 3    | nach #883+884 | 40 von 40 grün |

Jeder Lauf mit Browser-Teil (drei Phasen, 28 Prüfungen darin). Die Bilder
stammen aus Lauf 3.

## Was gemessen wurde

- **Eine Seite je App** unter `/workspace/verwaltung/apps/probe-seite-1004`,
  die Blöcke in dieser Reihenfolge: Zustand, Fassungen, Personen,
  Freigabestufen, Flows, Verbindungen, danach Läufe, KI-Aufrufe und Protokoll
  auf „Zeigen" (`seite-ganz.png`, dunkel: `seite-dunkel.png`).
- **Liste:** ein Satz („Live 1.0.0, im Test 1.1.0") und höchstens ein Tag,
  „(Test)", keine Bibliothek (`seite-liste.png`).
- **Kein Bereich „Verbindungen" mehr** in der Leiste der Verwaltung;
  `/workspace/verwaltung/verbindungen` landet bei den Apps.
- **Zustand:** „Läuft mit Fassung 1.0.0. Im Test wartet Fassung 1.1.0.", dazu
  „3 Personen mit Zugang, davon 1 Testperson · 1 von 1 Flow aktiv". Rot ist nur
  die eine echte Störung: „Die Verbindung zu Localtest wird abgewiesen."
- **Fassungen:** Änderungstext an der Testfassung, „Live schalten (1.1.0)",
  kein „Zurück" ohne vorige Fassung; Fassungsnummern, Weg und Bibliothek nur
  unter „Technische Angaben".
- **Personen:** `probe-j36-a` ist Testperson, `probe-j36-b` hat Zugang ohne Test
  (`seite-personen.png`). `probe-j36-b` bekommt auf die Testfassung 403.
- **Testperson:** `probe-j36-a` sieht in der Aktivitätsleiste „(Test) Probe:
  Seite (1004)" neben „Probe: Seite (1004)"; ein Klick landet in
  `/apps/probe-seite-1004/test/` (`testperson-leiste.png`,
  `testperson-in-test.png`). `probe-j36-b` sieht nur die Livefassung.
- **Flows:** ein Satz „Startet von Hand in der App · 2 Schritte"; Schritte
  (pruefen, zeichnen), Freigaben (Prüfung, dann Leitung), Modell und Datei nur
  aufgeklappt (`seite-flows.png`).
- **aktiv, über die Schnittstelle:** Mitarbeiter 403, ohne Wahrheitswert 400,
  fremder Flow 404. Aus: der Start bekommt in Live und Test `409 FLOW_INAKTIV`,
  es entsteht kein Lauf (0 → 0). Wieder an: ein Lauf entsteht und hält an der
  ersten Freigabe an.
- **aktiv, im Browser:** ausgeschaltet zeigt die Zeile „aus, startet nicht"
  (`seite-flow-aus.png`), das Backend nennt den Flow aus und weist den Start mit
  409 ab; nach dem Neuladen steht er weiter auf aus; wieder eingeschaltet nennt
  ihn das Backend aktiv.
- **Verbindungen, aus dem Container der Livefassung:** `example.org` geht
  hinaus (2× genutzt), `example.com` (nicht eingetragen) wird abgewiesen und
  steht grau und zugeklappt, `localtest.me` (eingetragen, zeigt auf 127.0.0.1)
  wird abgewiesen und ist als einzige rot (`stoerung`). Lesbar benannt
  („Example", „Localtest"), Adressen aufgeklappt (`seite-verbindungen.png`).
- **Aufräumen:** Freigaben zurückgenommen, App entfernt (404), kein Ordner
  unter `/arasul/apps`, keine Zähler der App in `ausgang_zaehler`,
  Wegwerf-Schlüssel widerrufen.

## Nicht Teil dieses Auftrags

- Der Zustand nennt bei der Probe-App „die Bibliothek einer Fassung warnt": das
  Paket aus `tests/probe-stufen` nennt keine `marken`-Fassung. Richtig gemeldet,
  kein Fehler der Seite.
