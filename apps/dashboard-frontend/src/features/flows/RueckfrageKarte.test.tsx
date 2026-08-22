/**
 * Plan 023 I3: die Rückfrage im laufenden Flow.
 *
 * Die Abnahme lautet: „Eine Rückfrage im laufenden Flow zeigt bis zu vier
 * Optionen und ein Freitextfeld, die Antwort fließt in den weiteren Lauf ein."
 *
 * Das Freitextfeld ist dabei nicht das Kleingedruckte, sondern der Grund,
 * warum die Optionen Vorschläge heißen dürfen. Es ist deshalb IMMER da, auch
 * wenn Optionen angeboten werden.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RueckfrageKarte } from './RueckfrageKarte';

function zeichne(optionen: string[] = ['Kurzfassung', 'Ausführlich'], onAntwort = vi.fn()) {
  render(
    <RueckfrageKarte
      frage="Wie ausführlich soll das Angebot werden?"
      optionen={optionen}
      onAntwort={onAntwort}
    />
  );
  return onAntwort;
}

describe('RueckfrageKarte (Plan 023 I3)', () => {
  it('zeigt die Frage und dass der Lauf wartet', () => {
    zeichne();
    expect(screen.getByText('Wie ausführlich soll das Angebot werden?')).toBeInTheDocument();
    // Ohne diesen Satz sieht ein stehengebliebener Fortschritt wie ein Fehler aus.
    expect(screen.getByText(/wartet auf deine Antwort/)).toBeInTheDocument();
  });

  it('kennzeichnet die erste Option als Empfehlung', () => {
    zeichne();
    expect(screen.getByTestId('flow-option-0')).toHaveTextContent('empfohlen');
    expect(screen.getByTestId('flow-option-1')).not.toHaveTextContent('empfohlen');
  });

  it('schickt die gewaehlte Option', async () => {
    const onAntwort = zeichne();
    fireEvent.click(screen.getByTestId('flow-option-1'));
    await waitFor(() => expect(onAntwort).toHaveBeenCalledWith('Ausführlich'));
  });

  it('hat IMMER ein Freitextfeld, auch neben Optionen', () => {
    zeichne();
    expect(screen.getByTestId('flow-antwort-frei')).toBeInTheDocument();
  });

  it('schickt eine freie Antwort', async () => {
    const onAntwort = zeichne();
    fireEvent.change(screen.getByTestId('flow-antwort-frei'), {
      target: { value: '  Zwei Seiten, mit Preisen  ' },
    });
    fireEvent.click(screen.getByTestId('flow-antwort-senden'));
    // Getrimmt: ein Leerzeichen am Ende ist keine andere Antwort.
    await waitFor(() => expect(onAntwort).toHaveBeenCalledWith('Zwei Seiten, mit Preisen'));
  });

  it('schickt keine leere Antwort', () => {
    const onAntwort = zeichne();
    expect(screen.getByTestId('flow-antwort-senden')).toBeDisabled();
    fireEvent.change(screen.getByTestId('flow-antwort-frei'), { target: { value: '   ' } });
    expect(screen.getByTestId('flow-antwort-senden')).toBeDisabled();
    expect(onAntwort).not.toHaveBeenCalled();
  });

  it('kommt ohne Optionen aus', () => {
    zeichne([]);
    expect(screen.queryByTestId('flow-option-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('flow-antwort-frei')).toBeInTheDocument();
  });

  it('zeigt einen Fehler, statt ihn zu verschlucken', async () => {
    const onAntwort = vi.fn().mockRejectedValue(new Error('Lauf ist schon vorbei'));
    zeichne(['a'], onAntwort);
    fireEvent.click(screen.getByTestId('flow-option-0'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Lauf ist schon vorbei');
  });

  it('laesst waehrend des Sendens nicht doppelt klicken', async () => {
    const halter: { aufloesen: (() => void) | null } = { aufloesen: null };
    const onAntwort = vi.fn(
      () =>
        new Promise<void>(r => {
          halter.aufloesen = r;
        })
    );
    zeichne(['a', 'b'], onAntwort);
    fireEvent.click(screen.getByTestId('flow-option-0'));
    await waitFor(() => expect(screen.getByTestId('flow-option-1')).toBeDisabled());
    fireEvent.click(screen.getByTestId('flow-option-1'));
    expect(onAntwort).toHaveBeenCalledTimes(1);
    halter.aufloesen?.();
  });
});
