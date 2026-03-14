import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import useConfirm from '../../hooks/useConfirm';

// Mock the ConfirmModal component to avoid pulling in the full shadcn dialog stack
vi.mock('../../components/ui/Modal', () => ({
  ConfirmModal: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText,
    cancelText,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    confirmVariant?: string;
  }) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <h2>{title}</h2>
        <p>{message}</p>
        <button onClick={onClose}>{cancelText}</button>
        <button onClick={onConfirm}>{confirmText}</button>
      </div>
    ) : null,
}));

// Helper component to render the hook's dialog in the DOM
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

  it('returns confirm function and ConfirmDialog', () => {
    const { result } = renderHook(() => useConfirm());

    expect(result.current.confirm).toBeInstanceOf(Function);
    // ConfirmDialog should be null when no dialog is open
    expect(result.current.ConfirmDialog).toBeNull();
  });

  it('shows dialog when confirm is called', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    render(<ConfirmTestHarness onResult={onResult} />);

    // Dialog should not be visible initially
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();

    // Click trigger to open dialog
    await user.click(screen.getByTestId('trigger'));

    // Dialog should now be visible with correct content
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();
    expect(screen.getByText('Löschen?')).toBeInTheDocument();
    expect(screen.getByText('Möchten Sie diesen Eintrag wirklich löschen?')).toBeInTheDocument();
  });

  it('resolves true when confirmed', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    render(<ConfirmTestHarness onResult={onResult} />);

    // Open dialog
    await user.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    // Click confirm button
    await user.click(screen.getByText('Ja, löschen'));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(true);
    });

    // Dialog should close after confirm
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('resolves false when cancelled', async () => {
    const user = userEvent.setup();
    const onResult = vi.fn();

    render(<ConfirmTestHarness onResult={onResult} />);

    // Open dialog
    await user.click(screen.getByTestId('trigger'));
    expect(screen.getByTestId('confirm-modal')).toBeInTheDocument();

    // Click cancel button
    await user.click(screen.getByText('Nein'));

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(false);
    });

    // Dialog should close after cancel
    expect(screen.queryByTestId('confirm-modal')).not.toBeInTheDocument();
  });

  it('supports custom title and message', async () => {
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

    expect(screen.getByText('Warnung!')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Aktion kann nicht rückgängig gemacht werden.')
    ).toBeInTheDocument();
    expect(screen.getByText('Fortfahren')).toBeInTheDocument();
    expect(screen.getByText('Zurück')).toBeInTheDocument();
  });
});
