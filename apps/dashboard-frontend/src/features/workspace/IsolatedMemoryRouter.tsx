import React from 'react';
import { MemoryRouter, UNSAFE_LocationContext } from 'react-router-dom';

/**
 * MemoryRouter, der innerhalb des äußeren BrowserRouters gemountet werden
 * darf: react-router verbietet verschachtelte Router ("You cannot render a
 * <Router> inside another <Router>"), geprüft über den LocationContext des
 * Parents. Der Provider setzt diesen Kontext für den Teilbaum zurück, damit
 * jeder Feature-Tab bzw. das KI-Panel seinen eigenen, isolierten Router
 * bekommt. Hooks im Teilbaum (useNavigate, useLocation, …) binden an den
 * inneren MemoryRouter.
 */
export function IsolatedMemoryRouter({
  initialEntries,
  children,
}: {
  initialEntries: string[];
  children: React.ReactNode;
}) {
  return (
    <UNSAFE_LocationContext.Provider value={null as never}>
      <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
    </UNSAFE_LocationContext.Provider>
  );
}
