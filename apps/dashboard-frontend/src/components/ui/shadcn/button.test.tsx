/**
 * Button primitive tests
 *
 * Regression lock for the `loading` prop + the `asChild` (Radix Slot) path.
 * The asChild cases guard against a Slot `React.Children.only` throw when the
 * spinner branch would otherwise leak a `false` sibling into the child array.
 */

import { render, screen } from '@testing-library/react';
import { Button } from './button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Klick mich</Button>);
    expect(screen.getByRole('button', { name: 'Klick mich' })).toBeInTheDocument();
  });

  it('loading disables the button, sets aria-busy and shows a spinner', () => {
    const { container } = render(<Button loading>Senden</Button>);
    const btn = screen.getByRole('button', { name: 'Senden' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('data-loading', 'true');
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('loading forces disabled even when disabled is not passed', () => {
    render(
      <Button loading disabled={false}>
        Anmelden
      </Button>
    );
    expect(screen.getByRole('button', { name: 'Anmelden' })).toBeDisabled();
  });

  it('is not disabled and has no spinner when idle', () => {
    const { container } = render(<Button>Bereit</Button>);
    const btn = screen.getByRole('button', { name: 'Bereit' });
    expect(btn).not.toBeDisabled();
    expect(btn).not.toHaveAttribute('aria-busy');
    expect(container.querySelector('.animate-spin')).not.toBeInTheDocument();
  });

  it('asChild renders a single-child link without throwing (Slot regression)', () => {
    render(
      <Button asChild>
        <a href="/foo">Öffnen</a>
      </Button>
    );
    const link = screen.getByRole('link', { name: 'Öffnen' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/foo');
  });

  it('asChild + loading still renders one child without throwing (no leaked spinner sibling)', () => {
    render(
      <Button asChild loading>
        <a href="/bar">Laden</a>
      </Button>
    );
    // Spinner is intentionally NOT injected in the asChild path (Slot needs one child).
    const link = screen.getByRole('link', { name: 'Laden' });
    expect(link).toBeInTheDocument();
  });
});
