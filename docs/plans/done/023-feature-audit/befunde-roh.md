# Rohbefunde Feature-Audit 023, Lauf 19.08.2026

Quelle: Playwright gegen https://arasul.tail746d9b.ts.net, Benutzer `pruefer`, 1440x900, Theme `black` (Standard).

## B01 Login

- F-01 Die Loginseite nennt den Standard-Benutzernamen im Klartext: "Standard-Benutzername: **admin**". Bei einem Produkt, das Datensicherheit verkauft, verschenkt das die Haelfte jedes Zugangs an jeden, der die Seite sieht. Schwere: mittel.
- F-02 `GET /api/auth/me` liefert vor dem Login 401 und schreibt einen Fehler in die Browserkonsole. Kein Nutzerschaden, aber die Konsole ist bei jeder Vorfuehrung nicht sauber. Schwere: klein.

## B02 Erst-Start (Onboarding, 3 Schritte)

- (bisher kein Befund)

## B04 Modelle

- F-03 Der Tab, der sich beim Klick auf "Modelle" oeffnet, heisst **"Extensions"**. Falscher Name und englisch in einer sonst deutschen Oberflaeche. Schwere: mittel, faellt in jeder Vorfuehrung auf.
- F-04 Rechenfehler in der RAM-Zeile: "0.0 / 32.0 GB belegt - frei 30.0 GB". 32.0 minus 0.0 ist nicht 30.0. Entweder ist der Gesamtwert oder der Freiwert falsch. Schwere: mittel.
- F-05 Widerspruch auf einer Kachel: "Nomic Embed Text, 261 MB" in der Kopfzeile, im Beschreibungstext derselben Kachel "~274 MB". (Vorlauf Befund 7, teilweise offen: Einheitenfehler MiB/MB.) Schwere: klein.
- F-06 Zustandswiderspruch: Kopfbereich sagt "Im RAM: kein Modell geladen", Statusleiste unten sagt gleichzeitig "Qwen 3 Coder 30B - bereit". (Vorlauf Befund 12, weiter offen.) Zahlt auf Gate G2. Schwere: mittel.

## B03 Workspace Dateien

- F-07 Dateibaum endet mit "Liste gekuerzt — nicht alle Eintraege werden angezeigt", ohne Weg zum vollstaendigen Baum. (Vorlauf Befund 11, weiter offen.) Schwere: mittel.

## B05 Erweiterungen

- F-08 Der Tab heisst weiter "Extensions", obwohl jetzt Erweiterungen darin stehen. Modelle und Erweiterungen teilen sich denselben Tab mit demselben englischen Titel.
- F-09 Drei von vier Erweiterungen heissen "Beispiel-Tool", "Beispiel-Flow", "Beispiel-App". Im Auslieferungszustand sieht ein Kunde einen Katalog, der zu drei Vierteln aus Platzhaltern besteht. Schwere: mittel, Verkaufsschaden.
- F-10 Das Suchfeld schneidet seinen eigenen Platzhalter ab: "Erweiterungen durchsuch". Schwere: klein.
- F-11 Uneinheitliche Schalterbeschriftung: n8n hat "Im Workspace sichtbar", die anderen drei haben "Selbst gebaut". "Selbst gebaut" ist eine Eigenschaft, keine Schalterbeschriftung. Zahlt auf G2. Schwere: klein.

## B06 Flows

- F-12 Der Auslieferungszustand enthaelt einen Flow namens "/qa-zusammenfassung" mit der Beschreibung "QA-Test: fasst eine Datei zusammen". Ein Testartefakt im Kundenkatalog. Schwere: mittel, Verkaufsschaden.
- F-13 Das Modell in der Statusleiste wechselte ohne Nutzeraktion von "Qwen 3 Coder 30B - bereit" auf "Qwen3.8 27B - bereit". Kein Hinweis, warum. Zahlt auf G2. Schwere: mittel.

## B07 Automationen (n8n eingebettet)

- F-14 Das eingebettete n8n ist vollstaendig **englisch** und in **hellem Design**, mitten in einer deutschen, schwarzen Oberflaeche: "Overview", "All the workflows, credentials and data tables you have access to", "Create workflow", "Failure rate", "Time saved", "Sort by last updated", "50/page". Der Bruch ist der auffaelligste Bildschirm des ganzen Rundgangs. Zahlt auf G3. Schwere: **gross**.
- F-15 CSP-Verstoss beim n8n-Einbettung, live in der Konsole: `Loading the script 'data:text/javascript,...' violates ... script-src 'self' 'unsafe-inline'` auf `/n8n/:241`. (Roadmap T16, weiter offen.) Schwere: mittel.
- F-16 Im Auslieferungszustand stehen zwei fremde Workflows drin: "Angebotskalkulation automatisch" und "My workflow", beide vom Juli. "My workflow" ist ein unbenannter Rest. Schwere: mittel, Verkaufsschaden.
- F-17 n8n bringt seine eigene Akzentfarbe Orange mit, die im uebrigen Produkt nicht vorkommt. Zahlt auf G3.

