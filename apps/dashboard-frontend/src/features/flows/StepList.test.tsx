/**
 * StepList-Tests (Plan 013, B7): der Editor der deterministischen Schritt-Kette.
 * Getestet wird das kontrollierte Verhalten — hinzufügen, Typ wechseln,
 * umsortieren, entfernen — über einen kleinen zustandshaltenden Wrapper.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import StepList from './StepList';
import { LEER_FORM, type FlowFormState } from './flowFormState';
import type { FlowToolInfo } from '@/types/flows';

const WERKZEUGE: FlowToolInfo[] = [
  { name: 'web_suche', verfuegbar: true },
  { name: 'subagent', verfuegbar: true },
];

function Harness({ initial }: { initial?: Partial<FlowFormState> }) {
  const [state, setState] = useState<FlowFormState>({
    ...LEER_FORM,
    rollen: [
      {
        name: 'sucher',
        werkzeuge: [],
        ergebnis: { felder: ['treffer'], max_zeichen: 2000 },
        prompt: 'p',
      },
    ],
    ...initial,
  });
  return <StepList value={state} onChange={setState} werkzeuge={WERKZEUGE} />;
}

describe('StepList', () => {
  it('zeigt den Hinweis, solange keine Schritte da sind', () => {
    render(<Harness />);
    expect(screen.getByText(/läuft der Flow modellgetrieben/i)).toBeInTheDocument();
    expect(screen.queryByTestId('schritt-row')).not.toBeInTheDocument();
  });

  it('fügt einen Schritt hinzu (Voreinstellung: Rolle)', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: /Schritt$/i }));
    const rows = screen.getAllByTestId('schritt-row');
    expect(rows).toHaveLength(1);
    // subagent-Voreinstellung → Rollen-Auswahl sichtbar, mit der deklarierten Rolle.
    expect(within(rows[0]!).getByLabelText(/Rolle von Schritt 1/i)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('option', { name: 'sucher' })).toBeInTheDocument();
  });

  it('wechselt auf Werkzeug und zeigt das Parameter-Feld', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          schritte: [
            { name: 's1', typ: 'subagent', rolle: 'sucher', auftrag: 'a', iterationen: 1 },
          ],
        }}
      />
    );
    await user.selectOptions(screen.getByLabelText(/Art von Schritt 1/i), 'werkzeug');
    expect(screen.getByLabelText(/Werkzeug von Schritt 1/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Parameter von Schritt 1/i)).toBeInTheDocument();
    // web_suche wählbar, subagent NICHT (kein direktes Werkzeug).
    const sel = screen.getByLabelText(/Werkzeug von Schritt 1/i);
    expect(within(sel).getByRole('option', { name: 'web_suche' })).toBeInTheDocument();
    expect(within(sel).queryByRole('option', { name: 'subagent' })).not.toBeInTheDocument();
  });

  it('sortiert Schritte um und entfernt sie', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          schritte: [
            { name: 'eins', typ: 'subagent', rolle: 'sucher', auftrag: 'a', iterationen: 1 },
            { name: 'zwei', typ: 'subagent', rolle: 'sucher', auftrag: 'b', iterationen: 1 },
          ],
        }}
      />
    );
    // Schritt 1 „nach unten" → Reihenfolge kippt.
    await user.click(screen.getByLabelText(/Schritt 1 nach unten/i));
    let rows = screen.getAllByTestId('schritt-row');
    expect(within(rows[0]!).getByLabelText(/Name von Schritt 1/i)).toHaveValue('zwei');

    // Ersten entfernen → nur noch „eins".
    await user.click(screen.getByLabelText(/Schritt 1 entfernen/i));
    rows = screen.getAllByTestId('schritt-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByLabelText(/Name von Schritt 1/i)).toHaveValue('eins');
  });
});
