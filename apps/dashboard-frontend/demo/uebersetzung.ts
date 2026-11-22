/**
 * Englisch für die Demo (J46, M7), ohne das Produkt anzufassen.
 *
 * Das Frontend ist deutsch und hat keine Sprachschicht; eine einzubauen wäre
 * genau das Verbiegen, das die Demo nicht darf. Stattdessen ersetzt diese
 * Datei sichtbare Sätze im fertigen DOM nach einem Wörterbuch
 * (`woerterbuch.ts`), in der Shell und in jeder App im Rahmen gleicher
 * Herkunft (Werkstatt). Was das Wörterbuch nicht kennt, bleibt
 * deutsch; der Weg der Demo ist vollständig erfasst, `woerterbuch.test.ts`
 * misst die Liste.
 *
 * Ein `MutationObserver` hält Schritt, wenn React einen Text neu schreibt:
 * er schreibt dann wieder Deutsch hinein, und der Beobachter übersetzt es
 * erneut. Englisch ist kein Schlüssel, also gibt es keine Schleife.
 */
import { MUSTER, WOERTER } from './woerterbuch';

const ATTRIBUTE = ['aria-label', 'title', 'placeholder', 'alt'] as const;
const AUSGENOMMEN = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);
const DATUM = /\b(\d{2})\.(\d{2})\.(\d{4})\b/g;

export function uebersetzeText(roh: string): string | null {
  const original = roh.trim();
  if (!original) return null;
  // Zahl und Wort hängen im Produkt oft mit einem geschützten Leerzeichen
  // zusammen (`anzahl()`); verglichen wird mit einem gewöhnlichen.
  // Ein Datum steht englisch als 21/11/2026, wie in den Beispiel-Apps (en-GB).
  const kern = original.replace(/\u00a0/g, ' ').replace(DATUM, '$1/$2/$3');
  const direkt = WOERTER[kern];
  if (direkt !== undefined) return roh.replace(original, direkt);
  for (const [muster, ersatz] of MUSTER) {
    if (muster.test(kern)) return roh.replace(original, kern.replace(muster, ersatz));
  }
  return kern !== original.replace(/\u00a0/g, ' ') ? roh.replace(original, kern) : null;
}

function ausgenommen(knoten: Node | null): boolean {
  for (let k: Node | null = knoten; k; k = k.parentNode) {
    if (k.nodeType !== 1) continue;
    const e = k as Element;
    if (AUSGENOMMEN.has(e.tagName) || e.hasAttribute('data-demo-nicht-uebersetzen')) return true;
  }
  return false;
}

function textKnoten(t: Text): void {
  if (ausgenommen(t.parentNode)) return;
  const neu = uebersetzeText(t.nodeValue ?? '');
  if (neu !== null && neu !== t.nodeValue) t.nodeValue = neu;
}

function element(e: Element): void {
  for (const a of ATTRIBUTE) {
    const wert = e.getAttribute(a);
    if (!wert) continue;
    const neu = uebersetzeText(wert);
    if (neu !== null && neu !== wert) e.setAttribute(a, neu);
  }
  if (e.tagName === 'IFRAME') rahmen(e as HTMLIFrameElement);
}

function baum(wurzel: Node): void {
  if (wurzel.nodeType === 3) {
    textKnoten(wurzel as Text);
    return;
  }
  if (wurzel.nodeType !== 1 && wurzel.nodeType !== 9 && wurzel.nodeType !== 11) return;
  if (wurzel.nodeType === 1) {
    if (ausgenommen(wurzel)) return;
    element(wurzel as Element);
  }
  const doc = wurzel.nodeType === 9 ? (wurzel as Document) : wurzel.ownerDocument;
  if (!doc) return;
  const gang = doc.createTreeWalker(wurzel, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let k = gang.nextNode(); k; k = gang.nextNode()) {
    if (k.nodeType === 3) textKnoten(k as Text);
    else element(k as Element);
  }
}

const beobachtet = new WeakSet<Document>();

/** Ein Dokument übersetzen und ihm folgen. */
export function uebersetzen(doc: Document): void {
  if (beobachtet.has(doc)) return;
  beobachtet.add(doc);
  doc.documentElement.lang = 'en';
  const titel = uebersetzeText(doc.title);
  if (titel) doc.title = titel;
  baum(doc);
  new MutationObserver(aenderungen => {
    for (const a of aenderungen) {
      if (a.type === 'characterData') textKnoten(a.target as Text);
      else if (a.type === 'attributes') element(a.target as Element);
      else a.addedNodes.forEach(baum);
    }
  }).observe(doc, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTE],
  });
}

/** Eine App im Rahmen: gleiche Herkunft, also dasselbe Wörterbuch. */
function rahmen(r: HTMLIFrameElement): void {
  const los = () => {
    try {
      const d = r.contentDocument;
      if (d?.documentElement && d.location.href !== 'about:blank') uebersetzen(d);
    } catch {
      /* fremde Herkunft: bleibt, wie sie ist */
    }
  };
  if (!r.dataset.demoBeobachtet) {
    r.dataset.demoBeobachtet = 'ja';
    r.addEventListener('load', los);
  }
  los();
}
