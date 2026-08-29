/**
 * Die Fassung der Bibliothek.
 *
 * Sie steht in einer eigenen Datei, weil zwei Dinge sie lesen: das Buendel
 * unter `browser/` traegt sie (dort ist sie der einzige Beleg dafuer, aus
 * welchem Stand der Quelle es gebaut wurde), und `scripts/test/marken.py`
 * vergleicht beide. Wer einen der sechs Bausteine aendert, hebt sie und baut
 * neu -- sonst faellt der Waechter.
 *
 * 2.0.0 (Phase H3): die Bibliothek hat einen zweiten Satz bekommen -- die
 * fuenfundzwanzig Primitive -- und mit `theme.css` die Tokens, die bis dahin
 * der Shell gehoerten. Der Sprung auf eine neue Hauptzahl steht fuer den
 * Spiegel des Ara-Kits: eine Vorlage, die auf 1.x gebaut ist, kennt
 * `theme.css` nicht.
 */
export const FASSUNG = '2.0.0';
