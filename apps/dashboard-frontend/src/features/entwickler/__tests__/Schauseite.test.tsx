/**
 * Die Schauseite rendert — und zwar vollständig.
 *
 * Der Fall, gegen den dieser Test steht: ein Primitiv wirft beim Rendern (ein
 * Radix-Provider fehlt, eine Prop heißt anders), und auf dem Bild der Abnahme
 * ist an seiner Stelle nichts. Ein leerer Fleck sieht auf einem Screenshot
 * aus wie Abstand. Hier fällt er auf, bevor jemand ein Bild ansieht.
 *
 * DIE ERWARTUNG STEHT NICHT ALS ZAHL HIER, SONDERN KOMMT AUS DEN DATEIEN
 * (Phase H4). Vorher stand „26" im Test; mit den zwanzig Primitiven und
 * sieben Mustern aus H4 wäre daraus eine Zahl geworden, die jemand von Hand
 * nachzieht — und die dann nicht mehr misst, ob ein Baustein fehlt, sondern
 * ob jemand die Zahl gepflegt hat. `import.meta.glob` liest die Ordner beim
 * Übersetzen, genau wie `bausteine.py` und `schauseite.mjs` sie lesen.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Schauseite from '../Schauseite';

/** Jede Datei in `primitive/` und `muster/` ist ein Schaustück. */
const DATEIEN = {
  ...import.meta.glob('../../../../../../packages/marken/src/primitive/*.tsx'),
  ...import.meta.glob('../../../../../../packages/marken/src/muster/*.tsx'),
};

const ERWARTET = Object.keys(DATEIEN)
  .map(pfad =>
    pfad
      .split('/')
      .pop()!
      .replace(/\.tsx$/, '')
  )
  .map(name =>
    name
      .split('-')
      .map(teil => teil[0]!.toUpperCase() + teil.slice(1))
      .join('')
      .toLowerCase()
  );

describe('Schauseite', () => {
  it('zeigt jeden Baustein der Bibliothek als eigenes Schaustueck', () => {
    const { container } = render(<Schauseite />);
    const namen = [...container.querySelectorAll('[data-schaustueck]')].map(el =>
      el.getAttribute('data-schaustueck')
    );

    expect(ERWARTET.length).toBeGreaterThan(0);
    expect(new Set(namen).size).toBe(namen.length);

    const gezeigt = new Set(namen.map(name => String(name).toLowerCase()));
    const fehlen = ERWARTET.filter(name => !gezeigt.has(name));
    expect(fehlen).toEqual([]);
  });

  it('traegt genau einen Seitentitel', () => {
    render(<Schauseite />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });
});
