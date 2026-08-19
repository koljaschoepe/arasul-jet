/**
 * AblaufEditor — EIN Block für den Flow-Ablauf (Rollen inline, Modus umschaltbar).
 *
 * Prüft die Kernpunkte: modellgesteuert zeigt Bausteine (Rollen) inline; „Feste
 * Reihenfolge" bildet aus den Bausteinen Schritte; ein Rollen-Schritt spiegelt
 * 1:1 eine gleichnamige Rolle in rollen[] (kein separater Rollen-Block mehr).
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import AblaufEditor from './AblaufEditor';
import { LEER_FORM, toBody, type FlowFormState } from './flowFormState';

const WERKZEUGE = [
  { name: 'rag_suche' as const, verfuegbar: true },
  { name: 'web_lesen' as const, verfuegbar: true },
  { name: 'subagent' as const, verfuegbar: true },
];

function Harness({ initial }: { initial?: Partial<FlowFormState> }) {
  const [state, setState] = useState<FlowFormState>({ ...LEER_FORM, ...initial });
  return (
    <>
      <AblaufEditor value={state} onChange={setState} werkzeuge={WERKZEUGE} />
      <output data-testid="snapshot">
        {JSON.stringify({
          rollen: state.rollen,
          schritte: state.schritte,
          // Der API-Body, wie ihn Speichern/Vorschau schicken würden — so prüfen
          // die Tests direkt die Serialisierung ins Payload, nicht nur den Zustand.
          body: toBody(state),
        })}
      </output>
    </>
  );
}

const snap = () => JSON.parse(screen.getByTestId('snapshot').textContent || '{}');

describe('AblaufEditor', () => {
  it('modellgesteuert: zeigt vorhandene Rollen inline als Bausteine', () => {
    render(
      <Harness
        initial={{
          rollen: [
            {
              name: 'sucher',
              prompt: 'p',
              werkzeuge: ['web_lesen'],
              ergebnis: { felder: ['x'], max_zeichen: 500 },
            },
          ],
          schritte: [],
        }}
      />
    );
    const rows = screen.getAllByTestId('rolle-row');
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByLabelText(/Name von Baustein 1/i)).toHaveValue('sucher');
  });

  it('„Feste Reihenfolge" bildet aus den Bausteinen Schritte', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          rollen: [
            {
              name: 'sucher',
              prompt: 'p',
              werkzeuge: [],
              ergebnis: { felder: [], max_zeichen: 2000 },
            },
          ],
          schritte: [],
        }}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Feste Reihenfolge' }));
    const rows = screen.getAllByTestId('schritt-row');
    expect(rows).toHaveLength(1);
    // Der Schritt trägt den Rollennamen und referenziert dieselbe Rolle.
    const s = snap();
    expect(s.schritte[0].rolle).toBe('sucher');
  });

  it('Hoch/Runter ordnet die Schritte um, auch im serialisierten Payload', async () => {
    const user = userEvent.setup();
    const rolle = (name: string) => ({
      name,
      prompt: 'p',
      werkzeuge: [],
      ergebnis: { felder: ['x'], max_zeichen: 2000 },
    });
    render(
      <Harness
        initial={{
          werkzeuge: ['subagent'],
          rollen: [rolle('erster'), rolle('zweiter')],
          schritte: [
            { name: 'erster', typ: 'subagent', rolle: 'erster', auftrag: 'a', iterationen: 1 },
            { name: 'zweiter', typ: 'subagent', rolle: 'zweiter', auftrag: 'b', iterationen: 1 },
          ],
        }}
      />
    );

    await user.click(screen.getByLabelText('Schritt 2 nach oben'));
    const s = snap();
    expect(s.schritte.map((x: { name: string }) => x.name)).toEqual(['zweiter', 'erster']);
    // Der API-Body übernimmt die neue Reihenfolge 1:1.
    expect(s.body.schritte.map((x: { name: string }) => x.name)).toEqual(['zweiter', 'erster']);

    // Und zurück: der erste Schritt nach unten stellt die alte Ordnung wieder her.
    await user.click(screen.getByLabelText('Schritt 1 nach unten'));
    expect(snap().body.schritte.map((x: { name: string }) => x.name)).toEqual([
      'erster',
      'zweiter',
    ]);
  });

  it('neuer Schritt landet serialisiert im Payload (Name, Typ, Rolle)', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ schritte: [], rollen: [] }} />);
    await user.click(screen.getByRole('button', { name: 'Feste Reihenfolge' }));
    await user.click(screen.getByRole('button', { name: 'Schritt' }));

    const s = snap();
    expect(s.body.schritte).toHaveLength(1);
    expect(s.body.schritte[0]).toMatchObject({
      name: 'rolle_1',
      typ: 'subagent',
      rolle: 'rolle_1',
      iterationen: 1,
    });
    // Die gespiegelte Rolle steht ebenfalls im Payload.
    expect((s.body.rollen as { name: string }[]).some(r => r.name === 'rolle_1')).toBe(true);
  });

  it('„Wiederhole über" landet im Payload, sperrt Durchläufe und zwingt iterationen auf 1', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          rollen: [
            { name: 's', prompt: 'p', werkzeuge: [], ergebnis: { felder: [], max_zeichen: 2000 } },
          ],
          schritte: [{ name: 's', typ: 'subagent', rolle: 's', auftrag: 'a', iterationen: 3 }],
        }}
      />
    );
    await user.type(screen.getByLabelText('Wiederhole über von Schritt 1'), 'sektionen');

    const s = snap();
    expect(s.body.schritte[0].wiederhole_ueber).toBe('sektionen');
    // Backend lehnt wiederhole_ueber + iterationen > 1 ab → der Body erzwingt 1.
    expect(s.body.schritte[0].iterationen).toBe(1);
    expect(screen.getByLabelText('Durchläufe von Schritt 1')).toBeDisabled();
  });

  it('„Modell (optional)" wird nur gefüllt gesendet, und nur bei Subagent-Schritten', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          rollen: [
            { name: 's', prompt: 'p', werkzeuge: [], ergebnis: { felder: [], max_zeichen: 2000 } },
          ],
          schritte: [{ name: 's', typ: 'subagent', rolle: 's', auftrag: 'a', iterationen: 1 }],
        }}
      />
    );
    // Leer → kein modell-Feld im Payload.
    expect(snap().body.schritte[0].modell).toBeUndefined();

    await user.type(screen.getByLabelText('Modell von Schritt 1'), 'qwen3:32b');
    expect(snap().body.schritte[0].modell).toBe('qwen3:32b');
  });

  it('neuer Rollen-Schritt spiegelt 1:1 eine gleichnamige Rolle', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          schritte: [{ name: 's', typ: 'subagent', rolle: 's', auftrag: '', iterationen: 1 }],
          rollen: [
            { name: 's', prompt: '', werkzeuge: [], ergebnis: { felder: [], max_zeichen: 2000 } },
          ],
        }}
      />
    );
    // Startet im „fest"-Modus (es gibt einen Schritt). Einen weiteren hinzufügen.
    await user.click(screen.getByRole('button', { name: 'Schritt' }));
    const s = snap();
    expect(s.schritte).toHaveLength(2);
    // Jeder Rollen-Schritt hat eine gleichnamige Rolle in rollen[].
    for (const schritt of s.schritte) {
      if (schritt.typ === 'subagent') {
        expect(s.rollen.some((r: { name: string }) => r.name === schritt.rolle)).toBe(true);
      }
    }
  });
});
