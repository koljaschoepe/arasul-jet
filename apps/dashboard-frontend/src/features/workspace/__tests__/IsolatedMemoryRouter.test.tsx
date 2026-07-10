import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { IsolatedMemoryRouter } from '../IsolatedMemoryRouter';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="probe">{location.pathname}</span>;
}

describe('IsolatedMemoryRouter', () => {
  it('mountet innerhalb eines äußeren Routers ohne "Router inside Router"-Crash', () => {
    // Regression: In Produktion läuft die Workspace-Shell unter dem
    // BrowserRouter der App — ein nackter MemoryRouter wirft dort
    // "You cannot render a <Router> inside another <Router>".
    render(
      <MemoryRouter initialEntries={['/outer']}>
        <IsolatedMemoryRouter initialEntries={['/inner']}>
          <LocationProbe />
        </IsolatedMemoryRouter>
      </MemoryRouter>
    );
    expect(screen.getByTestId('probe')).toBeInTheDocument();
  });

  it('bindet Hooks im Teilbaum an den inneren Router, nicht den äußeren', () => {
    render(
      <MemoryRouter initialEntries={['/outer']}>
        <IsolatedMemoryRouter initialEntries={['/inner']}>
          <LocationProbe />
        </IsolatedMemoryRouter>
      </MemoryRouter>
    );
    expect(screen.getByTestId('probe').textContent).toBe('/inner');
  });

  it('innere Routes matchen auch, wenn der Teilbaum in einer gematchten Route sitzt', () => {
    // Regression: In der App sitzt die Shell unter <Route path="/workspace/*">.
    // Ohne RouteContext-Reset erbt ein inneres <Routes> die pathnameBase
    // "/workspace" und matcht "/chat" nicht mehr → Tab/KI-Panel bleiben leer.
    render(
      <MemoryRouter initialEntries={['/workspace']}>
        <Routes>
          <Route
            path="/workspace/*"
            element={
              <IsolatedMemoryRouter initialEntries={['/chat']}>
                <Routes>
                  <Route path="/chat/*" element={<span data-testid="inner-chat">CHAT</span>} />
                </Routes>
              </IsolatedMemoryRouter>
            }
          />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByTestId('inner-chat')).toBeInTheDocument();
  });
});