## B08 bis B13 Einstellungen, sechs Bereiche

- F-18 **Behoben, bestaetigt:** Vorlauf-Befunde 1 bis 3. Hostname zeigt `arasul`, JetPack zeigt `L4T 36.4.7`, Build zeigt `94a7ecbe`. PR #394.
- F-19 **Weiter offen:** Vorlauf-Befund 4. "Platform Version 1.0.0" bei 0 von 7 geschlossenen Gates.
- F-20 Uneinheitliche Anrede in derselben Oberflaeche. Siezen: "Waehlen Sie zwischen schwarzem, dunklem und hellem Design", "Aendern Sie die Passwoerter", "Beschreibung Ihres Unternehmens", "werden Sie automatisch abgemeldet". Duzen: "Frag dein Unternehmenswissen", "Greife sicher von ueberall auf dein Geraet zu", "Oeffne n8n", "Du bekommst eine kopierbare Login-URL". Teilweise im selben Bereich. Zahlt auf G3. Schwere: mittel.
- F-21 **Es gibt keine Benutzerverwaltung.** Der Bereich "Sicherheit" kann nur Passwoerter fuer Dashboard und MinIO aendern. Die Website verspricht auf `/eigener-ki-server` "legst Nutzer an" und "KI-Chat fuer dein Team". Schwere: **gross**, unerfuelltes Versprechen.
- F-22 Die Oberflaeche verweist den Kunden auf einen Repo-Pfad, den er nicht hat: "Der Operator kann es per CLI zuruecksetzen: scripts/security/reset-password.sh". Schwere: klein.
- F-23 Englische Beschriftungen im deutschen System-Bereich: "RAM USAGE", "SWAP", "STORAGE", "NORMAL", "Performance", "Self-Healing", "Services", "Updates". Zahlt auf G3. Schwere: mittel.
- F-24 Zwei verschiedene RAM-Gesamtwerte auf zwei Bildschirmen: System-Status sagt "25.5 / 61 GB", Modelle und Statusleiste sagen "15.5 / 32.0 GB". Ohne Erklaerung, welcher Wert was ist. Schwere: mittel.
- F-25 Die Diagrammfarben im System-Status sind Orange und Violett, waehrend das ganze uebrige Produkt Blau verwendet. Zahlt auf G3. Schwere: klein.
- F-26 Der Fernzugriff-Assistent zeigt Schritt 5 "Fertig" als nicht erledigt, obwohl die vier Schritte davor erledigt sind und die Verbindung nachweislich steht. Zahlt auf G2. Schwere: klein.
- F-27 "Konto endgueltig loeschen" ist ohne erkennbare Absicherung erreichbar. Zu pruefen: verhindert das Backend das Loeschen des letzten Administrators? Sonst sperrt sich der Kunde mit zwei Klicks dauerhaft aus. **Nicht ausgeloest, weil zerstoerend.** Schwere: potenziell gross.

## B14 Chat, eine echte Frage

Frage: "Nenne mir in drei Stichpunkten, was Arasul kann. Antworte auf Deutsch." Modell laut Anzeige "Auto", tatsaechlich Qwen3.8 27B.

- F-28 **37 Sekunden Denkzeit vor dem ersten Wort der Antwort.** Angezeigt als "Nachgedacht - 37s". Gesamtdauer bis zur fertigen Antwort rund 90 Sekunden fuer drei Stichpunkte. Der Vorlauf vom 18.08. mass 2,0 s bis zum ersten Zeichen. Schwere: **gross**, direkter Vorfuehrungsschaden.
- F-29 **8,9 Token pro Sekunde.** Der Vorlauf mass 28,5 bis 29. Einbruch auf unter ein Drittel, verursacht durch den Modellwechsel auf ein Reasoning-Modell. Schwere: **gross**.
- F-30 Der Denkprozess wird dem Nutzer **auf Englisch** angezeigt: "Denkt nach - This is a simple question about the...". Deutsche Frage, deutsche Oberflaeche, englischer Denktext. Schwere: mittel, Vorfuehrungsschaden.
- F-31 Die Antwort ist inhaltlich falsch und beschreibt die Firma statt das Produkt: "Arasul beraet Unternehmen bei der Auswahl und Umsetzung passender KI-Loesungen", "Arasul bietet laufende Betreuung und technischen Support". Auf die Frage, was das Produkt kann. Ursache vermutlich das Firmenprofil aus den KI-Einstellungen als Kontext. Schwere: **gross** im Partnergespraech.
- F-32 Die Antwort nennt **keine Quelle**, obwohl der leere Chat verspricht: "Antworten kommen mit Quellen aus deinen Dokumenten." Website-Versprechen Nr. 1 und 2. Schwere: gross, zu pruefen mit einem echten Dokument.
- F-33 Der Chat-Titel lautete waehrend der Antwort "Arasul denkt nach ..." und wurde erst danach durch die Frage ersetzt. Zwischenzustand als Titel. Schwere: klein.

