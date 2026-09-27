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

  // Die Anmeldung zeigte am 27.09.2026 nur die obere Kante des Vogels: das
  // Bild kam als eigene Datei und lud nach dem ersten Malen nach. Beide Frames
  // stehen deshalb im Bündel (`?inline`); eine Adresse auf eine Datei hieße,
  // dass jemand das `?inline` verloren hat.
  it('bringt beide Frames im Bündel mit statt sie nachzuladen', () => {
    render(<Mascot />);
    const quellen = [...screen.getByTestId('chat-mascot').querySelectorAll('img')].map(i =>
      i.getAttribute('src')
    );
    expect(quellen).toHaveLength(2);
    for (const q of quellen) expect(q).toMatch(/^data:image\/png;base64,/);
  });
});
