/**
 * Ein Bildschirmfoto der App im Rahmen (J42, M7).
 *
 * WIE ES ENTSTEHT, UND WARUM SO. Die App läuft als iframe GLEICHER Herkunft
 * (`AppRahmen.tsx`, kein `sandbox`). Der Rahmen darf deshalb ihr Dokument
 * lesen und es selbst zeichnen: `modern-screenshot` klont das Dokument, legt
 * es in ein SVG mit `foreignObject` und lässt den Browser es auf eine
 * Leinwand malen. Das Bild ist also das, was der Browser selbst rendert, mit
 * allen Stilen der App, ohne eine Zeile Code in der App.
 *
 * Verworfen wurde die Browser-Schnittstelle `getDisplayMedia`: sie fragt bei
 * JEDEM Foto nach einer Freigabe des Bildschirms, und auf dem iPhone gibt es
 * sie nicht. Am 20.11.2026 am Orin gemessen (Belege, Chromium und WebKit):
 * 1440 px in 220 bis 550 ms, 390 px in 60 bis 100 ms, Bild deckungsgleich mit
 * dem Bildschirm.
 *
 * Gezeichnet wird, was im Rahmen SICHTBAR ist: Breite und Höhe des iframes,
 * verschoben um den Scrollstand des Dokuments. Was in einem eigenen
 * Rollbereich der App steht, kommt so, wie es dort gerade steht.
 *
 * Die Bibliothek wird erst beim ersten Foto geladen: sie ist nur für den
 * Augenblick des Meldens da und soll keinen Seitenaufbau verlangsamen.
 *
 * Scheitert es (fremde Herkunft, ein Bild der App, das der Browser nicht
 * hergibt, länger als `GRENZE_MS`), kommt `null` zurück: die Meldung geht
 * dann ohne Bild, und das Formular sagt es.
 */

/** Länger wartet niemand vor einem Formular. */
const GRENZE_MS = 8000;

/** Mehr als doppelte Auflösung braucht kein Entwickler, um die Stelle zu sehen. */
const HOECHSTENS_SKALA = 2;

export async function fotoVomRahmen(rahmen: HTMLIFrameElement | null): Promise<string | null> {
  if (!rahmen) return null;
  let dokument: Document | null = null;
  try {
    dokument = rahmen.contentDocument;
  } catch {
    return null;
  }
  const wurzel = dokument?.documentElement;
  const fenster = rahmen.contentWindow;
  if (!wurzel || !fenster) return null;

  const breite = rahmen.clientWidth;
  const hoehe = rahmen.clientHeight;
  if (breite === 0 || hoehe === 0) return null;

  const sx = fenster.scrollX || 0;
  const sy = fenster.scrollY || 0;
  const hintergrund = dokument?.body ? fenster.getComputedStyle(dokument.body).backgroundColor : '';

  const aufnahme = (async () => {
    const { domToPng } = await import('modern-screenshot');
    return domToPng(wurzel, {
      width: breite,
      height: hoehe,
      scale: Math.min(window.devicePixelRatio || 1, HOECHSTENS_SKALA),
      ...(hintergrund ? { backgroundColor: hintergrund } : {}),
      ...(sx || sy ? { style: { transform: `translate(${-sx}px, ${-sy}px)` } } : {}),
    });
  })();

  const zeit = new Promise<null>(fertig => setTimeout(() => fertig(null), GRENZE_MS));
  try {
    const bild = await Promise.race([aufnahme, zeit]);
    return typeof bild === 'string' && bild.startsWith('data:image/png;base64,') ? bild : null;
  } catch {
    return null;
  }
}

/** Eine markierte Stelle, in Anteilen von Breite und Höhe des Bildes (0 bis 1). */
export interface Markierung {
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

/**
 * Das Bild mit der Markierung als EIN PNG: so sieht der Entwickler die Stelle
 * auch dort, wo nur das Bild ankommt. Die Farbe und Stärke des Rahmens kommen
 * aus dem Element, das die Markierung auf dem Schirm zeigt (Token `--primary`),
 * nicht aus einem Wert im Code.
 */
export async function bildMitMarkierung(
  bild: string,
  markierung: Markierung | null,
  farbe: string
): Promise<string> {
  if (!markierung) return bild;
  const img = new Image();
  img.src = bild;
  await img.decode();
  const leinwand = document.createElement('canvas');
  leinwand.width = img.naturalWidth;
  leinwand.height = img.naturalHeight;
  const ctx = leinwand.getContext('2d');
  if (!ctx) return bild;
  ctx.drawImage(img, 0, 0);
  const staerke = Math.max(3, Math.round(leinwand.width / 300));
  ctx.strokeStyle = farbe;
  ctx.lineWidth = staerke;
  ctx.strokeRect(
    markierung.x * leinwand.width,
    markierung.y * leinwand.height,
    markierung.breite * leinwand.width,
    markierung.hoehe * leinwand.height
  );
  return leinwand.toDataURL('image/png');
}
