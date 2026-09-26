# Oberfläche am Handy und in Kundensprache (J35, 26.09.2026)

Aufgenommen mit dem Bau dieses Zweigs gegen das Backend des Orin: Playwright
ersetzt die Dateien der Oberfläche durch den lokalen Bau, `/api` und `/apps`
gehen an das Gerät (gleiche Herkunft, echtes Sitzungscookie). Angemeldet mit
einem gestempelten Prüf-Administrator, der danach wieder gelöscht wurde.

Gemessen bei 390 px:

- das Menü führt alle zehn Einstellungsbereiche, **10 von 10** per Klick
  erreicht, in keinem rollt das Dokument waagerecht (Rollbreite 390);
- ein Auswahlknopf (Radio) misst 17 × 17 px, also rund und nicht verzerrt.

Die zwei Bilder `*-firmenordner-leer-schritte` zeigen einen leeren
Firmenordner: die Antwort von `GET /api/firmenordner/ordner` ist dafür im
Browser geleert, weil der Orin einen eingerichteten hat. Der Hinweis
„Noch nicht alles bei den Mitarbeitern angekommen“ darauf ist echt: der
Prüf-Administrator war im Firmenordner noch nicht gespiegelt.

Die deutschen Dienstnamen (`anzeige`) kommen vom Backend dieses Zweigs; auf
`1440-dienste.png` steht deshalb noch der Stand des Geräts vor dem Deploy.
