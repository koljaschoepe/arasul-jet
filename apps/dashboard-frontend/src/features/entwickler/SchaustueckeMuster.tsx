/**
 * Die Schaustücke der Muster (Phase H4) — der dritte Satz der Bibliothek.
 *
 * Sie sind der Grund, aus dem die Schauseite mehr ist als eine Farbprobe:
 * ein Muster hat Zustände, die kein Bild zeigt. Eine `Datenliste` sieht
 * leer anders aus als gefüllt, gefiltert-und-leer anders als leer, und
 * unter 900 px ganz anders als darüber. Was hier steht, ist genau diese
 * Reihe — jeder Zustand einmal, damit er in beiden Themes einmal
 * angesehen wurde.
 */
import { useState } from 'react';
import { CalendarPlus, Inbox, LayoutDashboard, Package, Users } from 'lucide-react';
import {
  Badge,
  Bestaetigung,
  Button,
  Dateiablage,
  Datenliste,
  Dialogform,
  Dokumentanzeige,
  Feldgruppe,
  Formularseite,
  Input,
  Kennzahl,
  Kennzahlen,
  Label,
  Ladezustand,
  Leerzustand,
  Seitenleiste,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  Suchauswahl,
  Switch,
  type Spalte,
} from '@marken';
import { Schaustueck, Zustand } from './Schaustueck';
import { PROBE_BILD, probePdf, probePdfDatei } from './probeDokumente';

interface Lauf {
  id: string;
  flow: string;
  zustand: 'fertig' | 'wartend' | 'abgebrochen';
  dauer: number;
}

const LAEUFE: Lauf[] = [
  { id: 'r1', flow: 'Urlaub prüfen', zustand: 'fertig', dauer: 12 },
  { id: 'r2', flow: 'Angebot schreiben', zustand: 'wartend', dauer: 143 },
  { id: 'r3', flow: 'Rechnung buchen', zustand: 'abgebrochen', dauer: 4 },
  { id: 'r4', flow: 'Urlaub prüfen', zustand: 'fertig', dauer: 9 },
];

const SPALTEN: Array<Spalte<Lauf>> = [
  {
    schluessel: 'flow',
    titel: 'Flow',
    zelle: lauf => lauf.flow,
    wert: lauf => lauf.flow,
  },
  {
    schluessel: 'zustand',
    titel: 'Zustand',
    zelle: lauf => (
      <Badge
        variant={
          lauf.zustand === 'fertig'
            ? 'success'
            : lauf.zustand === 'wartend'
              ? 'warning'
              : 'destructive'
        }
      >
        {lauf.zustand}
      </Badge>
    ),
    wert: lauf => lauf.zustand,
  },
  {
    schluessel: 'dauer',
    titel: 'Dauer',
    // Was man sieht, ist nicht, wonach sortiert wird: „143 s" als Text
    // stünde vor „9 s". Deshalb zwei Angaben.
    zelle: lauf => `${lauf.dauer} s`,
    wert: lauf => lauf.dauer,
    ausrichtung: 'rechts',
  },
];

const APPS = [
  { wert: 'urlaubsantrag', name: 'Urlaubsantrag', hinweis: 'Livestand 1.4.0' },
  { wert: 'angebot', name: 'Angebot', hinweis: 'Teststand 0.9.2' },
  { wert: 'beispielapp', name: 'Beispielapp', hinweis: 'Livestand 1.0.0' },
];

