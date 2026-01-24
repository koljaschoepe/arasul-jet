/**
 * ConfirmIconButton Component Tests
 *
 * Tests für ConfirmIconButton:
 * - Button rendering mit Icon
 * - Confirmation popup öffnet sich
 * - Confirm/Cancel Buttons funktionieren
 * - Click outside schließt popup
 * - Escape schließt popup
 * - Disabled/Loading states
 * - Verschiedene variants
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmIconButton from '../components/ConfirmIconButton';
import { FiTrash2 } from 'react-icons/fi';

describe('ConfirmIconButton Component', () => {
  const defaultProps = {
    icon: <FiTrash2 data-testid="trash-icon" />,
    label: 'Löschen',
    confirmText: 'Wirklich löschen?',
    onConfirm: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =====================================================
  // Initial Rendering
  // =====================================================
  describe('Initial Rendering', () => {
    test('rendert Icon-Button', () => {
      render(<ConfirmIconButton {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Löschen' })).toBeInTheDocument();
    });

    test('zeigt Icon im Button', () => {
      render(<ConfirmIconButton {...defaultProps} />);

      expect(screen.getByTestId('trash-icon')).toBeInTheDocument();
    });

    test('Button hat title/tooltip', () => {
      render(<ConfirmIconButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      expect(button).toHaveAttribute('title', 'Löschen');
    });

    test('zeigt nicht Confirm-Popup initial', () => {
      render(<ConfirmIconButton {...defaultProps} />);

      expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
    });

    test('hat wrapper-Klasse', () => {
      const { container } = render(<ConfirmIconButton {...defaultProps} />);

      expect(container.querySelector('.confirm-btn-wrapper')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Confirmation Flow
  // =====================================================
  describe('Confirmation Flow', () => {
    test('öffnet Confirm-Popup bei Click', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      await user.click(button);

      expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument();
    });

    test('zeigt Bestätigen-Button im Popup', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      expect(screen.getByRole('button', { name: 'Bestätigen' })).toBeInTheDocument();
    });

    test('zeigt Abbrechen-Button im Popup', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    });

    test('ruft onConfirm bei Bestätigung', async () => {
      const user = userEvent.setup();
      const onConfirm = jest.fn();
      const { container } = render(<ConfirmIconButton {...defaultProps} onConfirm={onConfirm} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      // Find confirm button by aria-label or class
      const confirmBtn = screen.queryByRole('button', { name: 'Bestätigen' }) ||
                         container.querySelector('.confirm-yes') ||
                         container.querySelector('[aria-label="Bestätigen"]');
      expect(confirmBtn).toBeInTheDocument();
      await user.click(confirmBtn);

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    test('schließt Popup nach Bestätigung', async () => {
      const user = userEvent.setup();
      const { container } = render(<ConfirmIconButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      const confirmBtn = screen.queryByRole('button', { name: 'Bestätigen' }) ||
                         container.querySelector('.confirm-yes');
      await user.click(confirmBtn);

      expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
    });

    test('schließt Popup bei Abbrechen ohne onConfirm', async () => {
      const user = userEvent.setup();
      const onConfirm = jest.fn();
      render(<ConfirmIconButton {...defaultProps} onConfirm={onConfirm} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));
      await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

      expect(onConfirm).not.toHaveBeenCalled();
      expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Dismiss Popup
  // =====================================================
  describe('Dismiss Popup', () => {
    test('schließt bei Escape-Taste', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Löschen' }));
      expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument();

      fireEvent.keyDown(document, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
      });
    });

    test('schließt bei Click außerhalb', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <ConfirmIconButton {...defaultProps} />
          <div data-testid="outside">Outside Element</div>
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Löschen' }));
      expect(screen.getByText('Wirklich löschen?')).toBeInTheDocument();

      fireEvent.mouseDown(screen.getByTestId('outside'));

      await waitFor(() => {
        expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
      });
    });
  });

  // =====================================================
  // Disabled State
  // =====================================================
  describe('Disabled State', () => {
    test('Button ist disabled wenn disabled=true', () => {
      render(<ConfirmIconButton {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      expect(button).toBeDisabled();
    });

    test('öffnet nicht Popup wenn disabled', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} disabled={true} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      await user.click(button);

      expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Loading State
  // =====================================================
  describe('Loading State', () => {
    test('Button ist disabled wenn loading=true', () => {
      render(<ConfirmIconButton {...defaultProps} loading={true} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      expect(button).toBeDisabled();
    });

    test('öffnet nicht Popup wenn loading', async () => {
      const user = userEvent.setup();
      render(<ConfirmIconButton {...defaultProps} loading={true} />);

      const button = screen.getByRole('button', { name: 'Löschen' });
      await user.click(button);

      expect(screen.queryByText('Wirklich löschen?')).not.toBeInTheDocument();
    });
  });

  // =====================================================
  // Variants
  // =====================================================
  describe('Variants', () => {
    test('hat danger variant standardmäßig', () => {
      const { container } = render(<ConfirmIconButton {...defaultProps} />);

      expect(container.querySelector('.btn-icon-danger')).toBeInTheDocument();
    });

    test('hat warning variant', () => {
      const { container } = render(
        <ConfirmIconButton {...defaultProps} variant="warning" />
      );

      expect(container.querySelector('.btn-icon-warning')).toBeInTheDocument();
    });

    test('hat primary variant', () => {
      const { container } = render(
        <ConfirmIconButton {...defaultProps} variant="primary" />
      );

      expect(container.querySelector('.btn-icon-primary')).toBeInTheDocument();
    });

    test('Popup hat variant-Klasse', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <ConfirmIconButton {...defaultProps} variant="warning" />
      );

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      expect(container.querySelector('.confirm-popup-warning')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Different Props
  // =====================================================
  describe('Different Props', () => {
    test('zeigt custom confirmText', async () => {
      const user = userEvent.setup();
      render(
        <ConfirmIconButton
          {...defaultProps}
          confirmText="Service stoppen?"
        />
      );

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      expect(screen.getByText('Service stoppen?')).toBeInTheDocument();
    });

    test('zeigt custom label im tooltip', () => {
      render(
        <ConfirmIconButton
          {...defaultProps}
          label="Service neustarten"
        />
      );

      const button = screen.getByRole('button', { name: 'Service neustarten' });
      expect(button).toHaveAttribute('title', 'Service neustarten');
    });
  });

  // =====================================================
  // Event Propagation
  // =====================================================
  describe('Event Propagation', () => {
    test('stoppt Event-Propagation bei Button-Click', async () => {
      const user = userEvent.setup();
      const outerClick = jest.fn();

      render(
        <div onClick={outerClick}>
          <ConfirmIconButton {...defaultProps} />
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      // Outer click should not be triggered
      expect(outerClick).not.toHaveBeenCalled();
    });

    test('stoppt Event-Propagation bei Bestätigung', async () => {
      const user = userEvent.setup();
      const outerClick = jest.fn();

      const { container } = render(
        <div onClick={outerClick}>
          <ConfirmIconButton {...defaultProps} />
        </div>
      );

      await user.click(screen.getByRole('button', { name: 'Löschen' }));

      const confirmBtn = screen.queryByRole('button', { name: 'Bestätigen' }) ||
                         container.querySelector('.confirm-yes');
      await user.click(confirmBtn);

      expect(outerClick).not.toHaveBeenCalled();
    });
  });
});
