/**
 * Die Schaustücke der Hauptfassung 6: die Bausteine des Klickentwurfs.
 *
 * Jeder steht hier in seinen Zuständen, und die Seite zeigt ihn hell wie
 * dunkel, wie das Theme es verlangt. Die schwebenden (Popup, Blatt,
 * Vollbild) öffnen sich in einer eigenen Bühne: ein umgebendes Element mit
 * `transform` macht aus `position: fixed` eine Lage relativ zu sich, und
 * die Bühne hält die Ebene damit vom Rest der Seite fern.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  AppIcon,
  Board,
  type BoardKarte,
  Dock,
  DockEintrag,
  Ebene,
  Fenster,
  Glas,
  Glasleiste,
  Hauptkapsel,
  IconKnopf,
  LINIEN_NAMEN,
  Linie,
  Liste,
  ListenEintrag,
  Karte,
  Meldung,
  Popup,
  PopupEintrag,
  PopupGruppe,
  Reiter,
  Segmente,
  Stufenleiste,
  TextKnopf,
  Wischzeile,
} from '@marken';
import { Schaustueck, Zustand } from './Schaustueck';

/** Der Grund des Rahmens, damit man das Glas überhaupt sieht. */
function Grund({ children, hoehe }: { children: ReactNode; hoehe?: number }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl p-ui-3"
      style={{ background: 'var(--verlauf-rahmen)', minHeight: hoehe }}
    >
      {children}
    </div>
  );
}

/** Eine Bühne für Ebenen: `transform` fängt `position: fixed` ein. */
function Buehne({
  name,
  beschriftung,
  children,
}: {
  name: string;
  beschriftung: string;
  children: (offen: boolean, zu: () => void) => ReactNode;
}) {
  const [offen, setOffen] = useState(false);
  return (
    <div
      className="relative w-full overflow-hidden rounded-xl"
      style={{ background: 'var(--verlauf-rahmen)', height: 560, transform: 'translateZ(0)' }}
      data-buehne={name}
    >
      <div className="p-ui-3">
        <TextKnopf onKlick={() => setOffen(true)}>{beschriftung}</TextKnopf>
      </div>
      {children(offen, () => setOffen(false))}
    </div>
  );
}

const STUFEN = [
  { id: 'entwurf', titel: 'Entwurf' },
  { id: 'offen', titel: 'Offen' },
  { id: 'frei', titel: 'Freigabe', blass: true },
];
const KARTEN_START: BoardKarte[] = [
  { id: 'a1', stufe: 'entwurf', titel: 'Hallendach Süd', nummer: 'A-2026-101' },
  { id: 'a2', stufe: 'entwurf', titel: 'Treppengeländer', nummer: 'A-2026-102', etikett: 'Neu' },
  { id: 'a3', stufe: 'offen', titel: 'Vordach Werkstatt', nummer: 'A-2026-099' },
];

function BoardBeispiel() {
  const [karten, setKarten] = useState(KARTEN_START);
  return (
    <Board
      stufen={STUFEN}
      karten={karten}
      beiVerschieben={(karte, stufe) =>
        setKarten(k => k.map(x => (x.id === karte.id ? { ...x, stufe: stufe.id } : x)))
      }
    />
  );
}

function PopupBeispiel({ offen, zu }: { offen: boolean; zu: () => void }) {
  const [wert, setWert] = useState('');
  const treffer = (s: string) => s.toLowerCase().includes(wert.toLowerCase());
  const apps = ['Angebote', 'Lager', 'Urlaubskalender'].filter(treffer);
  const befehle = ['Neues Angebot', 'Abmelden'].filter(treffer);
  return (
    <Popup
      offen={offen}
      titel="Suche"
      onSchliessen={zu}
      suche={{ wert, onAendern: setWert, platzhalter: 'Suchen' }}
      leer={apps.length + befehle.length === 0}
    >
      {apps.length > 0 && (
        <PopupGruppe titel="Apps">
          {apps.map(a => (
            <PopupEintrag key={a} app symbol="angebote" titel={a} onWaehlen={zu} />
          ))}
        </PopupGruppe>
      )}
      {befehle.length > 0 && (
        <PopupGruppe titel="Befehle">
          {befehle.map(b => (
            <PopupEintrag
              key={b}
              symbol={b === 'Abmelden' ? 'personen' : 'plus'}
              titel={b}
              kuerzel={b === 'Abmelden' ? undefined : '⌘N'}
              onWaehlen={zu}
            />
          ))}
        </PopupGruppe>
      )}
    </Popup>
  );
}

