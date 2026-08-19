#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Erzeugt rundgang.html — die Kommentarseite zum Feature-Audit 023.

Aufruf:  python3 docs/plans/active/023-feature-audit/build.py
Ausgabe: docs/plans/active/023-feature-audit/rundgang.html

Die Seite wird nie von Hand geändert. Inhalte stehen hier im Skript,
Screenshots liegen in screens/. Wer etwas ändern will, ändert dieses Skript.
"""
import html
import os
import re
import pathlib

HIER = pathlib.Path(__file__).parent
STAND = "19.08.2026"

# ---------------------------------------------------------------- Befunde ---
# (id, titel, beleg, schwere, gate, status)
# schwere: groß | mittel | klein
# status:  neu | offen-vorlauf | behoben | code
BEFUNDE = [
    ("F-28", "37 Sekunden Denkzeit vor dem ersten Wort der Chat-Antwort",
     "Chat, Frage „Nenne mir in drei Stichpunkten, was Arasul kann.“ Anzeige „Nachgedacht · 37s“, "
     "Gesamtdauer bis zur fertigen Antwort rund 90 Sekunden. Der Prüflauf vom 18.08. mass 2,0 s bis zum ersten Zeichen. "
     "**Behoben am 19.08.2026, PR #395.** Ursache: `chatAgentRunner.js` fragte die Einstufung aus "
     "`queryComplexityAnalyzer.js` nie ab, die war nur in `llmJobProcessor.js:150` verdrahtet. Nachher live gemessen: "
     "Geräteprotokoll meldet `Denken aus: simple (direct_command)`, 0 Denk-Zeichen, Gesamtdauer 33 statt 90 Sekunden.",
     "groß", "G2", "behoben"),
    ("F-29", "8,9 Token pro Sekunde statt 28,5",
     "Anzeige unter der Antwort: „8.9 tok/s“. Der Prüflauf vom 18.08. mass 28,5 bis 29. "
     "Ursache: das Modell wechselte ohne Zutun von Qwen 3 Coder 30B auf das Reasoning-Modell Qwen3.8 27B.",
     "groß", "G1", "neu"),
    ("F-31", "Die KI beantwortet eine Produktfrage mit erfundenen Firmenaussagen",
     "Antwort auf „was Arasul kann“: „Arasul berät Unternehmen bei der Auswahl und Umsetzung passender KI-Lösungen“, "
     "„Arasul bietet laufende Betreuung und technischen Support“. Beides steht so nirgends und beschreibt die Firma, nicht das Produkt. "
     "Vermutliche Ursache: das Firmenprofil aus Einstellungen → KI wird als Kontext mitgegeben.",
     "groß", "G1", "neu"),
    ("F-14", "Das eingebettete n8n ist englisch und hell, mitten in der deutschen schwarzen Oberfläche",
     "Automationen-Tab: „Overview“, „All the workflows, credentials and data tables you have access to“, "
     "„Create workflow“, „Failure rate“, „Time saved“, „Sort by last updated“, „50/page“. Dazu n8ns eigenes Orange.",
     "groß", "G3", "neu"),
    ("F-21", "Es gibt keine Benutzerverwaltung, die Website verspricht sie",
     "Einstellungen → Sicherheit kann nur Passwörter für Dashboard und MinIO ändern. Kein Anlegeweg, keine Rollenwahl. "
     "Backend: `routes/auth.js` hat keine Nutzer-Route, `setupService.js:39` legt nur den ersten Admin an. "
     "Website `/eigener-ki-server`: „legst Nutzer an“, „KI-Chat für dein Team“, „3 bis 10 gleichzeitig aktive Nutzer“.",
     "groß", "G4", "neu"),
    ("F-42", "Dokumente werden nicht nach Besitzer gefiltert, jeder Zugang sieht alles",
     "`routes/documents.js:171-174` und `:236` bauen die Abfrage ohne `owner_id` und ohne `req.user`. "
     "Chats sind gefiltert (`routes/chats.js:49`), Projekte nicht (`projectService.js:56`), und das aktive Projekt "
     "ist geräteweit **eine** Zeile (`projectService.js:35`) — wechselt einer das Projekt, wechselt es für alle.",
     "groß", "G4", "code"),
    ("F-43", "Die AVV-Vorlage sagt eine Isolation zu, die es nicht gibt",
     "`docs/legal/AVV_TEMPLATE.md:175` sagt dem Auftraggeber „Trennungskontrolle (Multi-User-Isolation, RBAC)“ nach Art. 28 DSGVO zu. "
     "Siehe F-21 und F-42. Das ist kein Verkaufsproblem mehr, sondern ein Haftungsproblem.",
     "groß", "G5", "code"),
    ("F-44", "„Deploy kundenportal, läuft auf deinem Server“ existiert nicht",
     "`routes/workspaceApps.js` hat zwei Routen, beide setzen nur ein Sichtbarkeits-Flag. Der Katalog `APP_MANIFEST` hat "
     "**einen** Eintrag: n8n. `116_extensions.sql` kennt keine Spalte für URL, Port oder Route. "
     "`grep -n deploy ./arasul` → 0 Treffer, `grep -rin kundenportal` über das ganze Repo → 0 Treffer.",
     "groß", "G1", "code"),
    ("F-45", "Transkription wird auf drei Branchenseiten versprochen und existiert nicht",
     "`grep -rniE \"whisper|vosk|transcri|speech.to.text\"` → 4 Treffer, alle in `033_telegram_voice_support.sql`, "
     "und die beschreibt einen **OpenAI-Cloud-Key**. Auf dem Gerät: 0 passende Container, 0 passende Ollama-Modelle von 11.",
     "groß", "G1", "code"),
    ("F-46", "Sechs gerätefremde Container laufen im Produktnetz, einer heißt litellm und hält Cloud-Keys",
     "`docker inspect` → `jarvis-bot`, `jarvis-workbench`, `jarvis-executor`, `jarvis-searxng`, `jarvis-postgres` und "
     "`litellm` gehören zum Compose-Projekt `jarvis` (`/home/arasul/jarvis/compose.yaml`), `avatar-ffmpeg` zu `avatar-pipeline`. "
     "Zusammen 1,64 GB RAM. Seit 07.07.2026 als P3-1 offen. Die Website verspricht „läuft vollständig lokal“.",
     "groß", "G5", "neu"),
    ("F-36", "Es gibt keinen Werksreset in der Oberfläche",
     "`grep -rni \"werksreset|factory.reset|factory_reset\" src` → keine Treffer. Für ein Gerät, das ausgeliefert "
     "und zurückgenommen wird, fehlt der Weg, es sauber zu übergeben.",
     "groß", "G1", "code"),
    ("F-47", "Die ausgelieferte Schnittstellendoku deckt 7 von 361 Endpunkten ab",
     "`openapi.yaml` dokumentiert 7 Pfade, im Backend sind 361 Route-Handler registriert. `/v1/external/*` und "
     "`/v1/chat/completions` fehlen — genau die, für die ein Kunde einen Schlüssel erzeugt. "
     "`docs/api/API_REFERENCE.md` liegt nur im Repo, nicht beim Kunden.",
     "mittel", "G1", "code"),
    ("F-48", "„Bei Bedarf schaltest du ein externes Cloud-Modell dazu“ hat keinen Schalter",
     "0 Treffer für `litellm`, `OPENAI_API_KEY`, `OPENAI_BASE_URL` in Frontend und Backend. Der Pfad existierte "
     "(`110_flow_agents.sql:129`) und wurde am 21.07.2026 ersatzlos entfernt (`111_drop_flow_agents.sql:39`).",
     "mittel", "G1", "code"),
    ("F-49", "Indexierung: 1 Minute 53 Sekunden für eine 739-Byte-Datei",
     "Upload 09:28:53, „indexiert“ 09:30:46. Der Indexer fährt drei nacheinander geschaltete KI-Analysen "
     "(Zusammenfassung 34 s, Kategorisierung 20 s, Themen 20 s) und findet die Datei erst im nächsten 30-Sekunden-Scan.",
     "mittel", "G1", "neu"),
    ("F-50", "Vektorsuche ist aus, RAG läuft auf der Textebene",
     "Indexer-Protokoll: „Textlayer-only indexed 2 chunks … (Embedding aus — kein Qdrant)“. Folge von Plan 021 S8. "
     "Die Antwort war trotzdem korrekt, aber das Verhalten bei großen Beständen ist damit unbelegt.",
     "mittel", "G1", "neu"),
    ("F-03", "Der Tab heißt „Extensions“, egal ob Modelle oder Erweiterungen darin stehen",
     "Klick auf „Modelle“ oder „Erweiterungen“ öffnet denselben Tab mit demselben englischen Titel.",
     "mittel", "G3", "neu"),
    ("F-04", "Rechenfehler in der RAM-Zeile des Modellbereichs",
     "„0.0 / 32.0 GB belegt · frei 30.0 GB“. 32,0 minus 0,0 ist nicht 30,0.",
     "mittel", "G2", "neu"),
    ("F-24", "Zwei verschiedene RAM-Gesamtwerte auf zwei Bildschirmen",
     "System-Status: „25.5 / 61 GB“. Modelle und Statusleiste: „15.5 / 32.0 GB“. Ohne Erklärung, welcher Wert was ist.",
     "mittel", "G2", "neu"),
    ("F-06", "Zustandswiderspruch zwischen Modellbereich und Statusleiste",
     "Kopfbereich: „Im RAM: kein Modell geladen“. Statusleiste gleichzeitig: „Qwen 3 Coder 30B · bereit“. "
     "Bereits im Prüflauf vom 18.08. als Befund 12 notiert.",
     "mittel", "G2", "offen-vorlauf"),
    ("F-13", "Das Modell wechselt ohne Nutzeraktion und ohne Hinweis",
     "Statusleiste sprang während des Rundgangs von „Qwen 3 Coder 30B · bereit“ auf „Qwen3.8 27B · bereit“.",
     "mittel", "G2", "neu"),
    ("F-20", "Siezen und Duzen stehen nebeneinander, teils im selben Bereich",
     "Siezen: „Wählen Sie zwischen schwarzem, dunklem und hellem Design“, „Ändern Sie die Passwörter“, "
     "„Beschreibung Ihres Unternehmens“. Duzen: „Frag dein Unternehmenswissen“, „Greife sicher von überall auf dein Gerät zu“, "
     "„Öffne n8n“. Der Sicherheitsbereich hat beides auf einem Bildschirm.",
     "mittel", "G3", "neu"),
    ("F-23", "Englische Beschriftungen im deutschen Systembereich",
     "„RAM USAGE“, „SWAP“, „STORAGE“, „NORMAL“, „Performance“, „Self-Healing“, „Services“, „Updates“.",
     "mittel", "G3", "neu"),
    ("F-30", "Der Denkprozess wird auf Englisch angezeigt",
     "„Denkt nach · This is a simple question about the …“ bei deutscher Frage und deutscher Oberfläche.",
     "mittel", "G3", "neu"),
    ("F-09", "Drei von vier Erweiterungen im Auslieferungszustand heißen „Beispiel-…“",
     "„Beispiel-Tool“, „Beispiel-Flow“, „Beispiel-App“ neben n8n. Der Kunde sieht einen Katalog, der zu drei Vierteln Platzhalter ist.",
     "mittel", "G1", "neu"),
    ("F-12", "Ein Testartefakt steht im Flow-Katalog des Kunden",
     "„/qa-zusammenfassung — QA-Test: fasst eine Datei zusammen“.",
     "mittel", "G1", "neu"),
    ("F-16", "Zwei fremde Workflows stehen im Auslieferungszustand von n8n",
     "„Angebotskalkulation automatisch“ und „My workflow“, beide vom Juli.",
     "mittel", "G1", "neu"),
    ("F-15", "CSP-Verstoß beim n8n-Einbetten, live in der Browserkonsole",
     "`Loading the script 'data:text/javascript,…' violates … script-src 'self' 'unsafe-inline'` auf `/n8n/:241`. "
     "Roadmap-Thema T16, weiter offen.",
     "mittel", "G1", "offen-vorlauf"),
    ("F-07", "Der Dateibaum bricht ab, ohne Weg zum vollständigen Baum",
     "„Liste gekürzt — nicht alle Einträge werden angezeigt“. Prüflauf 18.08., Befund 11, weiter offen.",
     "mittel", "G1", "offen-vorlauf"),
    ("F-27", "„Konto endgültig löschen“ ohne erkennbaren Schutz des letzten Zugangs",
     "Einstellungen → Datenschutz. Der Dialog verlangt laut Code die Eingabe `LOESCHEN-BESTAETIGT`, "
     "aber ob das Backend das Löschen des **letzten** Administrators verhindert, ist ungeprüft. "
     "Nicht ausgelöst, weil zerstörend.",
     "mittel", "G1", "code"),
    ("F-37", "Zwei zerstörende Aktionen ohne Rückfrage",
     "„Trennen“ im Fernzugriff (`RemoteAccessSettings.tsx:270`) kappt sofort die Verbindung, über die der Nutzer "
     "gerade angemeldet ist. Der An/Aus-Schalter einer Erweiterung wirkt sofort und schließt offene Tabs.",
     "mittel", "G2", "code"),
    ("F-38", "Eine zweite, ungepflegte Oberfläche für dieselben Inhalte",
     "`/settings`, `/store`, `/terminal` und jede Tippfehler-URL landen in der Legacy-Shell mit genau einem Menüeintrag. "
     "Dort fehlt die Navigation zu fünf der sechs Einstellungsbereiche. Prüflauf 18.08., Befund 14.",
     "mittel", "G3", "offen-vorlauf"),
    ("F-01", "Die Anmeldeseite nennt den Standard-Benutzernamen im Klartext",
     "„Standard-Benutzername: **admin**“. Bei einem Produkt, dessen Verkaufsargument Datensicherheit ist, "
     "verschenkt das die Hälfte jedes Zugangs an jeden, der die Seite sieht.",
     "mittel", "G5", "neu"),
    ("F-19", "„Platform Version 1.0.0“ bei 0 von 7 geschlossenen Gates",
     "Einstellungen → Allgemein. Prüflauf 18.08., Befund 4, weiter offen. Entscheidung, keine Arbeit.",
     "mittel", "G1", "offen-vorlauf"),
    ("F-51", "Das Terminal bricht im Standardlayout Pfade mitten im Wort um",
     "Der Prompt erscheint als „sandbox@sandbox-projekte-development:/wo“ / „rkspace/projekt$“. "
     "Das rechte Panel ist im Standardlayout rund 40 Spalten breit. Der Knopf „KI-Zugang“ ist am rechten Rand abgeschnitten.",
     "mittel", "G3", "neu"),
    ("F-05", "Widerspruch auf einer Modellkachel: 261 MB in der Zeile, ~274 MB im Text",
     "„Nomic Embed Text“. Einheitenfehler MiB gegen MB. Prüflauf 18.08., Befund 7.",
     "klein", "G3", "offen-vorlauf"),
    ("F-10", "Das Suchfeld der Erweiterungen schneidet seinen eigenen Platzhalter ab",
     "„Erweiterungen durchsuch“.",
     "klein", "G3", "neu"),
    ("F-11", "Uneinheitliche Schalterbeschriftung im Erweiterungsraster",
     "n8n: „Im Workspace sichtbar“. Die anderen drei: „Selbst gebaut“ — eine Eigenschaft, keine Schalterbeschriftung.",
     "klein", "G2", "neu"),
    ("F-17", "n8n bringt eine Akzentfarbe mit, die im übrigen Produkt nicht vorkommt",
     "Orange. Ebenso im System-Status-Diagramm Orange und Violett, während das Produkt sonst Blau verwendet.",
     "klein", "G3", "neu"),
    ("F-22", "Die Oberfläche verweist den Kunden auf einen Repo-Pfad, den er nicht hat",
     "„Der Operator kann es per CLI zurücksetzen: scripts/security/reset-password.sh“.",
     "klein", "G3", "neu"),
    ("F-26", "Der Fernzugriff-Assistent zeigt Schritt 5 als offen, obwohl alles verbunden ist",
     "Vier Haken, „Fertig“ als Nummer 5 ungefüllt, während die Verbindung nachweislich steht.",
     "klein", "G2", "neu"),
    ("F-33", "Der Chat-Titel bleibt während der Antwort auf „Arasul denkt nach …“",
     "Ein Zwischenzustand als Titel, erst nach der Antwort durch die Frage ersetzt.",
     "klein", "G2", "neu"),
    ("F-02", "401 auf `/api/auth/me` vor dem Login schreibt einen Fehler in die Browserkonsole",
     "Kein Nutzerschaden, aber die Konsole ist bei jeder Vorführung nicht sauber.",
     "klein", "G3", "neu"),
    ("F-34", "Toter Code: `ProjektAnschlussSelect.tsx` wird von nichts gerendert",
     "`grep -rn \"ProjektAnschlussSelect\" src` findet nur die Definition.",
     "klein", "G1", "code"),
    ("F-35", "Der Facettenfilter der Erweiterungen ist gebaut, aber nicht angeschlossen",
     "`deriveExtensionFacets` (`storeExtensionFilters.ts:122`) hat außer Tests keinen Aufrufer, "
     "`applyExtensionFilters` (`StoreExtensionsGrid.tsx:189`) ist wirkungslos. Der Kommentar verspricht Filter „Bereich · Status“.",
     "klein", "G1", "code"),
    ("F-39", "Sidebar-Ansicht `'search'` existiert als Wert, hat aber keinen Knopf",
     "`workspaceStore.ts:225` kennt sie, `ActivityBar.tsx` bietet sie nicht an.",
     "klein", "G1", "code"),
    ("F-40", "Zwei Auto-Einklapp-Mechanismen laufen gegen leere Mengen",
     "`APP_TAB_TYPES` (`SidebarHost.tsx:33`) und `APP_CHILD_TAB_TYPES` (`useWorkspaceApps.ts:35`) sind leer.",
     "klein", "G1", "code"),
    ("F-41", "„Ungespeicherte Änderungen“ wird nur von einem Bereich gemeldet",
     "Nur `KISettings` speist die Anzeige. `PasswordManagement` hält Formularinhalt und meldet ihn nicht.",
     "klein", "G2", "code"),
    ("F-56", "Der automatische Deploy setzt den Build-Hash auf `dev-build` zurück",
     "Am 19.08.2026 nach dem Deploy von PR #395 live gesehen: Einstellungen → Allgemein zeigt wieder "
     "`Build: dev-build`, obwohl PR #394 dort `94a7ecbe` gesetzt hatte. Ursache: `.env` auf dem Gerät "
     "enthält wörtlich `BUILD_HASH=dev-build` (Zeile 7), `compose/compose.app.yaml:72` liest sie von dort. "
     "Der Fix aus #394 hielt nur, weil beim Handbau die Variable überschrieben wurde. **F-18 fällt damit bei "
     "jedem automatischen Deploy zurück.**",
     "mittel", "G1", "neu"),
    ("F-18", "Behoben und live bestätigt: Gerätename, JetPack-Version, Build-Hash",
     "Einstellungen → Allgemein zeigt Hostname `arasul` und JetPack `L4T 36.4.7`, beides stabil. "
     "Prüflauf 18.08., Befunde 1 bis 3. PR #394. **Der Build-Hash hält nicht**, siehe F-56.",
     "klein", "G1", "behoben"),
    ("F-52", "Behoben und live bestätigt: `/dashboard` und Deep-Links in die Einstellungen",
     "`/dashboard` liefert jetzt die gestaltete Oberfläche statt eines rohen 404. "
     "`/settings?tab=remote-access` öffnet den Fernzugriff. Prüflauf 18.08., Befunde 9 und 15.",
     "klein", "G1", "behoben"),
    ("F-53", "Eingelöst und live bestätigt: RAG mit Quellenangabe",
     "Testdokument mit erfundener Kennnummer hochgeladen, danach gefragt. Antwort: „Kennnummer: WV-2026-4471“, "
     "„Jährlicher Wartungsbetrag: 7.312,50 Euro netto“, „Quelle: AUDIT-023-Testdokument.md (Abschnitt „Wartungsvertrag Muster GmbH“)“. "
     "Alles korrekt. Das ist Website-Versprechen 1 bis 3.",
     "klein", "G1", "behoben"),
    ("F-54", "Eingelöst und live bestätigt: Claude Code und Codex sind im Terminal installiert",
     "`which claude codex node python3` → `/usr/local/bin/claude`, `/usr/local/bin/codex`, `/usr/local/bin/node`, `/usr/bin/python3`.",
     "klein", "G1", "behoben"),
    ("F-55", "Eingelöst und live bestätigt: n8n läuft ab Werk ohne fremde Anmeldewand",
     "Zwei Schichten, `config/traefik/dynamic/routes.yml:162`. `curl` ohne Sitzung → 401. "
     "Auto-Login über `routes/automations.js:27`. Roadmap-Thema T15 stimmt heute.",
     "klein", "G1", "behoben"),
]

# ---------------------------------------------------------- Bildschirme -----
# (id, titel, weg, bilder[], text, befunde[], komponenten[(name, datei, was)])
SCREENS = [
    ("B01", "Anmeldung", "jede URL ohne gültige Sitzung",
     ["B01-login.png"],
     "Der erste Bildschirm, den ein Partner sieht. Maskottchen, zwei Felder, ein Knopf. Anmeldung in 770 ms gemessen. "
     "Darunter steht der Standard-Benutzername im Klartext.",
     ["F-01", "F-02"],
     [("Mascot", "components/mascot/Mascot.tsx", "Maskottchen im Ruhezustand über dem Formular"),
      ("Anmeldeformular", "features/system/Login.tsx", "Benutzername und Passwort, Autofokus, Knopf gesperrt bis beide gefüllt"),
      ("Fehlerbox", "features/system/Login.tsx", "nach HTTP-Status unterschiedene Klartextmeldung, 401 403 429 5xx"),
      ("Fußzeile", "config/branding.ts", "Standard-Benutzername, Link auf arasul.de, Support-Mail")]),

    ("B02", "Erst-Start, drei Schritte", "einmalig nach der ersten Anmeldung",
     ["B02-erststart-1.png", "B02-erststart-2.png", "B02-erststart-3.png"],
     "Drei Karten, die erklären, was das Gerät ist, wie der lokale Coder startet und wie man Claude einmalig anmeldet. "
     "Sprachlich der beste Text im ganzen Produkt: kurz, deutsch, ohne Fachjargon. Genau der Einstieg, den dein Zielkunde braucht.",
     [],
     [("OnboardingWizard", "features/workspace/OnboardingWizard.tsx", "drei Schritte, Überspringen jederzeit, Merker in localStorage")]),

    ("B03", "Arbeitsbereich, Dateien", "/workspace, Standardansicht nach der Anmeldung",
     ["B03-workspace-dateien.png"],
     "Der Rahmen, in dem alles stattfindet: Menüleiste, Aktivitätsleiste links, Dateibaum, Tab-Fläche, "
     "rechtes Panel mit Chat und Terminal, Statusleiste. Der Leerzustand sagt „Kein Tab geöffnet“.",
     ["F-07"],
     [("WorkspaceMenuBar", "features/workspace/WorkspaceMenuBar.tsx", "Marke, Menü Datei, Projektwähler, zwei Layout-Schalter, Zahnrad"),
      ("ActivityBar", "features/workspace/ActivityBar.tsx", "Dateien, Modelle, Erweiterungen, Flows, Automation, unten Einstellungen"),
      ("ExplorerPanel", "features/workspace/explorer/ExplorerPanel.tsx", "Dateibaum, Suche, Anlegen, Hochladen, Herunterladen, Aktualisieren"),
      ("TabBar", "features/workspace/TabBar.tsx", "Tabs mit Punkt für Ungespeichertes, Ziehen zum Umsortieren"),
      ("RightPanel", "features/workspace/RightPanel.tsx", "Segmentkopf Chat und Terminal, beide dauerhaft geladen"),
      ("StatusBar", "features/workspace/StatusBar.tsx", "Verbindung, Version, Modell und KI-RAM, Git-Stand, aktives Projekt")]),

    ("B04", "Modelle", "Aktivitätsleiste, Modelle",
     ["B04-modelle.png"],
     "Elf installierte Modelle, 22 im Katalog, Filter nach Typ, Größe und Status. Der Kopfbereich zeigt das KI-RAM-Budget "
     "und das Standardmodell. Fachlich der dichteste Bildschirm des Produkts.",
     ["F-03", "F-04", "F-05", "F-06"],
     [("ModelsDashboard", "features/store/StoreModelsGrid.tsx", "KI-RAM-Budget, geladene Modelle, Standardmodell, In den RAM laden"),
      ("ModelCard", "features/store/StoreModelsGrid.tsx", "Karte je Modell mit Größe, Status und Laden"),
      ("DownloadProgress", "features/store/DownloadProgress.tsx", "Fortschrittsleiste ersetzt die Aktion in der Karte"),
      ("StoreModelsFilterPanel", "features/store/StoreModelsFilterPanel.tsx", "Suche und Facetten Typ, Größe, Status")]),

    ("B05", "Erweiterungen", "Aktivitätsleiste, Erweiterungen",
     ["B05-erweiterungen.png"],
     "Vier Einträge: n8n als einziger echter, dazu drei Vorlagen. Am Ende die Kachel „Eigene Erweiterung bauen“.",
     ["F-08", "F-09", "F-10", "F-11", "F-35"],
     [("ExtensionCard", "features/store/StoreExtensionsGrid.tsx", "Karte mit Schalter, wirkt sofort ohne Rückfrage"),
      ("Baukasten-Kachel", "features/store/StoreDetailPage.tsx", "Einstieg in den Erweiterungs-Baukasten"),
      ("StoreExtensionsFilterPanel", "features/store/StoreExtensionsFilterPanel.tsx", "heute nur noch Freitextsuche, siehe F-35")]),

    ("B06", "Flows", "Aktivitätsleiste, Flows",
     ["B06-flows.png"],
     "Acht mitgelieferte Flows als Schrägstrich-Befehle im Chat. Der Erklärtext trifft den Ton: "
     "„Ein Flow ist ein wiederverwendbarer Auftrag an die KI — im Chat per /name gestartet oder automatisch über n8n.“",
     ["F-12", "F-13"],
     [("FlowOverview", "features/flows/FlowOverview.tsx", "Anlegekachel und Flow-Karten, gruppiert global und je Projekt"),
      ("FlowsPanel", "features/workspace/sidebar/FlowsPanel.tsx", "Liste links mit Suche und Anlegen")]),

    ("B07", "Automationen, eingebettetes n8n", "Aktivitätsleiste, Automation",
     ["B07-automation.png"],
     "n8n läuft, ist erreichbar und meldet den Nutzer automatisch an. Das ist technisch das sauberste Stück Integration "
     "im ganzen Produkt und optisch das lauteste Problem.",
     ["F-14", "F-15", "F-16", "F-17"],
     [("AutomationenTab", "features/workspace/viewers/AutomationenTab.tsx", "Ladezustand, Fehlerzustand mit Wiederholen, iframe auf /n8n/"),
      ("Auto-Anmeldung", "routes/automations.js:27", "meldet den festen Besitzer an und reicht den n8n-Cookie durch")]),

    ("B08", "Einstellungen, Allgemein", "Zahnrad, dann Allgemein",
     ["B08-einstellungen-allgemein.png"],
     "Design, Systeminformationen, Kurzbeschreibung. Drei der vier Felder, die im Prüflauf vom 18.08. falsch waren, "
     "sind hier nachweislich behoben.",
     ["F-18", "F-19", "F-20"],
     [("GeneralSettings", "features/settings/GeneralSettings.tsx", "Design-Auswahl, Systeminformationen, Über-Text"),
      ("N8nIntegrationGuide", "features/settings/N8nIntegrationGuide.tsx", "aufklappbare Doku mit vier Reitern, rein statisch"),
      ("SettingsPanel", "features/workspace/sidebar/SettingsPanel.tsx", "die Liste der sechs Bereiche links")]),

    ("B09", "Einstellungen, KI", "Zahnrad, dann KI",
     ["B09-einstellungen-ki.png"],
     "Zwei Reiter: Firmenprofil samt Zusatzkontext, und Sprachmodell mit Kontextfenster und Basis-System-Prompt. "
     "Das Firmenprofil geht laut Beschreibung bei jedem Chat als Kontext mit — vermutlich die Ursache von F-31.",
     ["F-20", "F-31", "F-41"],
     [("AIProfileSettings", "features/settings/AIProfileSettings.tsx", "Firmenname, Branche, Produkte, Zusatzkontext, Antwortverhalten"),
      ("RagLlmSettings", "features/settings/RagLlmSettings.tsx", "Max. Tokens, Kontextfenster, Keep-Alive, Basis-System-Prompt")]),

    ("B10", "Einstellungen, Sicherheit", "Zahnrad, dann Sicherheit",
     ["B10-einstellungen-sicherheit.png"],
     "Passwort für Dashboard und MinIO, dazu Abmelden und von allen Geräten abmelden. Mehr nicht. "
     "Das ist der Bildschirm, auf dem ein Partner nach der Nutzerverwaltung suchen würde.",
     ["F-20", "F-21", "F-22", "F-41"],
     [("PasswordManagement", "features/settings/PasswordManagement.tsx", "Reiter Dashboard und MinIO, live geprüft, CLI-Hinweis"),
      ("Sitzungsblock", "features/settings/Settings.tsx", "Abmelden und von allen Geräten abmelden")]),

    ("B11", "Einstellungen, Datenschutz", "Zahnrad, dann Datenschutz",
     ["B11-einstellungen-datenschutz.png"],
     "Zwei Karten: Datenexport nach Art. 15 und Kontolöschung nach Art. 17. Kurz und klar. "
     "Ungeprüft ist, ob das Backend das Löschen des letzten Administrators verhindert.",
     ["F-27"],
     [("PrivacySettings", "features/settings/PrivacySettings.tsx", "Export als JSON-Blob, Kontolöschung mit Tippbestätigung")]),

    ("B12", "Einstellungen, System", "Zahnrad, dann System",
     ["B12-einstellungen-system.png"],
     "Vier Unterreiter: System-Status, Services, Updates, Self-Healing. Der Verlaufsgraph über 24 Stunden ist "
     "der beste Beleg für Dauerbetrieb, den das Produkt hat, und zahlt direkt auf Gate G7 ein.",
     ["F-23", "F-24", "F-25"],
     [("SystemStatus", "features/system/SystemStatus.tsx", "RAM, Swap, Speicher, Temperatur, Verlaufsgraph 1 6 12 24 Stunden"),
      ("SystemHealthWidget", "features/system/SystemHealthWidget.tsx", "Backup-Alter, Restore-Drill, Dienste, Alarme"),
      ("ServicesSettings", "features/system/ServicesSettings.tsx", "Dienstliste mit Status und Neustart, 15-Sekunden-Abfrage"),
      ("UpdatePage", "features/system/UpdatePage.tsx", "USB-Erkennung, Upload .araupdate plus Signatur, Verlauf"),
      ("SelfHealingEvents", "features/system/SelfHealingEvents.tsx", "Zähler und Ereignisliste nach Schweregrad")]),

    ("B13", "Einstellungen, Fernzugriff", "Zahnrad, dann Fernzugriff",
     ["B13-einstellungen-fernzugriff.png"],
     "Der fünfstufige Assistent aus PR #370, live im Zustand „verbunden“. Drei Adressen mit Kopierknopf, "
     "Tailscale-Daten, Geräteliste. Der technische Blocker vor Meilenstein M5 ist hier sichtbar gelöst.",
     ["F-26", "F-37"],
     [("RemoteAccessSettings", "features/settings/RemoteAccessSettings.tsx", "fünf Schritte: Installation, Verbinden, Zertifikat, Sicherer Name, Fertig"),
      ("Geräteliste", "features/settings/RemoteAccessSettings.tsx", "zeigt alle Geräte im Tailnet, in der Vorführung Koljas Privatgeräte")]),

    ("B14", "Chat, allgemeine Frage", "rechtes Panel, Reiter Chat",
     ["B14-chat-antwort.png", "B14b-chat-antwort-fertig.png", "B14c-chat-antwort-komplett.png"],
     "Frage: „Nenne mir in drei Stichpunkten, was Arasul kann. Antworte auf Deutsch.“ "
     "37 Sekunden Denken, dann drei Stichpunkte mit 8,9 Token pro Sekunde. Zwei der drei Aussagen sind erfunden. "
     "Das ist der Bildschirm, an dem ein Partnergespräch kippt.",
     ["F-28", "F-29", "F-30", "F-31", "F-32", "F-33"],
     [("AgentChatPanel", "features/workspace/llm/agentChat/AgentChatPanel.tsx", "Kopf, Leerzustand, Verlauf, Ablegefläche"),
      ("CompactMessage", "features/workspace/llm/agentChat/CompactMessage.tsx", "Nachricht mit Schritten, Quellen-Chips und Todo-Leiste"),
      ("ComposerCard", "features/workspace/llm/agentChat/ComposerCard.tsx", "Eingabefeld, Anhang, Modellwahl, Senden und Stopp"),
      ("ConversationList", "features/workspace/llm/ConversationList.tsx", "Chat-Verlauf, suchen und umbenennen")]),

    ("B15", "Terminal", "rechtes Panel, Reiter Terminal",
     ["B15-terminal.png"],
     "Sandbox-Container je Projekt, Netzmodus-Anzeige, Quick Launch, KI-Zugang. "
     "`which claude codex node python3` liefert alle vier. Das Kernversprechen von Arasul Kit ist damit belegt.",
     ["F-51", "F-54"],
     [("TerminalTabs", "features/sandbox/TerminalTabs.tsx", "Projektname, Sitzungsreiter, Anlegen und Umbenennen"),
      ("SandboxTerminal", "features/sandbox/SandboxTerminal.tsx", "Statusleiste, Netzmodus, Quick Launch, KI-Zugang, Neuverbinden"),
      ("KiZugangDialog", "features/sandbox/KiZugangDialog.tsx", "Claude-Anmeldung, Token oder API-Schlüssel")]),

    ("B16", "Dokument hochladen und indexieren", "Dateibaum, Knopf Dateien hochladen",
     ["B16-upload.png"],
     "Der Baum zeigt den Zwischenstand „· wird indexiert“ direkt am Eintrag. Gute Rückmeldung. "
     "Gemessen: 1 Minute 53 Sekunden bis „indexiert“, für eine Datei von 739 Byte.",
     ["F-49", "F-50"],
     [("Upload-Knopf", "features/workspace/explorer/ExplorerPanel.tsx", "Dateiauswahl, mehrere Dateien möglich"),
      ("Indexstatus am Baumeintrag", "features/workspace/explorer/ExplorerPanel.tsx", "zeigt wird indexiert bis der Indexer fertig ist")]),

    ("B17", "Chat mit Quellenangabe", "rechtes Panel, Chat, nach dem Upload",
     ["B17-rag-quellenfrage.png", "B17b-rag-antwort.png"],
     "Frage nach einer Kennnummer, die in keinem Modell vorkommen kann. Der Agent sagt an, was er tut "
     "(„Ich suche im Projektordner …“, „Ich lese das Trefferdokument …“), und liefert Kennnummer, Betrag "
     "und Quelle mit Abschnitt. Alles korrekt. Antwortzeit rund 70 Sekunden.",
     ["F-53", "F-29"],
     [("Schritt-Anzeige", "features/workspace/llm/agentChat/CompactMessage.tsx", "3 Schritte, aufklappbar"),
      ("Quellenangabe", "features/workspace/llm/agentChat/CompactMessage.tsx", "hier als Fließtext mit Dateiname und Abschnitt")]),

    ("B18", "Legacy-Shell", "/settings, /store, /terminal von Hand eingetippt",
     ["B18-legacy-settings.png"],
     "Dieselbe Einstellungsseite in einer völlig anderen Hülle, mit einem einzigen Menüeintrag "
     "und ohne Weg zu fünf der sechs Bereiche. Der Deep-Link auf einen Bereich funktioniert jetzt, die Navigation fehlt weiter.",
     ["F-38", "F-52"],
     [("Sidebar", "components/layout/Sidebar.tsx", "Marke, Store, unten Workspace und Einstellungen"),
      ("LegacyAppContent", "App.tsx", "die alte Hülle, erreichbar nur über getippte URLs und über 404")]),

    ("B19", "404", "unbekannte URL",
     ["B19-404.png"],
     "Gestaltet, deutsch, mit Weg zurück. Rendert allerdings in der Legacy-Shell, ein Tippfehler wirft den Nutzer "
     "also in die abgehängte zweite Oberfläche.",
     ["F-38"],
     [("404-Route", "App.tsx", "große 404, Seite nicht gefunden, Knopf Zum Workspace")]),

    ("O04", "Löschdialog für eine Datei", "Rechtsklick im Dateibaum, Löschen",
     ["O04-löschdialog.png"],
     "Kurz, klar, mit Dateinamen in Anführungszeichen. Genau so soll eine Rückfrage aussehen. "
     "Als Maßstab für die zwei zerstörenden Aktionen, die keine haben.",
     ["F-37"],
     [("ConfirmModal", "components/ui/Modal.tsx", "Titel, Frage mit Objektnamen, Abbrechen und Löschen")]),
]

# Bildschirme, die im Rundgang nicht erreichbar waren
NICHT_GESEHEN = [
    ("B-x1", "Administrator anlegen", "nur auf einem Gerät ohne Admin, nachträglich nur durch Zurücksetzen der Auth-Datenbank"),
    ("B-x2", "Ersteinrichtung, sechs Schritte", "nur solange `setupComplete` false ist. Auf diesem Gerät abgeschlossen"),
    ("B-x3", "Store, Modell-Detailseite", "Klick auf eine Modellkachel. Im Rundgang übersprungen"),
    ("B-x4", "Store, Erweiterungs-Baukasten", "Kachel „Eigene Erweiterung bauen“. Braucht eine Werkstatt-Sandbox"),
    ("B-x5", "Flow-Zentrale und Flow-Editor", "braucht einen selbst angelegten Flow"),
    ("B-x6", "Flow-Lauf-Detail", "braucht einen gestarteten Lauf"),
    ("B-x7", "Projekte-Startseite und Projekt-Übersicht", "Projektwähler, Alle Projekte"),
    ("B-x8", "Kundenübersicht", "braucht einen Ordner `Kunden/` mit Unterordnern, sonst erscheint nicht einmal der Knopf"),
    ("B-x9", "Datei-Editor, Markdown-Editor, PDF- und Bildvorschau", "braucht je eine passende Datei in der Projektablage"),
    ("B-x10", "Wissensraum-Dokument-Tab, drei Varianten", "braucht je ein indexiertes .md, .html und .py"),
    ("B-x11", "Erweiterungs-App als Tab", "braucht eine installierte und aktivierte App-Erweiterung"),
    ("B-x12", "Update-Verlauf und Self-Healing-Ereignisse", "braucht mindestens einen Update-Lauf bzw. aufgetretene Ereignisse"),
    ("B-x13", "Die übrigen 31 Overlays und Dialoge", "Schnellsuche, Kontextmenüs, Projekt anlegen und löschen, KI-Zugang, Freigabe, Toasts"),
]

# ------------------------------------------------------------ Entscheidungen -
ENTSCHEIDUNGEN = [
    ("E1", "Nutzerverwaltung: bauen oder Website und AVV ändern",
     "Es gibt keinen dritten Weg. Die Website verspricht „legst Nutzer an“, „KI-Chat für dein Team“ und "
     "„3 bis 10 gleichzeitig aktive Nutzer“, die AVV-Vorlage sagt „Multi-User-Isolation, RBAC“ nach Art. 28 DSGVO zu, "
     "und das Gerät hat einen einzigen Zugang ohne Rollen. Deine Ansage war, Rollen hinten anzustellen. "
     "Das geht — aber dann müssen Website und AVV vorher geändert werden, sonst verkaufst du eine Zusage, die du nicht halten kannst."),
    ("E2", "Vorführtempo: welches Modell steht im Auto-Modus vorne",
     "Der Wechsel auf Qwen3.8 27B hat die Vorführung von 2 Sekunden auf 37 Sekunden bis zum ersten Wort gebracht "
     "und den Durchsatz gedrittelt. Für ein Partnergespräch ist das der teuerste einzelne Befund. "
     "Entweder fällt das Reasoning-Modell aus dem Auto-Modus, oder der Denkschritt wird begrenzt."),
    ("E3", "Die sechs fremden Container",
     "`jarvis-*`, `litellm` und `avatar-ffmpeg` hängen im Produktnetz, seit dem 07.07.2026 als P3-1 offen. "
     "`litellm` hält Cloud-Schlüssel. Solange die auf dem Vorführgerät laufen, ist ein Blick ins Terminal "
     "ein Argument gegen dich."),
    ("E4", "Was mit den Plänen 020 und 021 passiert",
     "021 ist zu 81 Prozent umgesetzt (6 von 8 Schritten, PRs #346 bis #364), 020 zu rund 30 Prozent (1 von 7). "
     "Die Roadmap führt beide als `planned` ohne PR. Vorschlag: 021 auf `done` mit dokumentierter Abweichung, "
     "020 als teilgeliefert schließen, und der hardwaregebundene Rest (020 S5, S6, S7 plus 021 S7) wird ein eigenes Thema."),
    ("E5", "Gate G4 neu fassen",
     "G4 heißt heute „Mandanten-Isolation bewiesen“. Bei ein bis drei Nutzern je Gerät ist das die falsche Frage. "
     "Vorschlag aus dem Vorgespräch: G4 wird „Daten eines Geräts verlassen das Gerät nicht, und ein Gerät sieht kein anderes“. "
     "Achtung, das entbindet nicht von E1 — die Zusagen in Website und AVV bleiben davon unberührt."),
    ("E6", "Was der Auslieferungszustand enthalten darf",
     "Heute stehen darin: drei Erweiterungen namens „Beispiel-…“, ein Flow namens „/qa-zusammenfassung — QA-Test“, "
     "zwei fremde n8n-Workflows aus dem Juli. Braucht eine Entscheidung, was ab Werk drin ist und was ein Werksreset entfernt "
     "— den es noch nicht gibt."),
]


def esc(s):
    """HTML-sicher, danach `Code` und **fett** aus dem Rohtext aufloesen."""
    s = html.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", s)
    return s


def esc_attr(s):
    """Nur escapen, ohne Auszeichnung — fuer Attribute und Referenzen."""
    return html.escape(s, quote=True)


def feld(ref, label="Deine Anmerkung"):
    """Ein Kommentarfeld mit Bewertung, an data-ref gekoppelt."""
    r = esc_attr(ref)
    return f'''<div class="feld" data-ref="{r}">
  <div class="feld-kopf">
    <span class="feld-ref">{r}</span>
    <span class="wahl" role="radiogroup" aria-label="Bewertung {r}">
      <label><input type="radio" name="w-{r}" value="passt"><span>passt</span></label>
      <label><input type="radio" name="w-{r}" value="stört"><span>stört</span></label>
      <label><input type="radio" name="w-{r}" value="blockiert"><span>blockiert</span></label>
    </span>
  </div>
  <textarea rows="2" placeholder="{esc_attr(label)} — was soll anders werden?"></textarea>
</div>'''


def befund_zeile(fid):
    for f in BEFUNDE:
        if f[0] == fid:
            _id, titel, beleg, schwere, gate, status = f
            badge = {"neu": "neu", "offen-vorlauf": "seit 18.08. offen",
                     "behoben": "eingelöst", "code": "im Code belegt"}[status]
            cls = "gut" if status == "behoben" else schwere
            return (f'<li class="bf {cls}"><b>{esc(_id)}</b> <span class="pill p-{cls}">{esc(schwere if status != "behoben" else "gut")}</span>'
                    f'<span class="pill p-gate">{esc(gate)}</span><span class="pill p-st">{esc(badge)}</span><br>{esc(titel)}</li>')
    return ""


def bauen():
    teile = []
    A = teile.append

    A(f'''<!doctype html>
<!--
  Erzeugt von build.py — nicht von Hand ändern.
  Feature-Audit 023, Rundgang durch die Oberfläche. Stand {STAND}.
-->
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rundgang 023 · Arasul Jet</title>
<style>
:root {{
  --bg:#EFF3F1; --surface:#FFFFFF; --ink:#101B17; --muted:#46564F; --line:#C7D3CD;
  --accent:#0B5D4B; --accent-ink:#094A3C; --wash:#E3EDE8;
  --ok:#1F7A45; --warn:#A36B00; --bad:#B02E27; --note-bg:#FFF7E6;
  --shadow:0 1px 2px rgba(16,27,23,.06), 0 6px 20px rgba(16,27,23,.07);
}}
@media (prefers-color-scheme: dark) {{
  :root:not([data-theme="light"]) {{
    --bg:#0B100E; --surface:#17201C; --ink:#F1F6F3; --muted:#AABBB3; --line:#37453F;
    --accent:#4FD6B4; --accent-ink:#7BE3C9; --wash:#202B26;
    --ok:#62CE93; --warn:#E4B04A; --bad:#E2837B; --note-bg:#2A2317;
    --shadow:0 1px 2px rgba(0,0,0,.4), 0 8px 24px rgba(0,0,0,.3);
  }}
}}
* {{ box-sizing:border-box; }}
body {{
  margin:0; background:var(--bg); color:var(--ink);
  font:16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}}
code, .mono {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:.88em; }}
.wrap {{ max-width:1080px; margin:0 auto; padding:0 20px 140px; }}

header.top {{ padding:48px 0 24px; border-bottom:1px solid var(--line); }}
header.top h1 {{ font-size:32px; margin:0 0 6px; letter-spacing:-.02em; }}
header.top .sub {{ color:var(--muted); margin:0 0 18px; }}
.kacheln {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:18px; }}
.kachel {{ background:var(--surface); border:1px solid var(--line); border-radius:10px; padding:12px 14px; box-shadow:var(--shadow); }}
.kachel .k {{ font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); }}
.kachel .v {{ font-size:22px; font-weight:600; margin-top:2px; }}

.anleitung {{ background:var(--note-bg); border:1px solid var(--line); border-radius:10px; padding:16px 18px; margin:24px 0; }}
.anleitung h2 {{ margin:0 0 8px; font-size:17px; }}
.anleitung ol {{ margin:0; padding-left:20px; }}

h2.sec {{ font-size:22px; margin:48px 0 4px; letter-spacing:-.01em; }}
h2.sec + p.lead {{ color:var(--muted); margin:0 0 18px; }}

.karte {{ background:var(--surface); border:1px solid var(--line); border-radius:12px;
  padding:20px 22px; margin:16px 0; box-shadow:var(--shadow); }}
.karte h3 {{ margin:0 0 4px; font-size:19px; }}
.karte .weg {{ color:var(--muted); font-size:14px; margin:0 0 12px; }}
.karte .weg code {{ background:var(--wash); padding:1px 5px; border-radius:4px; }}

figure {{ margin:14px 0; }}
figure img {{ width:100%; height:auto; display:block; border:1px solid var(--line); border-radius:8px; background:#000; }}
figcaption {{ color:var(--muted); font-size:13px; margin-top:6px; }}
.bilder {{ display:grid; gap:12px; }}
.bilder.zwei {{ grid-template-columns:1fr 1fr; }}
.bilder.drei {{ grid-template-columns:1fr 1fr 1fr; }}
@media (max-width:820px) {{ .bilder.zwei, .bilder.drei {{ grid-template-columns:1fr; }} }}

ul.bfl {{ list-style:none; padding:0; margin:14px 0 0; display:grid; gap:6px; }}
li.bf {{ border-left:3px solid var(--line); padding:6px 0 6px 12px; font-size:14.5px; }}
li.bf.groß {{ border-left-color:var(--bad); }}
li.bf.mittel {{ border-left-color:var(--warn); }}
li.bf.klein {{ border-left-color:var(--line); }}
li.bf.gut {{ border-left-color:var(--ok); }}
.pill {{ display:inline-block; font-size:11px; padding:1px 7px; border-radius:99px; margin-left:5px;
  border:1px solid var(--line); color:var(--muted); vertical-align:1px; }}
.p-groß {{ background:var(--bad); color:#fff; border-color:transparent; }}
.p-mittel {{ background:var(--warn); color:#fff; border-color:transparent; }}
.p-gut {{ background:var(--ok); color:#fff; border-color:transparent; }}

details.komp {{ margin-top:14px; border-top:1px solid var(--line); padding-top:12px; }}
details.komp summary {{ cursor:pointer; font-size:14px; color:var(--accent-ink); font-weight:600; }}
details.komp[open] summary {{ margin-bottom:10px; }}
.kompliste {{ display:grid; gap:14px; margin-top:8px; }}
.komp1 .kn {{ font-weight:600; font-size:15px; }}
.komp1 .kd {{ color:var(--muted); font-size:13px; }}
.komp1 .kw {{ font-size:14px; margin:2px 0 6px; }}

.feld {{ margin-top:10px; }}
.feld-kopf {{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px; }}
.feld-ref {{ font-size:11.5px; letter-spacing:.05em; text-transform:uppercase; color:var(--muted);
  font-family:ui-monospace,Menlo,monospace; }}
.wahl {{ display:inline-flex; gap:2px; }}
.wahl label {{ position:relative; }}
.wahl input {{ position:absolute; opacity:0; width:0; height:0; }}
.wahl span {{ display:inline-block; font-size:12px; padding:2px 9px; border:1px solid var(--line);
  border-radius:99px; cursor:pointer; color:var(--muted); background:var(--surface); }}
.wahl label:nth-child(1) input:checked + span {{ background:var(--ok); color:#fff; border-color:transparent; }}
.wahl input:checked + span {{ background:var(--warn); color:#fff; border-color:transparent; }}
.wahl label:last-child input:checked + span {{ background:var(--bad); color:#fff; border-color:transparent; }}
textarea {{ width:100%; border:1px solid var(--line); border-radius:8px; padding:9px 11px;
  font:inherit; font-size:14.5px; background:var(--bg); color:var(--ink); resize:vertical; }}
textarea:focus {{ outline:2px solid var(--accent); outline-offset:-1px; }}

table.bf {{ width:100%; border-collapse:collapse; font-size:14.5px; }}
table.bf th, table.bf td {{ text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
table.bf th {{ font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }}
table.bf td.id {{ font-family:ui-monospace,Menlo,monospace; white-space:nowrap; }}
table.bf tr.groß td.id {{ color:var(--bad); font-weight:700; }}
table.bf tr.behoben td.id {{ color:var(--ok); font-weight:700; }}
.beleg {{ color:var(--muted); font-size:13px; margin-top:3px; }}

.leiste {{ position:fixed; left:0; right:0; bottom:0; background:var(--surface);
  border-top:1px solid var(--line); padding:12px 20px; display:flex; gap:12px; align-items:center;
  justify-content:center; box-shadow:0 -4px 20px rgba(0,0,0,.08); z-index:50; }}
.leiste button {{ font:inherit; font-size:15px; padding:9px 18px; border-radius:8px;
  border:1px solid var(--line); background:var(--surface); color:var(--ink); cursor:pointer; }}
.leiste button.haupt {{ background:var(--accent); color:#fff; border-color:transparent; font-weight:600; }}
.leiste #zaehler {{ color:var(--muted); font-size:14px; }}
.hinweis {{ color:var(--muted); font-size:13px; }}
footer {{ margin-top:56px; padding-top:20px; border-top:1px solid var(--line); color:var(--muted); font-size:14px; }}
</style>
</head>
<body>
<div class="wrap">

<header class="top">
  <h1>Rundgang durch Arasul Jet</h1>
  <p class="sub">Feature-Audit 023 · alle Werte live gemessen am {STAND} gegen
    <code>https://arasul.tail746d9b.ts.net</code>, Benutzer <code>pruefer</code>, 1440 Pixel breit, Standarddesign <code>black</code>.</p>
  <div class="kacheln">
    <div class="kachel"><div class="k">Bildschirme fotografiert</div><div class="v">{len(SCREENS)}</div></div>
    <div class="kachel"><div class="k">Befunde</div><div class="v">{len([b for b in BEFUNDE if b[5] != "behoben"])}</div></div>
    <div class="kachel"><div class="k">davon groß</div><div class="v">{len([b for b in BEFUNDE if b[3] == "groß" and b[5] != "behoben"])}</div></div>
    <div class="kachel"><div class="k">eingelöst bestätigt</div><div class="v">{len([b for b in BEFUNDE if b[5] == "behoben"])}</div></div>
  </div>
</header>

<div class="anleitung">
  <h2>So benutzt du diese Seite</h2>
  <ol>
    <li>Von oben nach unten durchgehen. Jeder Bildschirm hat ein Bild, einen kurzen Text, seine Befunde und ein Eingabefeld.</li>
    <li>Bei jedem Feld erst <b>passt</b>, <b>stört</b> oder <b>blockiert</b> wählen, dann schreiben, was anders werden soll.
      Die Bewertung allein reicht schon, Text ist optional.</li>
    <li>Wenn dich eine einzelne Komponente stört, den Abschnitt <b>Komponenten</b> aufklappen und dort kommentieren.</li>
    <li>Unten auf <b>Alles kopieren</b> und den Text in den Claude-Chat einfügen. Was dort ankommt, ist verbindliche Eingabe.</li>
  </ol>
  <p class="hinweis" style="margin:10px 0 0">Deine Eingaben bleiben im Browser gespeichert, du kannst zwischendurch schließen.</p>
</div>
''')

    # ---- Lagebild
    A('''<h2 class="sec">Das Lagebild in drei Sätzen</h2>
<p class="lead">Bevor es um einzelne Knöpfe geht: drei Dinge, die größer sind als jeder UI-Fehler.</p>

<div class="karte">
  <h3>1. Die Roadmap stimmt nicht mit dem Code überein</h3>
  <p>Plan 021 (Engine-Vereinheitlichung, agentic RAG) ist zu <b>81 Prozent umgesetzt</b> — 6 von 8 Schritten,
  belegt durch die PRs #346 bis #364. Plan 020 (Multi-Plattform) zu rund <b>30 Prozent</b>, 1 von 7 Schritten voll.
  Die Roadmap führt beide als <code>planned</code> ohne PR. Auch T25 steht auf <code>planned</code>, obwohl die Planseite
  <code>status: done</code> und <code>verified_on_device: true</code> trägt.</p>
  <p>Das heißt: Der Satz „744 Commits und 0 von 7 Gates“ misst nicht, was gebaut wurde, sondern was nachgetragen wurde.
  Wenn die Roadmap die Quelle für Priorisierung ist, priorisierst du gerade auf falschen Zahlen.</p>
  ''' + feld("Lagebild 1 · Roadmap gegen Code") + '''
</div>

<div class="karte">
  <h3>2. Die Website verspricht fünf Dinge, die das Gerät nicht hat</h3>
  <p>Aus 40 prüfbaren Zusagen auf arasul.de sind fünf im Code nachweislich nicht vorhanden:
  <b>Nutzer anlegen</b>, <b>eigene Anwendungen hosten</b> („Deploy kundenportal“), <b>Transkription</b>,
  <b>Cloud-Modell dazuschalten</b>, <b>Rechnungen aus dem Postfach nach Lexware oder DATEV</b>.
  Bei jedem einzelnen ist die Trefferzahl im Repo null.</p>
  <p>Verschärfend: <code>docs/legal/AVV_TEMPLATE.md:175</code> sagt dem Auftraggeber „Trennungskontrolle
  (Multi-User-Isolation, RBAC)“ nach Art. 28 DSGVO zu. Das ist eine vertragliche Zusage, kein Marketingtext.</p>
  ''' + feld("Lagebild 2 · Versprechen ohne Gegenstück") + '''
</div>

<div class="karte">
  <h3>3. Die Vorführung ist seit gestern um Faktor 18 langsamer geworden</h3>
  <p>Am 18.08. gemessen: 2,0 Sekunden bis zum ersten Zeichen, 28,5 Token pro Sekunde.
  Heute: <b>37 Sekunden Denkzeit</b> vor dem ersten Wort, <b>8,9 Token pro Sekunde</b>.
  Ursache ist ein Modellwechsel im Auto-Modus auf ein Reasoning-Modell, den niemand ausgelöst hat.</p>
  <p>Das ist der teuerste einzelne Befund dieses Laufs, weil er genau den Moment trifft,
  in dem ein Partner zum ersten Mal etwas eintippt.</p>
  ''' + feld("Lagebild 3 · Vorführtempo") + '''
</div>
''')

    # ---- Befundtabelle
    A('<h2 class="sec">Alle Befunde auf einen Blick</h2>')
    A('<p class="lead">Sortiert nach Schwere, nicht nach Bildschirm. Die letzten Zeilen sind gute Nachrichten: '
      'live geprüfte Dinge, die funktionieren.</p>')
    A('<div class="karte"><table class="bf"><thead><tr><th>Nr</th><th>Befund</th><th>Schwere</th><th>Gate</th><th>Stand</th></tr></thead><tbody>')
    ordnung = {"groß": 0, "mittel": 1, "klein": 2}
    for f in sorted(BEFUNDE, key=lambda x: (x[5] == "behoben", ordnung[x[3]], x[0])):
        _id, titel, beleg, schwere, gate, status = f
        badge = {"neu": "neu", "offen-vorlauf": "seit 18.08. offen",
                 "behoben": "eingelöst", "code": "im Code belegt"}[status]
        cls = "behoben" if status == "behoben" else schwere
        sch = "gut" if status == "behoben" else schwere
        A(f'<tr class="{cls}"><td class="id">{esc(_id)}</td>'
          f'<td><b>{esc(titel)}</b><div class="beleg">{esc(beleg)}</div></td>'
          f'<td>{esc(sch)}</td><td>{esc(gate)}</td><td>{esc(badge)}</td></tr>')
    A('</tbody></table>')
    A(feld("Befundliste gesamt", "Fehlt ein Befund, ist einer falsch bewertet, oder gehört einer weg"))
    A('</div>')

    # ---- Rundgang
    A('<h2 class="sec">Der Rundgang</h2>')
    A('<p class="lead">In der Reihenfolge, in der ein Partner die Oberfläche sehen würde.</p>')

    for sid, titel, weg, bilder, text, bfs, komps in SCREENS:
        A(f'<div class="karte" id="{esc_attr(sid)}">')
        A(f'<h3>{esc(sid)} · {esc(titel)}</h3>')
        A(f'<p class="weg">Weg dorthin: {esc(weg)}</p>')
        klasse = "bilder" + (" drei" if len(bilder) == 3 else " zwei" if len(bilder) == 2 else "")
        A(f'<div class="{klasse}">')
        for b in bilder:
            A(f'<figure><img src="screens/{esc_attr(b)}" alt="{esc_attr(titel)}" loading="lazy">'
              f'<figcaption>{esc_attr(b)}</figcaption></figure>')
        A('</div>')
        A(f'<p>{esc(text)}</p>')
        if bfs:
            A('<ul class="bfl">')
            for fid in bfs:
                A(befund_zeile(fid))
            A('</ul>')
        A(feld(f"{sid} {titel}"))
        if komps:
            A(f'<details class="komp"><summary>Komponenten dieses Bildschirms ({len(komps)}) — je ein eigenes Feld</summary>')
            A('<div class="kompliste">')
            for kn, kd, kw in komps:
                A(f'<div class="komp1"><div class="kn">{esc(kn)}</div>'
                  f'<div class="kd mono">{esc(kd)}</div>'
                  f'<div class="kw">{esc(kw)}</div>'
                  + feld(f"{sid} · {kn}") + '</div>')
            A('</div></details>')
        A('</div>')

    # ---- Nicht gesehen
    A('<h2 class="sec">Was dieser Rundgang nicht gesehen hat</h2>')
    A('<p class="lead">Ehrlichkeitshalber. Diese Bildschirme existieren, waren aber ohne weitere Vorbedingungen '
      'nicht erreichbar. Wenn dir einer davon wichtig ist, sag es — dann ist er im nächsten Lauf dabei.</p>')
    A('<div class="karte">')
    for xid, xt, xw in NICHT_GESEHEN:
        A(f'<div class="komp1" style="margin-bottom:14px"><div class="kn">{esc(xt)}</div>'
          f'<div class="kw">{esc(xw)}</div>' + feld(f"Nicht gesehen · {xt}", "Wichtig für dich?") + '</div>')
    A('</div>')

    # ---- Entscheidungen
    A('<h2 class="sec">Sechs Entscheidungen, die anstehen</h2>')
    A('<p class="lead">Diese kann ich nicht für dich treffen. Antworte hier oder im Chat.</p>')
    for eid, et, etext in ENTSCHEIDUNGEN:
        A(f'<div class="karte"><h3>{esc(eid)} · {esc(et)}</h3><p>{esc(etext)}</p>'
          + feld(f"Entscheidung {eid}", "Deine Entscheidung") + '</div>')

    # ---- Freitext
    A('<h2 class="sec">Alles Übrige</h2>')
    A('<div class="karte"><p>Was hier nicht vorkommt, aber gesagt werden muss.</p>'
      + feld("Freitext", "Alles, was oben keinen Platz hatte") + '</div>')

    A(f'''
<footer>
  Erzeugt von <code>build.py</code> am {STAND}. Diese Seite wird nie von Hand geändert.
  Screenshots in <code>screens/</code>. Rohbefunde in <code>befunde-roh.md</code>.
</footer>

</div>

<div class="leiste">
  <span id="zaehler">0 Anmerkungen</span>
  <button class="haupt" id="kopieren">Alles kopieren</button>
  <button id="leeren">Leeren</button>
</div>

<script>
(function () {{
  "use strict";
  var KEY = "arasul-rundgang-023";

  function felder() {{ return Array.prototype.slice.call(document.querySelectorAll(".feld")); }}

  function sammeln() {{
    return felder().map(function (f) {{
      var ref = f.dataset.ref;
      var ta = f.querySelector("textarea");
      var w = f.querySelector('input[type=radio]:checked');
      return {{ ref: ref, text: (ta.value || "").trim(), wahl: w ? w.value : "" }};
    }}).filter(function (e) {{ return e.text || e.wahl; }});
  }}

  function speichern() {{
    var liste = sammeln();
    try {{ localStorage.setItem(KEY, JSON.stringify(liste)); }} catch (e) {{}}
    var n = liste.length;
    document.getElementById("zaehler").textContent =
      n + (n === 1 ? " Anmerkung" : " Anmerkungen");
  }}

  function laden() {{
    var liste = [];
    try {{ liste = JSON.parse(localStorage.getItem(KEY) || "[]"); }} catch (e) {{ return; }}
    var karte = {{}};
    liste.forEach(function (e) {{ karte[e.ref] = e; }});
    felder().forEach(function (f) {{
      var e = karte[f.dataset.ref];
      if (!e) return;
      if (e.text) f.querySelector("textarea").value = e.text;
      if (e.wahl) {{
        var r = f.querySelector('input[value="' + e.wahl + '"]');
        if (r) r.checked = true;
      }}
    }});
    speichern();
  }}

  document.addEventListener("input", function (ev) {{
    if (ev.target.closest(".feld")) speichern();
  }});
  document.addEventListener("change", function (ev) {{
    if (ev.target.closest(".feld")) speichern();
  }});

  document.getElementById("kopieren").addEventListener("click", function () {{
    var liste = sammeln();
    if (!liste.length) {{ blinken("Nichts eingetragen"); return; }}
    var zeilen = liste.map(function (e) {{
      var kopf = "· " + e.ref + (e.wahl ? "  [" + e.wahl + "]" : "");
      return e.text ? kopf + "\\n  -> " + e.text.replace(/\\n/g, "\\n     ") : kopf;
    }});
    var txt =
      "Rückmeldung zum Rundgang 023 (Feature-Audit Arasul Jet), " + liste.length + " Anmerkungen:\\n\\n" +
      zeilen.join("\\n") +
      "\\n\\nBitte verbindlich berücksichtigen: Plan 023 daraus schreiben, " +
      "die als blockiert markierten Punkte zuerst, danach stört, passt nur wenn Text dabeisteht.";
    kopieren(txt);
  }});

  document.getElementById("leeren").addEventListener("click", function () {{
    if (!confirm("Alle Anmerkungen löschen?")) return;
    felder().forEach(function (f) {{
      f.querySelector("textarea").value = "";
      var r = f.querySelector('input[type=radio]:checked');
      if (r) r.checked = false;
    }});
    speichern();
  }});

  function kopieren(txt) {{
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      navigator.clipboard.writeText(txt).then(
        function () {{ blinken("Kopiert — jetzt in den Chat einfügen"); }},
        function () {{ ersatz(txt); }});
    }} else {{ ersatz(txt); }}
  }}

  function ersatz(txt) {{
    var ta = document.createElement("textarea");
    ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try {{ document.execCommand("copy"); blinken("Kopiert — jetzt in den Chat einfügen"); }}
    catch (e) {{ blinken("Kopieren fehlgeschlagen"); }}
    document.body.removeChild(ta);
  }}

  function blinken(text) {{
    var b = document.getElementById("kopieren");
    var alt = b.textContent;
    b.textContent = text;
    setTimeout(function () {{ b.textContent = alt; }}, 2200);
  }}

  laden();
}})();
</script>
</body>
</html>
''')
    return "".join(teile)


if __name__ == "__main__":
    ziel = HIER / "rundgang.html"
    ziel.write_text(bauen(), encoding="utf-8")
    n_felder = ziel.read_text(encoding="utf-8").count('class="feld"')
    print(f"geschrieben: {ziel}")
    print(f"{len(SCREENS)} Bildschirme, {len(BEFUNDE)} Befunde, {n_felder} Eingabefelder")
    print(f"{os.path.getsize(ziel)/1024:.0f} KB")
