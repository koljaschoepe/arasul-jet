import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mascot } from './Mascot';

describe('Mascot', () => {
  it('rendert im Idle-Zustand mit passendem Label', () => {
    render(<Mascot />);
    const el = screen.getByTestId('chat-mascot');
    expect(el).toHaveAttribute('data-state', 'idle');
    expect(el).toHaveAttribute('aria-label', 'Arasul');
    // Zwei gestapelte Frames (idle + wink)
    expect(el.querySelectorAll('img')).toHaveLength(2);
  });

  it('spiegelt den Thinking-Zustand in data-state und Label', () => {
    render(<Mascot state="thinking" />);
    const el = screen.getByTestId('chat-mascot');
    expect(el).toHaveAttribute('data-state', 'thinking');
    expect(el).toHaveAttribute('aria-label', 'Arasul denkt nach');
  });

  it('übernimmt ein explizites Label', () => {
    render(<Mascot label="Assistent" />);
    expect(screen.getByTestId('chat-mascot')).toHaveAttribute('aria-label', 'Assistent');
  });
});
