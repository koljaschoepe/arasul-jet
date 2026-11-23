/**
 * Der Service Worker der Demo (J46, M7): die eine Schicht gespielter Antworten.
 *
 * Er steht zwischen dem echten Frontend und dem Netz und beantwortet jede
 * Anfrage an `/api/…` und an die Schnittstelle einer Beispiel-App selbst
 * (`antworten.ts`). Ein Service Worker und kein ausgetauschtes `fetch`, weil
 * er auch erreicht, was kein Skript abfängt: Bilder (`<img src="/api/…">`)
 * und die Apps im iframe, darunter die Werkstatt mit ihrem eigenen
 * `fetch`. Das Frontend weiß von all dem nichts.
 *
 * Nichts verlässt den Browser: der Zustand liegt in IndexedDB, und eine
 * Anfrage an `/api/…` geht nie ins Netz, auch keine unbekannte.
 *
 * Gebaut als IIFE von `bauen.mjs` (esbuild), nicht von Vite: ein Service
 * Worker als ES-Modul läuft nicht in jedem Browser.
 */
import { antworte } from './antworten';
import { anfangsZustand, type DemoZustand, type Sprache } from './daten';

interface Ereignis {
  request: Request;
  respondWith(antwort: Promise<Response>): void;
}
interface Nachricht {
  data: { typ?: string; sprache?: Sprache } | null;
  ports: readonly MessagePort[];
  waitUntil(p: Promise<unknown>): void;
}
interface Arbeiter {
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(
    typ: 'install' | 'activate',
    f: (e: { waitUntil(p: Promise<unknown>): void }) => void
  ): void;
  addEventListener(typ: 'fetch', f: (e: Ereignis) => void): void;
  addEventListener(typ: 'message', f: (e: Nachricht) => void): void;
  location: Location;
}
const sw = self as unknown as Arbeiter;

const DB = 'arasul-demo';
const ABLAGE = 'zustand';

function oeffnen(): Promise<IDBDatabase> {
  return new Promise((gut, schlecht) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(ABLAGE);
    r.onsuccess = () => gut(r.result);
    r.onerror = () => schlecht(r.error);
  });
}

async function lesen<T>(schluessel: string): Promise<T | undefined> {
  const db = await oeffnen();
  return new Promise((gut, schlecht) => {
    const r = db.transaction(ABLAGE).objectStore(ABLAGE).get(schluessel);
    r.onsuccess = () => gut(r.result as T | undefined);
    r.onerror = () => schlecht(r.error);
  });
}

async function schreiben(schluessel: string, wert: unknown): Promise<void> {
  const db = await oeffnen();
  return new Promise((gut, schlecht) => {
    const t = db.transaction(ABLAGE, 'readwrite');
    t.objectStore(ABLAGE).put(wert, schluessel);
    t.oncomplete = () => gut();
    t.onerror = () => schlecht(t.error);
  });
}

// Ein Zustand im Speicher, aus IndexedDB nachgeladen, wenn der Browser den
// Worker zwischendurch beendet hat. Jede Änderung geht sofort zurück.
let zustand: DemoZustand | null = null;
let sprache: Sprache = 'de';

async function holeZustand(): Promise<DemoZustand> {
  if (zustand) return zustand;
  const gelesen = await lesen<DemoZustand>('zustand');
  sprache = (await lesen<Sprache>('sprache')) ?? 'de';
  zustand = gelesen?.fassung === 4 ? gelesen : anfangsZustand();
  return zustand;
}

async function setzeZustand(neu: DemoZustand): Promise<void> {
  zustand = neu;
  await schreiben('zustand', neu);
}

async function beantworten(anfrage: Request): Promise<Response> {
  const url = new URL(anfrage.url);
  let koerper: unknown = null;
  if (anfrage.method !== 'GET' && anfrage.method !== 'HEAD') {
    const roh = await anfrage.text();
    try {
      koerper = roh ? JSON.parse(roh) : null;
    } catch {
      koerper = null;
    }
  }
  const vorher = await holeZustand();
  const [antwort, nachher] = antworte(
    { methode: anfrage.method, pfad: url.pathname, suche: url.searchParams, koerper },
    vorher,
    sprache
  );
  if (nachher !== vorher) await setzeZustand(nachher);
  const koepfe = { 'Cache-Control': 'no-store' };
  if (antwort.bytes) {
    return new Response(antwort.bytes, {
      status: antwort.status,
      headers: {
        ...koepfe,
        'Content-Type': antwort.typ ?? 'application/octet-stream',
        ...(antwort.dateiname
          ? {
              'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(antwort.dateiname)}`,
            }
          : {}),
      },
    });
  }
  return new Response(JSON.stringify(antwort.json ?? null), {
    status: antwort.status,
    headers: { ...koepfe, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

sw.addEventListener('install', e => e.waitUntil(sw.skipWaiting()));
sw.addEventListener('activate', e => e.waitUntil(sw.clients.claim()));

sw.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== sw.location.origin) return;
  if (
    url.pathname.startsWith('/api/') ||
    /^\/apps\/[a-z0-9-]+\/(test\/)?api\//.test(url.pathname)
  ) {
    e.respondWith(beantworten(e.request));
  }
});

/** Steuerung aus der Kapsel: Sprache, Zurücksetzen. Antwort über den Port. */
sw.addEventListener('message', e => {
  const n = e.data ?? {};
  const fertig = async () => {
    await holeZustand();
    if (n.typ === 'sprache' && (n.sprache === 'de' || n.sprache === 'en')) {
      sprache = n.sprache;
      await schreiben('sprache', n.sprache);
    } else if (n.typ === 'zuruecksetzen') {
      await setzeZustand(anfangsZustand());
    } else if (n.typ === 'uebernehmen') {
      // Nach einem harten Neuladen steuert der Worker die Seite nicht; er
      // nimmt sie hier ausdrücklich an.
      await sw.clients.claim();
    }
    e.ports[0]?.postMessage({ sprache });
  };
  e.waitUntil(fertig());
});
