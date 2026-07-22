/**
 * ArgumentHints Tests (Plan 011, Schritt 14).
 * Der graue Hinweis erscheint hinter dem Getippten und verschwindet, wenn leer.
 */
import { render, screen } from '@testing-library/react';
import ArgumentHints from './ArgumentHints';

describe('ArgumentHints', () => {
  test('zeigt den grauen Hinweis hinter dem gespiegelten Wert', () => {
    render(<ArgumentHints value="/recherche " ghost="<thema>" />);
    const overlay = screen.getByTestId('argument-hints');
    expect(overlay).toHaveTextContent('/recherche');
    expect(overlay).toHaveTextContent('<thema>');
    // Die Ebene fängt keine Klicks ab.
    expect(overlay.className).toContain('pointer-events-none');
  });

  test('rendert nichts ohne Hinweis', () => {
    render(<ArgumentHints value="/recherche foo" ghost="" />);
    expect(screen.queryByTestId('argument-hints')).not.toBeInTheDocument();
  });
});
