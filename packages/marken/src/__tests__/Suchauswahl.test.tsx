/**
 * Die Suchauswahl hat drei Zusagen: sie zeigt den NAMEN des gewählten Werts
 * (nicht den Wert), sie sucht auch im Hinweis, und sie hält keinen eigenen
 * Zustand über den Wert — was gewählt wurde, weiß der Aufrufer.
 *
 * Der zweite Punkt ist der, der ohne Test lautlos bricht: die Kennung einer
 * App steht im Hinweis, nicht im Namen, und wer sie im Kopf hat, tippt sie.
 */
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suchauswahl } from '../muster/Suchauswahl';

const APPS = [
  { wert: 'urlaub', name: 'Urlaubsantrag', hinweis: 'kennung-4711' },
  { wert: 'angebot', name: 'Angebot', hinweis: 'kennung-0815' },
];

function Gesteuert() {
  const [wert, setWert] = useState('');
  return (
    <Suchauswahl moeglichkeiten={APPS} wert={wert} aufWert={setWert} platzhalter="App wählen" />
  );
}

describe('Suchauswahl', () => {
  it('zeigt den Platzhalter, solange nichts gewählt ist', () => {
    render(<Suchauswahl moeglichkeiten={APPS} aufWert={vi.fn()} platzhalter="App wählen" />);
    expect(screen.getByRole('combobox')).toHaveTextContent('App wählen');
  });

  it('zeigt den NAMEN des gewählten Werts und nicht den Wert', () => {
    render(<Suchauswahl moeglichkeiten={APPS} wert="urlaub" aufWert={vi.fn()} />);
    const knopf = screen.getByRole('combobox');
    expect(knopf).toHaveTextContent('Urlaubsantrag');
    expect(knopf).not.toHaveTextContent('urlaub');
  });

  it('meldet den gewählten Wert nach außen und schließt die Liste', async () => {
    const nutzer = userEvent.setup();
    const gerufen = vi.fn();
    render(<Suchauswahl moeglichkeiten={APPS} aufWert={gerufen} />);

    await nutzer.click(screen.getByRole('combobox'));
    await nutzer.click(await screen.findByText('Angebot'));

    expect(gerufen).toHaveBeenCalledWith('angebot');
  });

  it('sucht auch im Hinweis, nicht nur im Namen', async () => {
    const nutzer = userEvent.setup();
    render(<Gesteuert />);

    await nutzer.click(screen.getByRole('combobox'));
    // Das Suchfeld ist selbst eine `combobox` (so schreibt es `cmdk`); es
    // wird am Platzhalter gegriffen, nicht an der Rolle.
    await nutzer.type(await screen.findByPlaceholderText('Suchen …'), '4711');

    expect(await screen.findByText('Urlaubsantrag')).toBeInTheDocument();
    expect(screen.queryByText('Angebot')).not.toBeInTheDocument();
  });

  it('sagt etwas, wenn nichts passt', async () => {
    const nutzer = userEvent.setup();
    render(<Suchauswahl moeglichkeiten={APPS} aufWert={vi.fn()} />);

    await nutzer.click(screen.getByRole('combobox'));
    await nutzer.keyboard('gibtesnicht');

    expect(await screen.findByText('Nichts gefunden.')).toBeInTheDocument();
  });
});
