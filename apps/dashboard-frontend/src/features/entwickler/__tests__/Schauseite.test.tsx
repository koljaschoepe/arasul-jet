/**
 * Die Schauseite rendert — und zwar vollständig.
 *
 * Der Fall, gegen den dieser Test steht: ein Primitiv wirft beim Rendern (ein
 * Radix-Provider fehlt, eine Prop heißt anders), und auf dem Bild der Abnahme
 * ist an seiner Stelle nichts. Ein leerer Fleck sieht auf einem Screenshot
 * aus wie Abstand. Hier fällt er auf, bevor jemand ein Bild ansieht.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Schauseite from '../Schauseite';

describe('Schauseite', () => {
  it('zeigt jedes Primitiv als eigenes Schaustueck', () => {
    const { container } = render(<Schauseite />);
    const namen = [...container.querySelectorAll('[data-schaustueck]')].map(el =>
      el.getAttribute('data-schaustueck')
    );
    expect(namen).toHaveLength(26);
    expect(new Set(namen).size).toBe(26);
    expect(namen).toContain('Button');
    expect(namen).toContain('Breadcrumb');
  });

  it('traegt genau einen Seitentitel', () => {
    render(<Schauseite />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
