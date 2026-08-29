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
  Button,
  Dateiablage,
  Datenliste,
  Feldgruppe,
  Formularseite,
  Input,
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
      </Schaustueck>

      <Schaustueck
        name="Seitenleiste"
        satz="Die Navigation aus einer Liste. Wer aktiv ist, sagt die Anwendung."
      >
        <Zustand name="eingebettet">
          <SidebarProvider eingebettet className="h-48 w-80 rounded-md border border-border">
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
          <SidebarProvider eingebettet className="h-48 w-80 rounded-md border border-border">
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
