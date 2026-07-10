import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
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
});