export function SchaustueckeMuster() {
  const [app, setApp] = useState('');
  const [dateien, setDateien] = useState<File[]>([]);
  // Einmal gebaut, nicht je Render: eine neue Quelle je Render liesse die
  // Dokumentanzeige bei jedem Tastendruck auf dieser Seite neu laden.
  const [probeBlob] = useState(probePdf);
  const [vorschauDateien, setVorschauDateien] = useState<File[]>(() => [probePdfDatei()]);
  const [dialogOffen, setDialogOffen] = useState(false);
  const [frageOffen, setFrageOffen] = useState(false);

  return (
    <>
      <Schaustueck
        name="Datenliste"
        satz="Zeilen zeigen, sortieren, durchsuchen, und unter 900 px als Karten."
      >
        <Zustand name="gefüllt, sortierbar, mit Filter">
          <div className="w-80">
            <Datenliste
              daten={LAEUFE}
              spalten={SPALTEN}
              kennung={lauf => lauf.id}
              beschriftung="Die letzten Läufe"
              filter
            />
          </div>
        </Zustand>
        <Zustand name="leer">
          <div className="w-72">
            <Datenliste
              daten={[]}
              spalten={SPALTEN}
              kennung={lauf => lauf.id}
              beschriftung="Läufe dieses Stands"
              leer={{
                titel: 'Noch kein Lauf',
                beschreibung: 'Der erste Aufruf der App legt einen an.',
                aktion: <Button size="sm">Flow starten</Button>,
              }}
            />
          </div>
        </Zustand>
        <Zustand name="lädt">
          <div className="w-72">
            <Datenliste
              daten={[]}
              spalten={SPALTEN}
              kennung={lauf => lauf.id}
              beschriftung="Läufe dieses Stands"
              laedt
            />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Suchauswahl"
        satz="Anderswo »Combobox«: eine Auswahl, die beim Tippen enger wird."
      >
        <Zustand name="leer">
          <Suchauswahl moeglichkeiten={APPS} wert={app} aufWert={setApp} platzhalter="App wählen" />
        </Zustand>
        <Zustand name="gewählt">
          <Suchauswahl moeglichkeiten={APPS} wert="urlaubsantrag" aufWert={() => undefined} />
        </Zustand>
        <Zustand name="disabled">
          <Suchauswahl moeglichkeiten={APPS} aufWert={() => undefined} disabled />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Dateiablage" satz="Ziehen oder auswählen. Ziehen ist nie der einzige Weg.">
        <Zustand name="leer">
          <div className="w-72">
            <Dateiablage dateien={dateien} aufDateien={setDateien} maxGroesse={5 * 1024 * 1024} />
          </div>
        </Zustand>
        <Zustand name="disabled">
          <div className="w-72">
            <Dateiablage dateien={[]} aufDateien={() => undefined} disabled />
          </div>
        </Zustand>
        <Zustand name="mit Vorschau">
          <div className="w-96">
            <Dateiablage
              dateien={vorschauDateien}
              aufDateien={setVorschauDateien}
              akzeptiert=".pdf,image/*"
            />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Dokumentanzeige"
        satz="PDF und Bilder im Kasten der Anwendung. pdf.js kommt erst mit der ersten PDF-Quelle."
      >
        <Zustand name="leer">
          <div className="w-96">
            <Dokumentanzeige hoehe="12rem" />
          </div>
        </Zustand>
        <Zustand name="Bild">
          <div className="w-96">
            <Dokumentanzeige quelle={PROBE_BILD} name="probe.svg" hoehe="16rem" />
          </div>
        </Zustand>
        <Zustand name="PDF">
          {/* Das PDF entsteht beim Rendern (`probeDokumente.ts`) und misst
              den ganzen Weg: eigener Brocken, Worker gleicher Herkunft,
              Standardschriften aus `pdf-dateien/` -- unter der CSP des
              Geraets. Eine Warnung auf diesem Weg landet in der Konsole,
              und danach fragt `schauseite.mjs` in jeder Zelle. */}
          <div className="w-96">
            <Dokumentanzeige quelle={probeBlob} name="probe.pdf" hoehe="20rem" />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Seitenleiste"
        satz="Die Navigation aus einer Liste. Wer aktiv ist, sagt die Anwendung."
      >
        <Zustand name="eingebettet">
          {/* BREIT GENUG, DASS DANEBEN NOCH ETWAS STEHT (J31, 30.08.2026).
            Die Leiste ist 16rem breit, und das Schaustueck soll nicht sie
            zeigen, sondern das NEBENEINANDER. Im 20rem-Kasten blieb daneben
            weniger frei, als `SidebarInset` fuer seinen eigenen Inhalt
            braucht (gemessen 66 px frei gegen 99 px Mindestbreite): die
            Flaeche schrumpft nicht unter ihren Inhalt, sie schiebt ihn aus
            dem Rahmen, und aus „Inhalt" wurde „Inl". Wer die Bibliothek hier
            lernt, sah damit einen Baustein ohne seine Wirkung. 30rem lassen
            der Flaeche eine eigene Spalte. Unter 900 px gibt es das
            Nebeneinander nicht (dort ist die Leiste ein Blatt, D7), und was
            dann breiter ist als die Seite, rollt im Kasten des
            Schaustuecks. */}
          <SidebarProvider eingebettet className="h-48 w-[30rem] rounded-md border border-border">
            <Seitenleiste
              gruppen={[
                {
                  titel: 'Arbeit',
                  eintraege: [
                    {
                      kennung: 'uebersicht',
                      name: 'Übersicht',
                      symbol: <LayoutDashboard />,
                      aktiv: true,
                    },
                    { kennung: 'apps', name: 'Apps', symbol: <Package />, zahl: 3 },
                  ],
                },
                {
                  titel: 'Verwaltung',
                  eintraege: [{ kennung: 'menschen', name: 'Mitarbeiter', symbol: <Users /> }],
                },
              ]}
            />
            <SidebarInset>
              <div className="flex items-center gap-2 p-ui-2 text-ui-sm">
                <SidebarTrigger />
                Inhalt
              </div>
            </SidebarInset>
          </SidebarProvider>
        </Zustand>
        <Zustand name="lädt">
          <SidebarProvider eingebettet className="h-48 w-[30rem] rounded-md border border-border">
            <Seitenleiste gruppen={[]} laedt />
            <SidebarInset>
              <div className="p-ui-2 text-ui-sm text-muted-foreground">Inhalt</div>
            </SidebarInset>
          </SidebarProvider>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Feldgruppe"
        satz="Ein Abschnitt einer Seite: Überschrift, ein Satz, eine Aktion rechts."
      >
        <Zustand name="allein">
          <div className="w-80">
            <Feldgruppe
              titel="Betrieb"
              beschreibung="Gilt ab dem nächsten Start."
              aktion={<Switch aria-label="Automatisch starten" />}
            >
              <p className="text-ui-sm text-muted-foreground">
                Allein stehend trägt sie ihre Trennlinie: sie weiß nicht, ob nach ihr noch etwas
                kommt.
              </p>
            </Feldgruppe>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Formularseite"
        satz="Feldgruppen untereinander. Die Trennlinie gehört zwischen sie, nicht an sie."
      >
        <Zustand name="zwei Gruppen">
          <div className="w-80">
            <Formularseite>
              <Feldgruppe
                titel="Anzeige"
                symbol={<CalendarPlus />}
                beschreibung="Was der Mensch von dieser App sieht."
              >
                <div className="flex flex-col gap-1">
                  <Label htmlFor="schau-muster-name">Name</Label>
                  <Input id="schau-muster-name" defaultValue="Urlaubsantrag" />
                </div>
              </Feldgruppe>
              <Feldgruppe
                titel="Betrieb"
                beschreibung="Gilt ab dem nächsten Start."
                aktion={<Switch aria-label="Automatisch starten" />}
              >
                <p className="text-ui-sm text-muted-foreground">
                  Der letzte Abschnitt trägt keine Trennlinie. Das entscheidet die Formularseite,
                  nicht der Abschnitt.
                </p>
              </Feldgruppe>
            </Formularseite>
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck name="Leerzustand" satz="Er sagt, wie sich die Liste füllt. Das ist sein Zweck.">
        <Zustand name="mit Einstieg">
          <div className="w-72 rounded-md border border-border">
            <Leerzustand
              symbol={<Inbox />}
              titel="Noch keine App"
              beschreibung="Ein Partner spielt sie mit dem Ara-Kit ein."
              aktion={<Button size="sm">Kit-Schlüssel zeigen</Button>}
            />
          </div>
        </Zustand>
        <Zustand name="nur Titel">
          <div className="w-72 rounded-md border border-border">
            <Leerzustand titel="Keine Ereignisse" />
          </div>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Kennzahl"
        satz="Eine Zahl mit ihrer Beschriftung; das Raster legt eins, zwei oder vier Spalten fest."
      >
        <Zustand name="einzeln, mit Einheit und Fußnote">
          <div className="w-64">
            <Kennzahl
              beschriftung="Arbeitsspeicher"
              wert="41,8"
              einheit="%"
              fussnote="25,5 von 61 GB"
            />
          </div>
        </Zustand>
        <Zustand name="vier im Raster">
          <div className="w-full min-w-0">
            <Kennzahlen>
              <Kennzahl beschriftung="Arbeitsspeicher" wert="41,8" einheit="%" />
              <Kennzahl beschriftung="Auslagerung" wert="0,4" einheit="%" />
              <Kennzahl beschriftung="Speicherplatz" wert="63" einheit="%" />
              <Kennzahl beschriftung="Temperatur" wert="47" einheit="°C" />
            </Kennzahlen>
          </div>
        </Zustand>
        <Zustand name="ohne Zahl">
          <div className="w-64">
            <Kennzahl beschriftung="Letzte Sicherung" wert="keine" fussnote="noch nie gelaufen" />
          </div>
        </Zustand>
      </Schaustueck>

      {/*
        EIN DIALOG BRAUCHT EINEN KNOPF, der ihn aufmacht. Anders als jedes
        andere Stück auf dieser Seite steht er nicht einfach da: er liegt über
        allem, und ein Dutzend offener Dialoge nebeneinander wäre kein Bild,
        sondern ein Stapel. Die Abnahme misst deshalb den Knopf; wer die
        Seite ansieht, macht ihn auf.
      */}
      <Schaustueck
        name="Dialogform"
        satz="Titel, rollender Rumpf, Fuß mit den Knöpfen. Vier Breiten."
      >
        <Zustand name="mittel, mit Fuß">
          <Button variant="outline" onClick={() => setDialogOffen(true)}>
            Dialog öffnen
          </Button>
          <Dialogform
            offen={dialogOffen}
            beiSchliessen={() => setDialogOffen(false)}
            titel={'Modell für „Urlaub prüfen"'}
            groesse="mittel"
            fuss={
              <div className="flex w-full justify-end gap-3">
                <Button variant="outline" onClick={() => setDialogOffen(false)}>
                  Abbrechen
                </Button>
                <Button onClick={() => setDialogOffen(false)}>Übernehmen</Button>
              </div>
            }
          >
            <p className="text-ui-sm text-muted-foreground">
              Der Rumpf rollt, wenn er länger wird als der Bildschirm; Kopf und Fuß bleiben stehen.
            </p>
          </Dialogform>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Bestaetigung"
        satz="Die Frage mit zwei Antworten: kein Kreuz, kein Wegklicken daneben."
      >
        <Zustand name="gefährlich">
          <Button variant="outline" onClick={() => setFrageOffen(true)}>
            Frage öffnen
          </Button>
          <Bestaetigung
            offen={frageOffen}
            beiSchliessen={() => setFrageOffen(false)}
            beiBestaetigen={() => setFrageOffen(false)}
            titel="Eintrag löschen"
            frage={'„Urlaub prüfen" wirklich entfernen? Das lässt sich nicht zurücknehmen.'}
            jaText="Löschen"
            art="gefahr"
          />
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Ladezustand"
        satz="Für den Fall, in dem die Form des Ergebnisses noch offen ist."
      >
        <Zustand name="klein">
          <Ladezustand groesse="klein" meldung={null} />
        </Zustand>
        <Zustand name="mittel mit Meldung">
          <Ladezustand groesse="mittel" meldung="Sicherung läuft …" />
        </Zustand>
        <Zustand name="groß">
          <Ladezustand groesse="gross" />
        </Zustand>
      </Schaustueck>
    </>
  );
}
