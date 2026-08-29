/**
 * Die Datenliste hat vier Zusagen, die man prüfen kann, und sie sind der
 * Grund, warum es sie gibt: sortieren nach dem WERT (nicht nach dem, was man
 * sieht), filtern über alle Spalten, den richtigen Leerzustand zeigen, und
 * unter 900 px Karten statt einer Tabelle — immer nur EINE Form im Dokument.
 *
 * Der vierte Punkt ist der, der ohne Test lautlos bricht: `useSchmalesFenster`
 * liest `matchMedia` einmal beim Einhängen, und die Vorgabe des Setups ist
 * `matches: false`. Wer die Kartenform prüfen will, muss sie ausdrücklich
 * einstellen — sonst prüft er zweimal dieselbe Tabelle.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Datenliste, type Spalte } from '../muster/Datenliste';

interface Lauf {
  id: string;
  flow: string;
  dauer: number;
}

const DATEN: Lauf[] = [
  { id: 'r1', flow: 'Urlaub prüfen', dauer: 143 },
  { id: 'r2', flow: 'Angebot schreiben', dauer: 9 },
  { id: 'r3', flow: 'Rechnung buchen', dauer: 41 },
];

const SPALTEN: Array<Spalte<Lauf>> = [
  { schluessel: 'flow', titel: 'Flow', zelle: l => l.flow, wert: l => l.flow },
  // Zwei Angaben mit Absicht: „143 s" als Text stünde vor „9 s".
  { schluessel: 'dauer', titel: 'Dauer', zelle: l => `${l.dauer} s`, wert: l => l.dauer },
];

function schmalStellen(schmal: boolean) {
  window.matchMedia = ((query: string) =>
    ({
      matches: schmal,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
}

describe('Datenliste', () => {
  beforeEach(() => schmalStellen(false));

  it('zeigt ab 900 px eine Tabelle mit ihrer Beschriftung', () => {
    render(
      <Datenliste
        daten={DATEN}
        spalten={SPALTEN}
        kennung={l => l.id}
        beschriftung="Die letzten Läufe"
      />
    );
    const tabelle = screen.getByRole('table');
    expect(within(tabelle).getByText('Die letzten Läufe')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(DATEN.length + 1);
  });

  it('sortiert nach dem Wert der Spalte und nicht nach ihrem Text', async () => {
    const nutzer = userEvent.setup();
    render(<Datenliste daten={DATEN} spalten={SPALTEN} kennung={l => l.id} beschriftung="Läufe" />);

    await nutzer.click(screen.getByRole('button', { name: /Dauer/ }));

    const zellen = screen.getAllByRole('cell').map(z => z.textContent);
    // Aufsteigend nach der ZAHL: 9 vor 41 vor 143. Nach dem Text wäre es
    // 143 vor 41 vor 9 -- genau der Fehler, gegen den `wert` steht.
    expect(zellen.filter(t => t?.endsWith(' s'))).toEqual(['9 s', '41 s', '143 s']);
  });

  it('dreht die Richtung beim zweiten Klick um', async () => {
    const nutzer = userEvent.setup();
    render(<Datenliste daten={DATEN} spalten={SPALTEN} kennung={l => l.id} beschriftung="Läufe" />);
    const kopf = screen.getByRole('button', { name: /Dauer/ });

    await nutzer.click(kopf);
    await nutzer.click(kopf);

    const zellen = screen.getAllByRole('cell').map(z => z.textContent);
    expect(zellen.filter(t => t?.endsWith(' s'))).toEqual(['143 s', '41 s', '9 s']);
  });

  it('sagt über aria-sort, wonach gerade sortiert ist', async () => {
    const nutzer = userEvent.setup();
    render(<Datenliste daten={DATEN} spalten={SPALTEN} kennung={l => l.id} beschriftung="Läufe" />);
    const spalte = screen.getByRole('columnheader', { name: /Dauer/ });
    expect(spalte).toHaveAttribute('aria-sort', 'none');

    await nutzer.click(screen.getByRole('button', { name: /Dauer/ }));
    expect(spalte).toHaveAttribute('aria-sort', 'ascending');
  });

  it('filtert über alle Spalten mit einem Wert', async () => {
    const nutzer = userEvent.setup();
    render(
      <Datenliste daten={DATEN} spalten={SPALTEN} kennung={l => l.id} beschriftung="Läufe" filter />
    );

    await nutzer.type(screen.getByRole('searchbox'), 'Angebot');

    expect(screen.getByText('Angebot schreiben')).toBeInTheDocument();
    expect(screen.queryByText('Urlaub prüfen')).not.toBeInTheDocument();
  });

  it('unterscheidet »noch nichts da« von »nichts passt zur Suche«', async () => {
    const nutzer = userEvent.setup();
    const { rerender } = render(
      <Datenliste
        daten={[]}
        spalten={SPALTEN}
        kennung={l => l.id}
        beschriftung="Läufe"
        filter
        leer={{ titel: 'Noch kein Lauf' }}
      />
    );
    expect(screen.getByText('Noch kein Lauf')).toBeInTheDocument();

    rerender(
      <Datenliste
        daten={DATEN}
        spalten={SPALTEN}
        kennung={l => l.id}
        beschriftung="Läufe"
        filter
        leer={{ titel: 'Noch kein Lauf' }}
      />
    );
    await nutzer.type(screen.getByRole('searchbox'), 'gibtesnicht');

    expect(screen.getByText('Nichts passt zu dieser Suche.')).toBeInTheDocument();
    expect(screen.queryByText('Noch kein Lauf')).not.toBeInTheDocument();
  });

  it('zeigt unter 900 px Karten und KEINE Tabelle', () => {
    schmalStellen(true);
    render(<Datenliste daten={DATEN} spalten={SPALTEN} kennung={l => l.id} beschriftung="Läufe" />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Läufe' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(DATEN.length);
  });

  it('macht die Zeile nur dann anklickbar, wenn es etwas zu klicken gibt', async () => {
    const nutzer = userEvent.setup();
    const gerufen = vi.fn();
    schmalStellen(true);
    render(
      <Datenliste
        daten={DATEN}
        spalten={SPALTEN}
        kennung={l => l.id}
        beschriftung="Läufe"
        aufZeile={gerufen}
      />
    );

    await nutzer.click(screen.getAllByRole('button')[0]!);
    expect(gerufen).toHaveBeenCalledTimes(1);
  });
});
