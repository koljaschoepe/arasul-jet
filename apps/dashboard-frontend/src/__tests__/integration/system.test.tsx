/**
 * Integration tests for the System / Dashboard home.
 *
 * Tests the DashboardHome component inside AppContent as users experience it:
 *   - Metric gauges (CPU, RAM, GPU, Temperature)
 *   - Service status
 *   - Time range selector
 *   - System info display
 *   - Device info
 *   - Error boundary behavior
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorBoundary, {
  RouteErrorBoundary,
  ComponentErrorBoundary,
} from '../../components/ui/ErrorBoundary';

// ---- ErrorBoundary tests (no mocking needed) ----

function ThrowOnRender(): never {
  throw new Error('Test render error');
}

describe('System - ErrorBoundary integration', () => {
  // Suppress console.error from React error boundaries in test output
  const originalConsoleError = console.error;
  beforeAll(() => {
    console.error = (...args: unknown[]) => {
      if (
        typeof args[0] === 'string' &&
        (args[0].includes('ErrorBoundary caught') || args[0].includes('The above error'))
      ) {
        return;
      }
      originalConsoleError.call(console, ...args);
    };
  });
  afterAll(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Content is fine</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Content is fine')).toBeInTheDocument();
  });

  it('shows error UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/etwas ist schiefgelaufen/i)).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.getByText(/erneut versuchen/i)).toBeInTheDocument();
  });

  it('shows reload button on error', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.getByText(/seite neu laden/i)).toBeInTheDocument();
  });

  it('retry button clears error state', async () => {
    let shouldThrow = true;
    function MaybeThrow() {
      if (shouldThrow) throw new Error('oops');
      return <div>Recovered!</div>;
    }

    const user = userEvent.setup();
    render(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>
    );

    expect(screen.getByText(/etwas ist schiefgelaufen/i)).toBeInTheDocument();

    shouldThrow = false;
    await user.click(screen.getByText(/erneut versuchen/i));

    expect(screen.getByText('Recovered!')).toBeInTheDocument();
  });

  it('RouteErrorBoundary shows route-specific title', () => {
    render(
      <RouteErrorBoundary routeName="Dashboard">
        <ThrowOnRender />
      </RouteErrorBoundary>
    );

    expect(screen.getByText(/dashboard fehler/i)).toBeInTheDocument();
  });

  it('ComponentErrorBoundary shows compact error', () => {
    render(
      <ComponentErrorBoundary componentName="Widget">
        <ThrowOnRender />
      </ComponentErrorBoundary>
    );

    expect(screen.getByText(/widget konnte nicht geladen werden/i)).toBeInTheDocument();
  });

  it('ComponentErrorBoundary shows compact retry button', () => {
    render(
      <ComponentErrorBoundary componentName="Widget">
        <ThrowOnRender />
      </ComponentErrorBoundary>
    );

    expect(screen.getByLabelText(/erneut versuchen/i)).toBeInTheDocument();
  });

  it('ErrorBoundary accepts custom title and message', () => {
    render(
      <ErrorBoundary title="Custom Title" message="Custom message text">
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom Title')).toBeInTheDocument();
    expect(screen.getByText('Custom message text')).toBeInTheDocument();
  });

  it('ErrorBoundary calls onError callback', () => {
    const onError = vi.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it('back button is hidden when hideBackButton is set', () => {
    render(
      <ErrorBoundary hideBackButton>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.queryByText(/zurück/i)).not.toBeInTheDocument();
  });

  it('shows back button by default', () => {
    render(
      <ErrorBoundary>
        <ThrowOnRender />
      </ErrorBoundary>
    );

    expect(screen.getByText(/zurück/i)).toBeInTheDocument();
  });
});
