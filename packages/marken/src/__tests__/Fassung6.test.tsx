/**
 * Die Bausteine der Hauptfassung 6: Verhalten, nicht Aussehen. Das Aussehen
 * prueft das Schaustueck mit Bildern.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  AppIcon,
  Board,
  Dock,
  DockEintrag,
  Ebene,
  Hauptkapsel,
  IconKnopf,
  LINIEN_NAMEN,
  Linie,
  Meldung,
  Popup,
  PopupEintrag,
  PopupGruppe,
  Reiter,
  Segmente,
  Stufenleiste,
  Wischzeile,
} from '../bausteine';
import { Glasleiste } from '../Leiste';

/**
 * jsdom kennt kein `PointerEvent`: `fireEvent.pointerDown` wuerde einen
 * schlichten `Event` ohne Koordinaten, Kennung und Art schicken. Die Hilfsklasse
 * traegt, was die Bausteine lesen.
 */
class ZeigerEreignis extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(art: string, init: PointerEventInit = {}) {
    super(art, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
  }
}
beforeAll(() => {
  vi.stubGlobal('PointerEvent', ZeigerEreignis);
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe('Linien-Satz', () => {
  it('zeichnet jedes Symbol mit Strich 1,5 und hoechstens drei Strichen', () => {
    for (const name of LINIEN_NAMEN) {
      const { container, unmount } = render(<Linie name={name} />);
      const svg = container.querySelector('svg') as SVGElement;
      expect(svg.getAttribute('stroke-width')).toBe('1.5');
      expect(svg.getAttribute('stroke-linecap')).toBe('round');
      expect(svg.querySelectorAll('path').length).toBeLessThanOrEqual(3);
      unmount();
    }
  });

  it('kennt nur die Groessen 16, 20 und 24 durch die Typen und nimmt 20 als Vorgabe', () => {
    const { container } = render(<Linie name="plus" />);
    expect(container.querySelector('svg')).toHaveAttribute('width', '20');
  });

  it('ist ohne Titel Schmuck und mit Titel ein Bild', () => {
    render(
      <>
        <Linie name="suche" />
        <Linie name="plus" titel="Neu" />
      </>
    );
    expect(screen.getByRole('img', { name: 'Neu' })).toBeInTheDocument();
    expect(screen.getAllByRole('img')).toHaveLength(1);
  });

  it('setzt das App-Icon auf einen Squircle in seiner Groesse', () => {
    const { container } = render(<AppIcon symbol="angebote" groesse={64} />);
    const squircle = container.querySelector('.ara-appicon') as HTMLElement;
    expect(squircle.style.getPropertyValue('--ara-appicon')).toBe('64px');
  });
});

describe('Knoepfe', () => {
  it('traegt den Hinweis als Namen und als Sprechblase', async () => {
    const klick = vi.fn();
    render(<IconKnopf symbol="suche" hinweis="Suchen" onKlick={klick} />);
    const knopf = screen.getByRole('button', { name: 'Suchen' });
    expect(knopf).toHaveAttribute('data-hinweis', 'Suchen');
    await userEvent.click(knopf);
    expect(klick).toHaveBeenCalledTimes(1);
  });

  it('meldet den gedrueckten Zustand nur, wenn er gesetzt ist', () => {
    const { rerender } = render(<IconKnopf symbol="live" hinweis="Live" />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed');
    rerender(<IconKnopf symbol="live" hinweis="Live" aktiv />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
  });

  it('zeichnet die Hauptkapsel mit einem Wort', async () => {
    const klick = vi.fn();
    render(<Hauptkapsel onKlick={klick}>Demo</Hauptkapsel>);
    await userEvent.click(screen.getByRole('button', { name: 'Demo' }));
    expect(klick).toHaveBeenCalled();
  });
});

describe('Glasleiste und Dock', () => {
  it('markiert den Teststand', () => {
    const { rerender } = render(<Glasleiste kennzeichen="leiste" />);
    expect(screen.getByTestId('leiste')).not.toHaveAttribute('data-test');
    rerender(<Glasleiste test kennzeichen="leiste" />);
    expect(screen.getByTestId('leiste')).toHaveAttribute('data-test', 'true');
  });

  it('nennt die Zahl offener Freigaben im Namen und zeichnet ohne Zahl keine Marke', () => {
    render(
      <Dock>
        <DockEintrag symbol="start" beschriftung="Start" aktiv />
        <DockEintrag symbol="fuerSie" beschriftung="Für Sie" zahl={3} />
        <DockEintrag symbol="plus" beschriftung="Neu" plus />
        <DockEintrag symbol="zuletzt" beschriftung="Zuletzt" zahl={0} />
      </Dock>
    );
    expect(screen.getByRole('button', { name: 'Für Sie, 3 offen' })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Zuletzt' })).toHaveTextContent('');
    expect(screen.getByRole('button', { name: 'Start' })).toHaveAttribute('aria-current', 'page');
  });
});

function PopupBeispiel({ zu }: { zu: () => void }) {
  const [wert, setWert] = useState('');
  const alle = ['Angebote', 'Lager'].filter(n => n.toLowerCase().includes(wert.toLowerCase()));
  return (
    <Popup
      offen
      titel="Suche"
      onSchliessen={zu}
      suche={{ wert, onAendern: setWert }}
      leer={alle.length === 0}
    >
      <PopupGruppe titel="Apps">
        {alle.map(n => (
          <PopupEintrag key={n} titel={n} onWaehlen={() => undefined} />
        ))}
      </PopupGruppe>
    </Popup>
  );
}

describe('Popup', () => {
  it('setzt den Fokus ins Suchfeld und schliesst mit Escape', async () => {
    const zu = vi.fn();
    render(<PopupBeispiel zu={zu} />);
    expect(screen.getByRole('searchbox')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(zu).toHaveBeenCalled();
  });

  it('filtert, zeigt den Leertext und geht mit den Pfeiltasten durch die Eintraege', async () => {
    render(<PopupBeispiel zu={() => undefined} />);
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Angebote' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Lager' })).toHaveFocus();
    await userEvent.type(screen.getByRole('searchbox'), 'xyz');
    expect(screen.getByText('Nichts gefunden.')).toBeInTheDocument();
  });

  it('rendert nichts, solange es zu ist', () => {
    render(<Popup offen={false} titel="Suche" onSchliessen={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Ebene', () => {
  it('schliesst das Blatt mit Escape, mit dem Kreuz und am Schleier', async () => {
    const zu = vi.fn();
    render(
      <Ebene offen titel="Angebot" onSchliessen={zu}>
        Inhalt
      </Ebene>
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    await userEvent.click(screen.getByRole('button', { name: 'Angebot schließen' }));
    expect(zu).toHaveBeenCalledTimes(3);
  });

  it('wischt das Blatt am Griff weg, wenn man weit genug zieht', () => {
    const zu = vi.fn();
    const { container } = render(
      <Ebene offen titel="Angebot" onSchliessen={zu}>
        x
      </Ebene>
    );
    const griff = container.querySelector('.ara-ebene__griff') as HTMLElement;
    fireEvent.pointerDown(griff, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(griff, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(griff, { clientY: 140, pointerId: 1 });
    expect(zu).not.toHaveBeenCalled();
    fireEvent.pointerDown(griff, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(griff, { clientY: 230, pointerId: 1 });
    fireEvent.pointerUp(griff, { clientY: 230, pointerId: 1 });
    expect(zu).toHaveBeenCalledTimes(1);
  });

  it('zeigt das Vollbild nur mit einem schwebenden X und ohne Schleier', () => {
    render(
      <Ebene offen art="vollbild" titel="Demo" onSchliessen={() => undefined}>
        App
      </Ebene>
    );
    expect(screen.getByRole('button', { name: 'Schließen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Demo schließen' })).toBeNull();
  });
});

const STUFEN = [
  { id: 'entwurf', titel: 'Entwurf' },
  { id: 'offen', titel: 'Offen' },
  { id: 'frei', titel: 'Freigabe', blass: true },
];
const KARTEN = [{ id: 'a1', stufe: 'entwurf', titel: 'Hallendach', nummer: 'A-101' }];

describe('Board', () => {
  it('zeigt jede Stufe mit Zaehler und leert sie mit einem Wort', () => {
    render(<Board stufen={STUFEN} karten={KARTEN} beiVerschieben={() => undefined} />);
    expect(screen.getByRole('region', { name: 'Entwurf' })).toHaveTextContent('1');
    expect(screen.getByRole('region', { name: 'Freigabe' })).toHaveAttribute('data-blass', 'true');
    expect(screen.getAllByText('Leer')).toHaveLength(2);
  });

  it('oeffnet eine Karte mit Klick', async () => {
    const auf = vi.fn();
    render(
      <Board stufen={STUFEN} karten={KARTEN} beiVerschieben={() => undefined} beiOeffnen={auf} />
    );
    await userEvent.click(screen.getByRole('button', { name: /Hallendach/ }));
    expect(auf).toHaveBeenCalledWith(KARTEN[0]);
  });

  it('verschiebt mit Alt und Pfeil auf die Nachbarstufe', () => {
    const weg = vi.fn();
    render(<Board stufen={STUFEN} karten={KARTEN} beiVerschieben={weg} />);
    const karte = screen.getByRole('button', { name: /Hallendach/ });
    fireEvent.keyDown(karte, { key: 'ArrowRight', altKey: true });
    expect(weg).toHaveBeenCalledWith(KARTEN[0], STUFEN[1]);
    fireEvent.keyDown(karte, { key: 'ArrowLeft', altKey: true });
    expect(weg).toHaveBeenCalledTimes(1);
  });

  it('zieht mit der Maus ueber Zeiger-Ereignisse auf eine andere Stufe', () => {
    const weg = vi.fn();
    const auf = vi.fn();
    render(<Board stufen={STUFEN} karten={KARTEN} beiVerschieben={weg} beiOeffnen={auf} />);
    const ziel = screen.getByRole('region', { name: 'Offen' });
    document.elementFromPoint = vi.fn(() => ziel);
    const karte = screen.getByRole('button', { name: /Hallendach/ });
    fireEvent.pointerDown(karte, { clientX: 10, clientY: 10, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerMove(karte, { clientX: 200, clientY: 20, pointerId: 1, pointerType: 'mouse' });
    fireEvent.pointerUp(karte, { clientX: 200, clientY: 20, pointerId: 1, pointerType: 'mouse' });
    expect(weg).toHaveBeenCalledWith(KARTEN[0], STUFEN[1]);
    fireEvent.click(karte);
    expect(auf).not.toHaveBeenCalled();
  });

  it('zieht mit dem Finger erst nach 400 Millisekunden', () => {
    vi.useFakeTimers();
    try {
      const weg = vi.fn();
      render(<Board stufen={STUFEN} karten={KARTEN} beiVerschieben={weg} />);
      const ziel = screen.getByRole('region', { name: 'Offen' });
      document.elementFromPoint = vi.fn(() => ziel);
      const karte = screen.getByRole('button', { name: /Hallendach/ });
      // Zu frueh bewegt: die Seite rollt, nichts wird gezogen.
      fireEvent.pointerDown(karte, {
        clientX: 10,
        clientY: 10,
        pointerId: 2,
        pointerType: 'touch',
      });
      fireEvent.pointerMove(karte, {
        clientX: 10,
        clientY: 60,
        pointerId: 2,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(karte, { clientX: 200, clientY: 60, pointerId: 2, pointerType: 'touch' });
      expect(weg).not.toHaveBeenCalled();
      // Gehalten: danach zieht es.
      fireEvent.pointerDown(karte, {
        clientX: 10,
        clientY: 10,
        pointerId: 3,
        pointerType: 'touch',
      });
      act(() => {
        vi.advanceTimersByTime(400);
      });
      fireEvent.pointerMove(karte, {
        clientX: 200,
        clientY: 20,
        pointerId: 3,
        pointerType: 'touch',
      });
      fireEvent.pointerUp(karte, { clientX: 200, clientY: 20, pointerId: 3, pointerType: 'touch' });
      expect(weg).toHaveBeenCalledWith(KARTEN[0], STUFEN[1]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Stufenleiste, Reiter, Segmente', () => {
  it('nennt die aktuelle Stufe und faerbt die erreichten', () => {
    render(<Stufenleiste stufen={['Entwurf', 'Offen', 'Frei']} aktuell={1} />);
    const punkte = screen.getAllByRole('listitem');
    expect(punkte.map(p => p.dataset.zustand)).toEqual(['erreicht', 'jetzt', 'offen']);
  });

  it('waehlt Reiter mit Klick und Pfeiltasten', async () => {
    const waehlen = vi.fn();
    render(
      <Reiter
        eintraege={[
          { id: 'daten', titel: 'Daten' },
          { id: 'anhaenge', titel: 'Anhänge', zahl: 2 },
        ]}
        aktiv="daten"
        onWaehlen={waehlen}
      />
    );
    expect(screen.getByRole('tab', { name: 'Daten' })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('tab', { name: /Anhänge/ }));
    expect(waehlen).toHaveBeenCalledWith('anhaenge');
    screen.getByRole('tab', { name: 'Daten' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(waehlen).toHaveBeenLastCalledWith('anhaenge');
  });

  it('wechselt im Segmentschalter und laeuft in der Reihe im Kreis', async () => {
    const waehlen = vi.fn();
    render(
      <Segmente
        beschriftung="Darstellung"
        wert="hell"
        onWaehlen={waehlen}
        eintraege={[
          { id: 'hell', titel: 'Hell' },
          { id: 'dunkel', titel: 'Dunkel' },
        ]}
      />
    );
    expect(screen.getByRole('radio', { name: 'Hell' })).toBeChecked();
    screen.getByRole('radio', { name: 'Hell' }).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(waehlen).toHaveBeenCalledWith('dunkel');
  });
});

describe('Wischzeile', () => {
  function messen(breite: number) {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => breite,
    });
  }

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error: zurueck auf das, was jsdom von Haus aus hat
    delete HTMLElement.prototype.offsetWidth;
  });

  it('gibt ab 40 Prozent nach rechts frei', () => {
    vi.useFakeTimers();
    messen(300);
    const frei = vi.fn();
    const ab = vi.fn();
    const { container } = render(
      <Wischzeile titel="Urlaub" beiFreigeben={frei} beiAblehnen={ab} />
    );
    const zeile = container.querySelector('.ara-wisch__zeile') as HTMLElement;
    fireEvent.pointerDown(zeile, { clientX: 0, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(zeile, { clientX: 130, clientY: 2, pointerId: 1 });
    fireEvent.pointerUp(zeile, { clientX: 130, clientY: 2, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(frei).toHaveBeenCalledTimes(1);
    expect(ab).not.toHaveBeenCalled();
  });

  it('lehnt nach links ab und federt unter der Schwelle zurueck', () => {
    vi.useFakeTimers();
    messen(300);
    const frei = vi.fn();
    const ab = vi.fn();
    const { container } = render(
      <Wischzeile titel="Urlaub" beiFreigeben={frei} beiAblehnen={ab} />
    );
    const zeile = container.querySelector('.ara-wisch__zeile') as HTMLElement;
    fireEvent.pointerDown(zeile, { clientX: 200, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(zeile, { clientX: 140, clientY: 0, pointerId: 1 });
    fireEvent.pointerUp(zeile, { clientX: 140, clientY: 0, pointerId: 1 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(ab).not.toHaveBeenCalled();
    expect(zeile.style.transform).toBe('translateX(0px)');
    fireEvent.pointerDown(zeile, { clientX: 250, clientY: 0, pointerId: 2 });
    fireEvent.pointerMove(zeile, { clientX: 100, clientY: 0, pointerId: 2 });
    fireEvent.pointerUp(zeile, { clientX: 100, clientY: 0, pointerId: 2 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(ab).toHaveBeenCalledTimes(1);
    expect(frei).not.toHaveBeenCalled();
  });

  it('laesst den Knopf in der Zeile freigeben', async () => {
    const frei = vi.fn();
    render(<Wischzeile titel="Urlaub" beiFreigeben={frei} beiAblehnen={() => undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Freigeben' }));
    expect(frei).toHaveBeenCalled();
  });
});

describe('Meldung mit Rueckgaengig', () => {
  afterEach(() => vi.useRealTimers());

  it('bietet Rueckgaengig an und ruft nach der Frist den Ablauf', () => {
    vi.useFakeTimers();
    const zurueck = vi.fn();
    const ablauf = vi.fn();
    render(
      <Meldung art="erfolg" beiRueckgaengig={zurueck} beiAblauf={ablauf}>
        Freigegeben
      </Meldung>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rückgängig' }));
    expect(zurueck).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(4900);
    });
    expect(ablauf).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(ablauf).toHaveBeenCalledTimes(1);
  });

  it('bleibt ohne Rueckgaengig, was sie war: ohne Knopf und ohne Frist', () => {
    vi.useFakeTimers();
    const ablauf = vi.fn();
    render(<Meldung beiAblauf={ablauf}>Hinweis</Meldung>);
    expect(screen.queryByRole('button')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(ablauf).not.toHaveBeenCalled();
  });
});
