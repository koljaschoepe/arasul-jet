/**
 * Der Eingang der Demo (J46, M7). Er tut drei Dinge und lädt dann das echte
 * Frontend, unverändert (`../src/index.tsx`):
 *
 *  1. den Service Worker anmelden, der statt des Backends antwortet
 *     (`dienst.ts`), und warten, bis er diese Seite steuert;
 *  2. das Band „Demo mit Beispieldaten" setzen (`band.ts`);
 *  3. bei Englisch die Übersetzung einschalten (`uebersetzung.ts`).
 *
 * Die Reihenfolge ist der Kern: ginge das Frontend vor dem Worker los, liefe
 * seine erste Anfrage (`/api/auth/session`) ins Netz.
 */
import { bandSetzen, spracheLesen, anDienst } from './band';
import { uebersetzen } from './uebersetzung';

async function dienstBereit(): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Dieser Browser kann die Demo nicht zeigen (kein Service Worker).');
  }
  await navigator.serviceWorker.register('/demo-dienst.js', { scope: '/' });
  const bereit = await navigator.serviceWorker.ready;
  if (navigator.serviceWorker.controller) return;
  // Erster Besuch oder hartes Neuladen: der Worker läuft, steuert die Seite
  // aber noch nicht. Er nimmt sie auf Zuruf an.
  await new Promise<void>(gut => {
    const uhr = setTimeout(gut, 3000);
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        clearTimeout(uhr);
        gut();
      },
      { once: true }
    );
    bereit.active?.postMessage({ typ: 'uebernehmen' });
  });
  if (!navigator.serviceWorker.controller) window.location.reload();
}

function fehlerZeigen(meldung: string): void {
  const knoten = document.getElementById('loading-msg');
  if (knoten) knoten.textContent = meldung;
}

dienstBereit()
  .then(async () => {
    const sprache = spracheLesen();
    await anDienst({ typ: 'sprache', sprache });
    document.documentElement.lang = sprache;
    bandSetzen(sprache);
    if (sprache === 'en') uebersetzen(document);
    // Die Startseite der Demo ist der Arbeitsbereich: eine Anmeldung gibt es nicht.
    if (window.location.pathname === '/') window.history.replaceState(null, '', '/workspace');
    await import('../src/index');
  })
  .catch((f: unknown) => fehlerZeigen(f instanceof Error ? f.message : String(f)));