## Aus der Codeanalyse, noch nicht im Browser bestaetigt

- F-34 `src/features/sandbox/ProjektAnschlussSelect.tsx` wird von nichts gerendert. `grep -rn "ProjektAnschlussSelect" src` findet nur die Definition. Toter Code.
- F-35 Der Facettenfilter fuer Erweiterungen ist gebaut, aber nicht angeschlossen: `deriveExtensionFacets` (`storeExtensionFilters.ts:122`) hat ausser Tests keinen Aufrufer, `applyExtensionFilters` (`StoreExtensionsGrid.tsx:189`) ist faktisch wirkungslos. Der Sidebar-Kommentar verspricht Filter "Bereich - Status", die es nicht gibt. Erklaert F-10.
- F-36 **Es gibt keinen Werksreset in der Oberflaeche.** `grep -rni "werksreset|factory.reset|factory_reset" src` findet nichts. Fuer ein Geraet, das ausgeliefert und zurueckgenommen wird, ist das eine Luecke. Schwere: gross fuer die Auslieferung.
- F-37 Zwei zerstoerende Aktionen ohne Rueckfrage: "Trennen" im Fernzugriff (`RemoteAccessSettings.tsx:270`) kappt sofort die Verbindung, ueber die der Nutzer gerade angemeldet ist. Der An/Aus-Schalter einer Erweiterung im Store wirkt sofort und schliesst offene Tabs. Zahlt auf G2. Schwere: mittel.
- F-38 Zweite, ungepflegte Oberflaeche: die Legacy-Shell (`components/layout/Sidebar.tsx`) ist nur per getippter URL `/settings`, `/store`, `/terminal` erreichbar und hat genau einen Menueeintrag. Erklaert Vorlauf-Befund 14. Schwere: mittel.
- F-39 Sidebar-Ansicht `'search'` existiert als Wert in `workspaceStore.ts:225`, hat aber keinen Knopf in der ActivityBar. Toter Zustand.
- F-40 `APP_TAB_TYPES` (`SidebarHost.tsx:33`) und `APP_CHILD_TAB_TYPES` (`useWorkspaceApps.ts:35`) sind leere Mengen. Die daran haengende Auto-Einklapp-Logik laeuft, tut aber nichts.
- F-41 Die Anzeige "Ungespeicherte Aenderungen" im Einstellungskopf wird nur von `KISettings` gespeist. `PasswordManagement` haelt Formularinhalt, meldet ihn nicht. Zahlt auf G2.

## Nachtrag 19.08.2026, nach dem Fix von F-28

- F-28 **behoben**, PR #395. Ursache: `chatAgentRunner.js` fragte `classifyQueryComplexity` nie ab, die Bremse war nur in `llmJobProcessor.js:150` verdrahtet. Die Entscheidung liegt jetzt als `agentConfig.sollDenken()` bei `thinkingGewuenscht()` und `kannDenken()`. Live gemessen auf dem Orin: Geraeteprotokoll `Denken aus: simple (direct_command)`, `0 thinking chars`, Gesamtdauer **33 s statt 90 s**.
- F-29 **bleibt offen.** 8,9 Token pro Sekunde unveraendert. Das haengt am Modell Qwen3.8 27B, nicht am Denken.
- F-31 **bleibt offen.** Die Antwort beschreibt weiter die Firma statt das Produkt. Andere Ursache, vermutlich das Firmenprofil als Kontext.
- F-56 **neu.** Der automatische Deploy setzt `Build` auf `dev-build` zurueck. `.env` auf dem Geraet, Zeile 7: `BUILD_HASH=dev-build`, gelesen von `compose/compose.app.yaml:72`. F-18 faellt damit bei jedem Deploy zurueck.

## Nachtrag R19, 19.08.2026

Beide Fremdstacks gestoppt, Daten behalten. `docker compose down` ohne `-v` fuer `/home/arasul/jarvis/compose.yaml` und `/home/arasul/projects/avatar-pipeline/compose.yaml`.

- Vorher 22 Container, nachher **16**, alle Arasul.
- Produktnetz `arasul-platform_arasul-backend` enthaelt nur noch Arasul-Dienste.
- Alle sechs Volumes unversehrt: `avatar-whisper-models`, `jarvis_jarvis-postgres-data`, `jarvis_jarvis-reflector-data`, `jarvis_jarvis-searxng-cache`, `jarvis_letta-data`, `jarvis_workbench-artifacts`.
- Zurueckholen: `docker compose -f /home/arasul/jarvis/compose.yaml up -d` und dasselbe fuer avatar-pipeline.
- Nebenbefund zu F-45: `avatar-pipeline` haelt ein Volume `avatar-whisper-models` und liest Arasuls MinIO mit Arasuls Root-Zugangsdaten. Spracherkennung liegt physisch auf dem Geraet, gehoert aber einem anderen Produkt.
