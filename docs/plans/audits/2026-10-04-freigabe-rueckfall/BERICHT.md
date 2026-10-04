# Abnahme: Rückfall im Gerät, Freigaben ohne eigene Ansicht der App (M5), 04.10.2026

Auftrag `freigabe-rueckfall-im-geraet`, PR #888 (Manifestfeld `zeigt_freigaben`,
Kontrakt 12, Rückfall in „Für Sie"). Gemessen am Orin nach dem Deploy
37190401525, alle Dienste gesund, mit `scripts/test/rueckfall-abnahme.sh` und
`rueckfall-bilder.mjs`. Probe-Apps `probe-rueckfall-1004` (ohne
`zeigt_freigaben`) und `probe-tieflink-1004` (mit `zeigt_freigaben: true`) aus
`tests/probe-rueckfall`, nur das Manifest unterscheidet sie. Konten:
`probe-admin`, `probe-j36-a`, `probe-j36-b`, keine neuen.

## Ergebnis

| Lauf | Ergebnis       | Anmerkung                                                            |
| ---- | -------------- | -------------------------------------------------------------------- |
| 0    | 39 von 40 grün | Fehler im Skript: prüfte die Liste, bevor die Entscheidung durch war |
| 1    | 40 von 40 grün |                                                                      |
| 2    | 40 von 40 grün |                                                                      |
| 3    | 40 von 40 grün |                                                                      |
| 4    | 40 von 40 grün | nach Änderung des Probe-Textes, aus ihm stammen die Bilder           |

Danach: keine Probe-App am Orin (`/arasul/apps`, `docker ps`, Tabelle `apps`),
keine offene Freigabe, Wegwerf-Schlüssel widerrufen.

## Was gemessen wurde

- **Kontrakt 12:** `GET /api/v1/external/contract` nennt Fassung 12 und die Regel
  zu `zeigt_freigaben`.
- **Rückfall:** `probe-j36-b` reicht einen Beleg ein, `probe-j36-a` sieht die
  Freigabe in „Für Sie" mit `app_zeigt_freigaben=false`, Felder und Original.
  Ein Klick öffnet sie in Arasul, nicht die App (kein Rahmen, Adresse bleibt
  die Startseite): Original links und zoombar, `datum` mit „prüfen" oben und
  als Eingabefeld, `betrag` nur zum Lesen, keine Prozentzahl, darunter bei wem
  sie liegt und „Weitergeben an …" (`fuer-sie-einzeln.png`). `probe-j36-a`
  ändert `datum`, bestätigt, und es steht wieder die Liste da
  (`fuer-sie-danach-liste.png`).
- **Der Lauf geht weiter:** Stufe Leitung mit dem geänderten Wert und dem Satz
  Bisheriges (Prüfung bestätigt von `probe-j36-a`, Änderung von `datum`);
  `probe-admin` bestätigt, der Lauf endet `fertig`, sein Ergebnis trägt
  `03.10.2026`.
- **Regeln des Backends unverändert:** der Einreicher sieht nichts und bekommt
  403; liegt die Leitung bei der Standardperson `probe-admin`, bekommt
  `probe-j36-a` 409.
- **Tieflink:** bei `probe-tieflink-1004` (`app_zeigt_freigaben=true`) lädt
  derselbe Klick die App im Rahmen mit `/apps/probe-tieflink-1004/?freigabe=157`;
  nichts geht in Arasul auf (`tieflink-app.png`).
- **belege, nur lesend:** `app_staende` führt für `belege` live und
  test 0.3.0, keines der Manifeste nennt `zeigt_freigaben`. Der Rückfall greift
  also für ihre Buchungsfreigaben. Es wurde nichts entschieden oder geändert;
  `belege`, `abschluss` und die Probe zu `belege` blieben unberührt.

## Folge fürs Kit

`KIT_CONTRACT_VERSIONS` in `.ara/tools/lib/contract.mjs` auf 12 heben; eine App
mit eigener Freigabe-Ansicht trägt `zeigt_freigaben: true` ein (Abschnitt
„Tieflink in die App und Rückfall im Gerät" in `docs/features/APP-PAKET.md`).
