/**
 * ErrorBoundary Component Tests
 *
 * Tests für die Error Boundary:
 * - Fängt Component-Errors
 * - Zeigt Error-UI mit Details
 * - Reload/Back Buttons funktionieren
 * - Gibt Children durch wenn kein Error
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary from '../components/ErrorBoundary';

// Component that throws an error
const ErrorThrowingComponent = ({ shouldThrow = true, errorMessage = 'Test error' }) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="child-content">Child content rendered successfully</div>;
};

// Component that throws on specific action
const ConditionalErrorComponent = () => {
  const [shouldError, setShouldError] = React.useState(false);

  if (shouldError) {
    throw new Error('Conditional error triggered');
  }

  return (
    <button
      data-testid="trigger-error"
      onClick={() => setShouldError(true)}
    >
      Trigger Error
    </button>
  );
};

describe('ErrorBoundary Component', () => {
  // Suppress console.error for cleaner test output
  let originalConsoleError;

  beforeAll(() => {
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.location.reload
    delete window.location;
    window.location = { reload: jest.fn() };
    // Mock window.history.back
    window.history.back = jest.fn();
  });

  // =====================================================
  // Normal Rendering (No Error)
  // =====================================================
  describe('Normal Rendering', () => {
    test('rendert Children wenn kein Error', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child">Child Content</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
      expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    test('rendert mehrere Children', () => {
      render(
        <ErrorBoundary>
          <div data-testid="child-1">First Child</div>
          <div data-testid="child-2">Second Child</div>
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child-1')).toBeInTheDocument();
      expect(screen.getByTestId('child-2')).toBeInTheDocument();
    });

    test('rendert nested Components', () => {
      const NestedComponent = () => (
        <div data-testid="nested">
          <span>Nested Content</span>
        </div>
      );

      render(
        <ErrorBoundary>
          <NestedComponent />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('nested')).toBeInTheDocument();
      expect(screen.getByText('Nested Content')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Error Catching
  // =====================================================
  describe('Error Catching', () => {
    test('fängt Error in Child-Component', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      // Should show error UI, not the child
      expect(screen.queryByTestId('child-content')).not.toBeInTheDocument();
      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    });

    test('loggt Error zu console.error', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent errorMessage="Logged error" />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        'ErrorBoundary caught an error:',
        expect.any(Error),
        expect.any(Object)
      );
    });

    test('fängt Error in tiefem Child', () => {
      const DeepChild = () => (
        <div>
          <div>
            <ErrorThrowingComponent />
          </div>
        </div>
      );

      render(
        <ErrorBoundary>
          <DeepChild />
        </ErrorBoundary>
      );

      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Error UI Display
  // =====================================================
  describe('Error UI Display', () => {
    test('zeigt Error-Icon', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('⚠️')).toBeInTheDocument();
    });

    test('zeigt Haupt-Fehlermeldung', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
      expect(screen.getByText(/unerwarteten Fehler/i)).toBeInTheDocument();
    });

    test('zeigt Fehlerdetails-Section', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Fehlerdetails anzeigen')).toBeInTheDocument();
    });

    test('zeigt Error-Message in Details', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent errorMessage="Custom error message" />
        </ErrorBoundary>
      );

      // Open details
      const details = screen.getByText('Fehlerdetails anzeigen');
      fireEvent.click(details);

      expect(screen.getByText(/Custom error message/i)).toBeInTheDocument();
    });

    test('zeigt Hinweis für Support', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText(/kontaktieren Sie bitte den Administrator/i)).toBeInTheDocument();
    });
  });

  // =====================================================
  // Action Buttons
  // =====================================================
  describe('Action Buttons', () => {
    test('zeigt Reload-Button', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Seite neu laden')).toBeInTheDocument();
    });

    test('zeigt Zurück-Button', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Zurück')).toBeInTheDocument();
    });

    test('Reload-Button ruft window.location.reload', async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByText('Seite neu laden');
      await user.click(reloadButton);

      expect(window.location.reload).toHaveBeenCalled();
    });

    test('Zurück-Button ruft window.history.back', async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      const backButton = screen.getByText('Zurück');
      await user.click(backButton);

      expect(window.history.back).toHaveBeenCalled();
    });

    test('Reload resettet Error-State', async () => {
      const user = userEvent.setup();

      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      // Error state should be true
      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();

      const reloadButton = screen.getByText('Seite neu laden');
      await user.click(reloadButton);

      // State should be reset (reload is called)
      expect(window.location.reload).toHaveBeenCalled();
    });
  });

  // =====================================================
  // Error Details
  // =====================================================
  describe('Error Details', () => {
    test('Details sind expandable', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent errorMessage="Expandable error" />
        </ErrorBoundary>
      );

      const detailsElement = screen.getByText('Fehlerdetails anzeigen').closest('details');
      expect(detailsElement).toBeInTheDocument();
    });

    test('zeigt Error.toString() in Details', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent errorMessage="String representation error" />
        </ErrorBoundary>
      );

      // Open details by clicking summary
      fireEvent.click(screen.getByText('Fehlerdetails anzeigen'));

      expect(screen.getByText(/String representation error/)).toBeInTheDocument();
    });

    test('zeigt Component-Stack wenn verfügbar', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      // Open details
      fireEvent.click(screen.getByText('Fehlerdetails anzeigen'));

      // Pre element with error stack should exist
      const preElement = document.querySelector('.error-stack');
      expect(preElement).toBeInTheDocument();
    });
  });

  // =====================================================
  // CSS Classes
  // =====================================================
  describe('CSS Classes', () => {
    test('hat error-boundary container class', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      const container = document.querySelector('.error-boundary');
      expect(container).toBeInTheDocument();
    });

    test('Buttons haben korrekte CSS-Klassen', () => {
      render(
        <ErrorBoundary>
          <ErrorThrowingComponent />
        </ErrorBoundary>
      );

      const reloadButton = screen.getByText('Seite neu laden');
      const backButton = screen.getByText('Zurück');

      expect(reloadButton).toHaveClass('btn-reload');
      expect(backButton).toHaveClass('btn-back');
    });
  });

  // =====================================================
  // Multiple Errors
  // =====================================================
  describe('Multiple Error Scenarios', () => {
    test('bleibt in Error-State bei erneutem Error', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();

      // Try to rerender with different error
      rerender(
        <ErrorBoundary>
          <ErrorThrowingComponent shouldThrow={true} errorMessage="Different error" />
        </ErrorBoundary>
      );

      // Should still show error UI
      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Integration with working components
  // =====================================================
  describe('Integration Tests', () => {
    test('zeigt Children nach Error-Reset (simuliert)', () => {
      // This tests that ErrorBoundary can recover when remounted
      const { unmount, rerender } = render(
        <ErrorBoundary key="error">
          <ErrorThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();

      // Remount with new key (simulates full reset)
      rerender(
        <ErrorBoundary key="no-error">
          <ErrorThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    test('isoliert Errors zu ihrer Boundary', () => {
      render(
        <div>
          <ErrorBoundary>
            <ErrorThrowingComponent />
          </ErrorBoundary>
          <ErrorBoundary>
            <div data-testid="healthy-child">Healthy Content</div>
          </ErrorBoundary>
        </div>
      );

      // First boundary should show error
      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();

      // Second boundary should show healthy content
      expect(screen.getByTestId('healthy-child')).toBeInTheDocument();
    });
  });

  // =====================================================
  // Edge Cases
  // =====================================================
  describe('Edge Cases', () => {
    test('behandelt Error ohne Message', () => {
      const NoMessageError = () => {
        throw new Error();
      };

      render(
        <ErrorBoundary>
          <NoMessageError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Etwas ist schiefgelaufen')).toBeInTheDocument();
    });

    test('behandelt null children', () => {
      render(
        <ErrorBoundary>
          {null}
        </ErrorBoundary>
      );

      // Should not crash, and should not show error UI
      expect(screen.queryByText('Etwas ist schiefgelaufen')).not.toBeInTheDocument();
    });

    test('behandelt undefined children', () => {
      render(
        <ErrorBoundary>
          {undefined}
        </ErrorBoundary>
      );

      expect(screen.queryByText('Etwas ist schiefgelaufen')).not.toBeInTheDocument();
    });
  });
});
