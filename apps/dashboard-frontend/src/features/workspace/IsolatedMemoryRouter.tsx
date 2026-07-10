import React from 'react';
import {
  MemoryRouter,
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
} from 'react-router-dom';

/**
 * Default-Wert von react-routers RouteContext (siehe react-router-Quelle) —
 * setzt die Route-Verschachtelung des Parents für den Teilbaum zurück.
 */
const EMPTY_ROUTE_CONTEXT = { outlet: null, matches: [], isDataRoute: false };

/**
 * MemoryRouter, der innerhalb des äußeren BrowserRouters gemountet werden
 * darf. Zwei Fallstricke von react-router v7 werden neutralisiert:
 *
 * 1. LocationContext: verschachtelte Router werfen sonst "You cannot render
 *    a <Router> inside another <Router>" (Invariante prüft LocationContext).
 * 2. RouteContext: sitzt der Teilbaum in einer gematchten Route (z. B.
 *    /workspace/*), erbt ein inneres <Routes> sonst deren pathnameBase und
 *    matcht die Memory-Location (/chat, …) gegen /workspace → rendert null.
 *    Live sichtbar als leerer Tab/leeres KI-Panel trotz korrekter Location.
 *
 * DataRouterContext wird defensiv mit zurückgesetzt (falls die App je auf
 * RouterProvider umstellt). Hooks im Teilbaum binden an den inneren Router.
 */
export function IsolatedMemoryRouter({
  initialEntries,
  children,
}: {
  initialEntries: string[];
  children: React.ReactNode;
}) {
  return (
    <UNSAFE_DataRouterContext.Provider value={null}>
      <UNSAFE_DataRouterStateContext.Provider value={null}>
        <UNSAFE_RouteContext.Provider value={EMPTY_ROUTE_CONTEXT}>
          <UNSAFE_LocationContext.Provider value={null as never}>
            <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>
          </UNSAFE_LocationContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </UNSAFE_DataRouterStateContext.Provider>
    </UNSAFE_DataRouterContext.Provider>
  );
}
