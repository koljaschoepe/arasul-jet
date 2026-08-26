/**
 * Alt-Routen nach dem Entfernen der Legacy-Shell (Plan 023 B1).
 *
 * Die Shell war nur über getippte URLs erreichbar und hatte genau einen
 * Menüeintrag. Ihre Routen zeigen jetzt in den Arbeitsbereich. Der Test hält
 * fest, was dabei schiefgehen kann: Suchparameter und Anker gehen verloren.
 * `/settings?tab=remote-access` ist der Deep-Link, mit dem der Fernzugriff
 * geöffnet wird (Risiko R15) — fällt der Parameter weg, landet man stumm im
 * ersten Bereich statt im gemeinten.
 */

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { InDenArbeitsbereich } from '../../App';
import NichtGefunden from '../../components/ui/NichtGefunden';

/** Zeigt an, wo die Weiterleitung tatsächlich gelandet ist. */
function Angekommen() {
  const ort = useLocation();
  return <span data-testid="ziel">{`${ort.pathname}${ort.search}${ort.hash}`}</span>;
}

function leiteUm(start: string, von: string, ziel: string) {
  render(
    <MemoryRouter initialEntries={[start]}>
      <Routes>
        <Route path={von} element={<InDenArbeitsbereich ziel={ziel} />} />
        <Route path="/workspace" element={<Angekommen />} />
        <Route path="/workspace/*" element={<Angekommen />} />
      </Routes>
    </MemoryRouter>
  );
  return screen.getByTestId('ziel').textContent;
}

describe('Alt-Routen zeigen in den Arbeitsbereich', () => {
  test.each([
    ['/settings', '/settings', '/settings', '/workspace/settings'],
    ['/store/modelle', '/store/*', '/store', '/workspace/store'],
  ])('%s landet auf %s', (start, von, ziel, erwartet) => {
    expect(leiteUm(start, von, ziel)).toBe(erwartet);
  });

  test('Suchparameter überleben, sonst bricht der Deep-Link zum Fernzugriff', () => {
    expect(leiteUm('/settings?tab=remote-access', '/settings', '/settings')).toBe(
      '/workspace/settings?tab=remote-access'
    );
  });

  test('Anker überlebt', () => {
    expect(leiteUm('/settings#unten', '/settings', '/settings')).toBe('/workspace/settings#unten');
  });
});

describe('Unbekannte Adresse', () => {
  test('zeigt den Weg zurück statt einer eigenen Seite', () => {
    render(
      <MemoryRouter>
        <NichtGefunden />
      </MemoryRouter>
    );
    expect(screen.getByText('Diese Adresse gibt es nicht.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Arbeitsbereich' })).toHaveAttribute(
      'href',
      '/workspace'
    );
  });
});