function WischBeispiel() {
  const [zeilen, setZeilen] = useState(['Urlaub Anna K.', 'Neue App: Lager']);
  const [letzte, setLetzte] = useState<string | null>(null);
  const weg = (z: string) => {
    setZeilen(l => l.filter(x => x !== z));
    setLetzte(z);
  };
  return (
    <div className="flex w-full max-w-md flex-col gap-ui-2">
      {zeilen.map(z => (
        <Wischzeile
          key={z}
          symbol="kalender"
          titel={z}
          unterzeile="Wartet auf Sie"
          beiFreigeben={() => weg(z)}
          beiAblehnen={() => weg(z)}
        />
      ))}
      {letzte && (
        <Meldung
          art="erfolg"
          beiRueckgaengig={() => {
            setZeilen(l => [letzte, ...l]);
            setLetzte(null);
          }}
          beiAblauf={() => setLetzte(null)}
        >
          Erledigt: {letzte}
        </Meldung>
      )}
      {zeilen.length === 0 && !letzte && (
        <TextKnopf onKlick={() => setZeilen(['Urlaub Anna K.', 'Neue App: Lager'])}>
          Zurücksetzen
        </TextKnopf>
      )}
    </div>
  );
}

function ReiterBeispiel() {
  const [aktiv, setAktiv] = useState('daten');
  return (
    <div className="w-full max-w-md">
      <Reiter
        aktiv={aktiv}
        onWaehlen={setAktiv}
        eintraege={[
          { id: 'daten', titel: 'Daten' },
          { id: 'anhaenge', titel: 'Anhänge', zahl: 2 },
          { id: 'notizen', titel: 'Notizen' },
        ]}
      />
    </div>
  );
}

function SegmentBeispiel() {
  const [a, setA] = useState('hell');
  const [b, setB] = useState('anfrage');
  return (
    <>
      <Zustand name="Zwei">
        <Segmente
          beschriftung="Darstellung"
          wert={a}
          onWaehlen={setA}
          eintraege={[
            { id: 'hell', titel: 'Hell' },
            { id: 'dunkel', titel: 'Dunkel' },
          ]}
        />
      </Zustand>
      <Zustand name="Drei">
        <Segmente
          beschriftung="Art"
          wert={b}
          onWaehlen={setB}
          eintraege={[
            { id: 'anfrage', titel: 'Anfrage' },
            { id: 'idee', titel: 'Idee' },
            { id: 'feedback', titel: 'Feedback' },
          ]}
        />
      </Zustand>
    </>
  );
}

