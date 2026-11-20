import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MitAuszeichnung } from '../apps/Standard';

describe('MitAuszeichnung', () => {
  it('zeigt ein Stück in Backticks als Code, ohne die Zeichen', () => {
    const { container } = render(
      <p>
        <MitAuszeichnung text="Die App nennt in app.json unter `marken` keine Fassung." />
      </p>
    );
    expect(container.textContent).toBe('Die App nennt in app.json unter marken keine Fassung.');
    expect(container.querySelector('code')?.textContent).toBe('marken');
  });

  it('lässt einen Backtick ohne Partner stehen', () => {
    const { container } = render(
      <p>
        <MitAuszeichnung text="ein `halber Satz" />
      </p>
    );
    expect(container.textContent).toBe('ein `halber Satz');
    expect(container.querySelector('code')).toBeNull();
  });
});
