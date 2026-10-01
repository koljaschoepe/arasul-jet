/**
 * Die Freigabe (J36): Liste, Einzelansicht, Bestätigen, Ablehnen mit
 * Pflichtgrund, wer entschieden hat, Frist.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { Freigabe, type FreigabeEintrag } from '../muster/Freigabe';

const JETZT = Date.UTC(2026, 9, 2, 12, 0, 0);
const IN_EINER_STUNDE = new Date(JETZT + 60 * 60_000 + 30_000).toISOString();

const OFFEN: FreigabeEintrag = {
  id: 7,
  titel: 'Urlaub vom 5. bis 9. Oktober',
  zusammenhang: 'Anna möchte eine Woche frei nehmen.',
  herkunft: 'Urlaubsantrag',
  einreicher: 'anna',
  frist: IN_EINER_STUNDE,
  angefragtAm: new Date(JETZT - 3 * 60 * 60_000 - 60_000).toISOString(),
};

function zeige(eintraege: FreigabeEintrag[], over: Partial<Parameters<typeof Freigabe>[0]> = {}) {
  const beiBestaetigen = vi.fn();
  const beiAblehnen = vi.fn();
  render(
    <Freigabe
      eintraege={eintraege}
      beiBestaetigen={beiBestaetigen}
      beiAblehnen={beiAblehnen}
      jetzt={JETZT}
      {...over}
    />
  );
  return { beiBestaetigen, beiAblehnen };
}

describe('Freigabe', () => {
  it('zeigt Titel, Zusammenhang, Herkunft, Einreicher und Frist', () => {
    zeige([OFFEN]);
    expect(screen.getByText(OFFEN.titel)).toBeInTheDocument();
    expect(screen.getByText(/eine Woche frei/)).toBeInTheDocument();
    expect(screen.getByText('Urlaubsantrag')).toBeInTheDocument();
    expect(screen.getByText('eingereicht von anna')).toBeInTheDocument();
    expect(screen.getByTestId('freigabe-7-seit')).toHaveTextContent('wartet seit 3 Stunden');
    expect(screen.getByTestId('freigabe-7-frist')).toHaveTextContent('noch 1 Stunde');
  });

  it('sagt bei abgelaufener Frist, dass sie abgelaufen ist', () => {
    zeige([{ ...OFFEN, frist: new Date(JETZT - 1000).toISOString() }]);
    expect(screen.getByTestId('freigabe-7-frist')).toHaveTextContent('Frist abgelaufen');
  });

  it('bestätigt mit dem Eintrag', async () => {
    const { beiBestaetigen } = zeige([OFFEN]);
    fireEvent.click(screen.getByTestId('freigabe-7-bestaetigen'));
    await waitFor(() => expect(beiBestaetigen).toHaveBeenCalledWith(OFFEN));
  });

  it('verlangt für die Ablehnung einen Grund', async () => {
    const { beiAblehnen } = zeige([OFFEN]);
    fireEvent.click(screen.getByTestId('freigabe-7-ablehnen'));

    const absenden = screen.getByTestId('freigabe-7-ablehnen-absenden');
    expect(absenden).toBeDisabled();
    const feld = screen.getByTestId('freigabe-7-begruendung');
    fireEvent.change(feld, { target: { value: '   ' } });
    expect(absenden).toBeDisabled();

    fireEvent.change(feld, { target: { value: ' Zu knapp vor dem Termin ' } });
    expect(absenden).toBeEnabled();
    fireEvent.click(absenden);
    await waitFor(() => expect(beiAblehnen).toHaveBeenCalledWith(OFFEN, 'Zu knapp vor dem Termin'));
  });

  it('lässt das Feld offen und den Text stehen, wenn das Ablehnen scheitert', async () => {
    const beiAblehnen = vi.fn().mockRejectedValue(new Error('nein'));
    zeige([OFFEN], { beiAblehnen });
    fireEvent.click(screen.getByTestId('freigabe-7-ablehnen'));
    fireEvent.change(screen.getByTestId('freigabe-7-begruendung'), { target: { value: 'Grund' } });
    fireEvent.click(screen.getByTestId('freigabe-7-ablehnen-absenden'));
    await waitFor(() => expect(beiAblehnen).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('freigabe-7-ablehnen-absenden')).toBeEnabled());
    expect(screen.getByTestId('freigabe-7-begruendung')).toHaveValue('Grund');
  });

  it('sperrt nur die Karte, die gerade arbeitet', async () => {
    let fertig: () => void = () => {};
    const beiBestaetigen = vi.fn(() => new Promise<void>(r => (fertig = r)));
    zeige([OFFEN, { ...OFFEN, id: 8, titel: 'Zweite' }], { beiBestaetigen });
    fireEvent.click(screen.getByTestId('freigabe-7-bestaetigen'));
    await waitFor(() => expect(screen.getByTestId('freigabe-7-bestaetigen')).toBeDisabled());
    expect(screen.getByTestId('freigabe-8-bestaetigen')).toBeEnabled();
    fertig();
  });

  it('öffnet die Einzelansicht und kehrt zur Liste zurück', () => {
    zeige([OFFEN, { ...OFFEN, id: 8, titel: 'Zweite' }]);
    fireEvent.click(screen.getByTestId('freigabe-7-oeffnen'));
    expect(screen.getByTestId('freigabe-einzeln')).toBeInTheDocument();
    expect(screen.queryByText('Zweite')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('freigabe-zurueck'));
    expect(screen.getByTestId('freigabe-liste')).toBeInTheDocument();
    expect(screen.getByText('Zweite')).toBeInTheDocument();
  });

  it('folgt `gewaehlt` von außen und fällt auf die Liste zurück, wenn der Eintrag fehlt', () => {
    const beiWahl = vi.fn();
    zeige([OFFEN], { gewaehlt: 7, beiWahl });
    fireEvent.click(screen.getByTestId('freigabe-zurueck'));
    expect(beiWahl).toHaveBeenCalledWith(null);
  });

  it('nennt bei einer Entscheidung, wer sie getroffen hat, und den Grund', () => {
    zeige([
      {
        ...OFFEN,
        id: 1,
        status: 'abgelehnt',
        entschiedenVon: 'bernd',
        entschiedenAm: new Date(JETZT).toISOString(),
        begruendung: 'Zu knapp vor dem Termin',
      },
      { ...OFFEN, id: 2, status: 'bestaetigt', entschiedenVon: 'clara' },
    ]);
    expect(screen.getByTestId('freigabe-1-entscheidung')).toHaveTextContent(/Abgelehnt von bernd/);
    expect(screen.getByTestId('freigabe-1-entscheidung')).toHaveTextContent(
      'Grund: Zu knapp vor dem Termin'
    );
    expect(screen.getByTestId('freigabe-2-entscheidung')).toHaveTextContent(
      'Freigegeben von clara'
    );
    // Entschiedenes trägt keine Knöpfe mehr und keine Frist.
    expect(screen.queryByTestId('freigabe-1-bestaetigen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('freigabe-2-frist')).not.toBeInTheDocument();
  });

  it('zeigt ohne Einträge einen Leerzustand oder den mitgegebenen', () => {
    const { unmount } = render(
      <Freigabe eintraege={[]} beiBestaetigen={vi.fn()} beiAblehnen={vi.fn()} />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Nichts wartet auf eine Freigabe');
    unmount();
    render(
      <Freigabe
        eintraege={[]}
        beiBestaetigen={vi.fn()}
        beiAblehnen={vi.fn()}
        leer={<p>Alles erledigt.</p>}
      />
    );
    expect(screen.getByText('Alles erledigt.')).toBeInTheDocument();
  });
});