export function SchaustueckeFassung6() {
  return (
    <>
      <Schaustueck
        name="Linie"
        satz="Der Linien-Satz: Strich 1,5, runde Enden, höchstens drei Striche, 16, 20 und 24 Pixel."
      >
        <Zustand name="24 px, alle Symbole">
          <div className="flex max-w-2xl flex-wrap gap-ui-3 text-foreground">
            {LINIEN_NAMEN.map(n => (
              <span key={n} title={n}>
                <Linie name={n} groesse={24} />
              </span>
            ))}
          </div>
        </Zustand>
        <Zustand name="16 px">
          <Linie name="suche" groesse={16} />
        </Zustand>
        <Zustand name="20 px">
          <Linie name="suche" groesse={20} />
        </Zustand>
      </Schaustueck>

      <Schaustueck name="AppIcon" satz="Dasselbe Linien-Icon in Blau auf zart blauem Squircle.">
        <Zustand name="32 px">
          <AppIcon symbol="angebote" groesse={32} />
        </Zustand>
        <Zustand name="44 px">
          <AppIcon symbol="kalender" />
        </Zustand>
        <Zustand name="64 px">
          <AppIcon symbol="lager" groesse={64} />
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Glas"
        satz="Schwebende Fläche mit Rückfall: deckend, wo es keine Unschärfe gibt."
      >
        <Grund>
          <div className="flex flex-wrap gap-ui-3">
            <Glas form="karte">
              <div className="p-ui-4">Karte</div>
            </Glas>
            <Glas form="kapsel">
              <div className="px-ui-4 py-ui-2">Kapsel</div>
            </Glas>
            <Glas form="kreis">
              <div className="flex size-11 items-center justify-center">
                <Linie name="plus" />
              </div>
            </Glas>
          </div>
        </Grund>
      </Schaustueck>

      <Schaustueck
        name="IconKnopf"
        satz="Ein Icon und ein Hinweis, 44 Pixel Trefferfläche: Glaskreis oder flach."
      >
        <Grund>
          <div className="flex flex-wrap items-center gap-ui-3">
            <Zustand name="Glaskreis">
              <IconKnopf symbol="plus" hinweis="Neu" />
            </Zustand>
            <Zustand name="Flach">
              <IconKnopf symbol="suche" hinweis="Suchen" art="flach" />
            </Zustand>
            <Zustand name="Gewählt">
              <IconKnopf symbol="live" hinweis="Live" art="flach" aktiv />
            </Zustand>
            <Zustand name="Gesperrt">
              <IconKnopf symbol="schliessen" hinweis="Schließen" gesperrt />
            </Zustand>
          </div>
        </Grund>
      </Schaustueck>

      <Schaustueck
        name="Hauptkapsel"
        satz="Die eine Aktion einer Ansicht, mit einem Wort. Dazu der Textknopf mit Hinweis."
      >
        <Zustand name="Hauptkapsel">
          <Hauptkapsel>Demo</Hauptkapsel>
        </Zustand>
        <Zustand name="Mit Symbol">
          <Hauptkapsel symbol="plus">Anlegen</Hauptkapsel>
        </Zustand>
        <Zustand name="Gesperrt">
          <Hauptkapsel gesperrt>Senden</Hauptkapsel>
        </Zustand>
        <Zustand name="Textknopf">
          <TextKnopf hinweis="Ohne Speichern zurück">Abbrechen</TextKnopf>
        </Zustand>
      </Schaustueck>

      <Schaustueck
        name="Glasleiste"
        satz="Durchgehend oben: links der Weg, rechts flache Icons; im Test ein blauer Streifen."
      >
        <Grund>
          <div className="flex w-full flex-col gap-ui-3 [&>*]:w-full">
            <Zustand name="Start">
              <Glasleiste
                links={<IconKnopf symbol="idee" hinweis="Vogel" art="flach" />}
                rechts={
                  <>
                    <Segmente
                      beschriftung="Stand"
                      wert="live"
                      onWaehlen={() => undefined}
                      eintraege={[
                        { id: 'live', titel: 'Live' },
                        { id: 'test', titel: 'Test' },
                      ]}
                    />
                    <IconKnopf symbol="rueckmeldung" hinweis="Rückmeldung" art="flach" />
                    <IconKnopf symbol="suche" hinweis="Suchen" art="flach" />
                  </>
                }
              />
            </Zustand>
            <Zustand name="Ebene 2 im Test">
              <Glasleiste
                test
                links={
                  <TextKnopf>
                    <Linie name="zurueck" groesse={16} /> Angebote
                  </TextKnopf>
                }
                mitte="A-2026-101"
                rechts={<IconKnopf symbol="suche" hinweis="Suchen" art="flach" />}
              />
            </Zustand>
          </div>
        </Grund>
      </Schaustueck>

      <Schaustueck
        name="Dock"
        satz="Glaspille mit gleitender Markierung, Plus in der Mitte, blaue Zahl offener Freigaben."
      >
        <Grund>
          <div className="flex w-full justify-center">
            <Dock>
              <DockEintrag symbol="start" beschriftung="Start" aktiv />
              <DockEintrag symbol="fuerSie" beschriftung="Für Sie" zahl={3} />
              <DockEintrag symbol="plus" beschriftung="Neu" plus />
              <DockEintrag symbol="store" beschriftung="Store" />
              <DockEintrag symbol="zuletzt" beschriftung="Zuletzt" />
            </Dock>
          </div>
        </Grund>
      </Schaustueck>

      <Schaustueck
        name="Popup"
        satz="Glaskapsel im oberen Drittel: Suchfeld, Gruppen, Pfeiltasten, Escape."
      >
        <Buehne name="popup" beschriftung="Popup öffnen">
          {(offen, zu) => <PopupBeispiel offen={offen} zu={zu} />}
        </Buehne>
      </Schaustueck>

      <Schaustueck
        name="Ebene"
        satz="Blatt (rechts am Rechner, von unten am Handy) und Vollbild mit schwebendem X."
      >
        <Buehne name="blatt" beschriftung="Blatt öffnen">
          {(offen, zu) => (
            <Ebene
              offen={offen}
              onSchliessen={zu}
              titel="Angebot A-2026-101"
              aktionen={<Hauptkapsel onKlick={zu}>Speichern</Hauptkapsel>}
            >
              <ReiterBeispiel />
              <p className="pt-ui-3">Hallendach Süd, Kerschner Metallbau.</p>
            </Ebene>
          )}
        </Buehne>
        <Buehne name="vollbild" beschriftung="Vollbild öffnen">
          {(offen, zu) => (
            <Ebene offen={offen} onSchliessen={zu} art="vollbild" titel="Demo">
              <p className="p-ui-4 pr-16">Die App im Vollbild.</p>
            </Ebene>
          )}
        </Buehne>
      </Schaustueck>

      <Schaustueck
        name="Fenster"
        satz="Schlankes Fenster: weiß, rund, dünne Glasleiste mit App-Icon, feste Höhe."
      >
        <div className="w-full max-w-xl">
          <Fenster
            titel="Angebote"
            symbol="angebote"
            hoehe={300}
            werkzeuge={
              <>
                <IconKnopf symbol="plus" hinweis="Neu" art="flach" />
                <IconKnopf symbol="rueckgaengig" hinweis="Zurücksetzen" art="flach" />
              </>
            }
          >
            <div className="p-ui-3">
              <Liste beschriftung="Offen">
                <ListenEintrag titel="Hallendach Süd" hinweis="A-101" />
                <ListenEintrag titel="Treppengeländer" hinweis="A-102" />
              </Liste>
            </div>
          </Fenster>
        </div>
      </Schaustueck>

      <Schaustueck
        name="Board"
        satz="Karten frei ziehen, mit Maus sofort, mit Finger nach 400 ms; unter 900 Pixeln eine Liste."
      >
        <BoardBeispiel />
      </Schaustueck>

      <Schaustueck
        name="Stufenleiste"
        satz="Wo ein Datensatz steht; die erreichten Stufen sind blau gefüllt."
      >
        <div className="w-full max-w-md">
          <Stufenleiste stufen={['Entwurf', 'Offen', 'Freigabe', 'Fertig']} aktuell={1} />
        </div>
      </Schaustueck>

      <Schaustueck name="Reiter" satz="Daten, Anhänge, Notizen: eine Linie gleitet zum gewählten.">
        <ReiterBeispiel />
      </Schaustueck>

      <Schaustueck
        name="Segmente"
        satz="Eine Wahl aus zwei bis vier als Pille mit gleitender Fläche."
      >
        <SegmentBeispiel />
      </Schaustueck>

      <Schaustueck
        name="Wischzeile"
        satz="Nach rechts freigeben, nach links ablehnen, Schwelle 40 Prozent; Rückgängig 5 Sekunden."
      >
        <WischBeispiel />
      </Schaustueck>

      <Schaustueck
        name="Listenzeile"
        satz="Zeile von 48 Pixeln mit Symbol, Titel und einer Angabe rechts, und die Karte darunter."
      >
        <div className="flex w-full max-w-md flex-col gap-ui-3">
          <Liste beschriftung="Zuletzt">
            <ListenEintrag
              symbol={<AppIcon symbol="kalender" groesse={32} />}
              titel="Urlaubsantrag Anna K."
              unterzeile="Urlaub · U-2026-014"
              hinweis="Offen"
            />
            <ListenEintrag
              symbol={<AppIcon symbol="angebote" groesse={32} />}
              titel="Hallendach Süd"
              unterzeile="Angebote · A-2026-101"
              hinweis="Offen"
            />
          </Liste>
          <Karte titel="Angebote" hinweis="12 offen">
            Zwei warten auf Freigabe.
          </Karte>
        </div>
      </Schaustueck>

      <Schaustueck
        name="Meldung"
        satz="Meldung mit Rückgängig als Glaskapsel: Haken, Satz, runder Pfeil; fünf Sekunden Frist."
      >
        <div className="w-full max-w-md">
          <Meldung art="erfolg" beiRueckgaengig={() => undefined} frist={600000}>
            Freigegeben.
          </Meldung>
        </div>
      </Schaustueck>
    </>
  );
}
