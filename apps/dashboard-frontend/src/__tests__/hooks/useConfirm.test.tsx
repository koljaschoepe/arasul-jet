/**
 * `useConfirm` — die Frage, die eine Antwort verlangt.
 *
 * SEIT H5 OHNE MOCK. Der Test ersetzte bis dahin `ConfirmModal` durch eine
 * Attrappe aus vier `div`, „um den shadcn-Dialog nicht mitzuziehen". Er
 * prüfte damit den Hook gegen etwas, das es im Produkt nicht gibt: dass der
 * Dialog wirklich aufgeht, dass Escape ihn schließt, dass der Fokus auf dem
 * harmlosen der beiden Knöpfe liegt, sah er nie. Gefragt wird jetzt nach
 * Rollen (`alertdialog`, `button`), und das ist genau das, was ein Mensch
 * mit einem Screenreader vorfindet.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useConfirm from '../../hooks/useConfirm';

function ConfirmTestHarness({ onResult }: { onResult: (result: boolean) => void }) {
  const { confirm, ConfirmDialog } = useConfirm();

  return (
    <div>
      <button
        data-testid="trigger"
        onClick={async () => {
          const result = await confirm({
            title: 'Löschen?',
            message: 'Möchten Sie diesen Eintrag wirklich löschen?',
            confirmText: 'Ja, löschen',
            cancelText: 'Nein',
          });
          onResult(result);
        }}
      >
        Open Confirm
      </button>
      {ConfirmDialog}
    </div>
  );
}

describe('useConfirm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gibt eine Funktion und einen Dialog zurück', () => {
    const { result } = renderHook(() => useConfirm());

    expect(result.current.confirm).toBeInstanceOf(Function);
    // Ohne offene Frage gibt es nichts zu zeigen.
    expect(result.current.ConfirmDialog).toBeNull();
  });

  it('zeigt den Dialog, sobald gefragt wird', async () => {
    const user = userEvent.setup();
    render(<ConfirmTestHarness onResult={vi.fn()} />);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('trigger'));

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('Löschen?')).toBeInTheDocument();
    expect(screen.getByText('Möchten Sie diesen Eintrag wirklich löschen?')).toBeInTheDocument();
  });

  it('ist ein alertdialog und kein Dialog mit Kreuz', async () => {
    // Der Unterschied ist der Grund, warum `Bestaetigung` auf `AlertDialog`
    // steht: hier gibt es genau zwei Wege hinaus, und beide sind eine Antwort.
    const user = userEvent.setup();
    render(<ConfirmTestHarness onResult={vi.fn()} />);
    await user.click(screen.getByTestId('trigger'));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog.querySelector('[aria-label="Dialog schließen"]')).toBeNull();
  });

  it('löst mit true auf, wenn bestätigt wird', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<ConfirmTestHarness onResult={onResult} />);

    await user.click(screen.getByTestId('trigger'));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Ja, löschen' }));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(true);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('löst mit false auf, wenn abgebrochen wird', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();
    render(<ConfirmTestHarness onResult={onResult} />);

    await user.click(screen.getByTestId('trigger'));
    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: 'Nein' }));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(false);
    });
    await waitFor(() => {
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    });
  });

  it('nimmt eigene Beschriftungen an', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    function CustomHarness() {
      const { confirm, ConfirmDialog } = useConfirm();
      return (
        <div>
          <button
            data-testid="trigger-custom"
            onClick={async () => {
              const result = await confirm({
                title: 'Warnung!',
                message: 'Diese Aktion kann nicht rückgängig gemacht werden.',
                confirmText: 'Fortfahren',
                cancelText: 'Zurück',
                confirmVariant: 'warning',
              });
              onResult(result);
            }}
          >
            Trigger
          </button>
          {ConfirmDialog}
        </div>
      );
    }

    render(<CustomHarness />);
    await user.click(screen.getByTestId('trigger-custom'));

    expect(await screen.findByText('Warnung!')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Aktion kann nicht rückgängig gemacht werden.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fortfahren' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeInTheDocument();
  });
});
