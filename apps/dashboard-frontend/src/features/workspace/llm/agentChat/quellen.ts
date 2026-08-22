/**
 * Woher eine Antwort ihr Wissen hat (Plan 023 E8).
 *
 * Der leere Chat verspricht „Antworten kommen mit Quellen aus deinen
 * Dokumenten". Im Rundgang kam keine. Der Grund ist keine Nachlässigkeit,
 * sondern ein Pfadwechsel: `message.sources` füllt nur die alte RAG-Pipeline.
 * Im Agent-Modus, der heute der Normalfall ist, gibt es dort nichts, und die
 * Zusage steht ohne Deckung da.
 *
 * Die Auskunft liegt aber schon vor, nur woanders: in den Schritten des Laufs.
 * Jeder Aufruf von `rag_suche` oder `dateien_lesen` steht dort mit seinen
 * Parametern und seinem Ergebnis. Diese Datei liest sie zurück.
 *
 * Das ist bewusst DETERMINISTISCH und nicht dem Modell überlassen. Ein Modell
 * zu bitten, seine Quellen zu nennen, ist eine Bitte; eine Schrittliste ist ein
 * Protokoll. Und der Fall, um den es E8 eigentlich geht, ist ohnehin der, in
 * dem das Modell nichts zu nennen hat: „ohne passendes Dokument fehlt der
 * Hinweis, warum keine Quelle da ist."
 */
import type { AgentToolStep } from '@/contexts/ChatContext';

/** Werkzeuge, deren Ergebnis eine Quelle ist. */
const LESE_WERKZEUGE = new Set(['rag_suche', 'dateien_lesen', 'dateien']);
/** Werkzeuge, die suchen, ohne selbst Inhalt zu liefern. */
const SUCH_WERKZEUGE = new Set(['rag_suche', 'dateien_suchen']);

/**
 * Sagt das Ergebnis, dass nichts gefunden wurde?
 *
 * Die Sätze stammen aus den Werkzeugen selbst (`rag.js`, `suche.js`); sie hier
 * als Muster zu führen ist eine Kopplung, aber die ehrlichere: die Alternative
 * wäre, dem Modell zu glauben, wenn es sagt, es habe nichts gefunden.
 */
export function istLeerErgebnis(text: string | undefined): boolean {
  const t = String(text ?? '').toLowerCase();
  if (!t.trim()) {
    return false;
  }
  return (
    t.includes('nichts gefunden') ||
    t.includes('keine treffer') ||
    t.includes('nicht gefunden') ||
    t.includes('keine passenden') ||
    t.includes('keine datei')
  );
}

/** Der Suchbegriff eines Schritts, wie ihn ein Mensch lesen würde. */
function suchbegriff(step: AgentToolStep): string {
  const p = (step.params || {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return (
    s(p.frage) || s(p.query) || s(p.muster) || s(p.text) || s(p.suchbegriff) || s(p.dateiname) || ''
  );
}

/** Der Pfad, den ein Lese-Schritt betroffen hat. */
function gelesenerPfad(step: AgentToolStep): string {
  const p = (step.params || {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return s(p.pfad) || s(p.dateiname) || '';
}

/**
 * Die erste Fundstelle aus einem `rag_suche`-Ergebnis.
 *
 * Das Werkzeug schreibt `1. [Dateiname] Textausschnitt …`. Der Ausschnitt ist
 * die „Stelle", die die Abnahme verlangt; ohne ihn stünde nur ein Dateiname da,
 * und der Nutzer müsste die Datei öffnen, um zu sehen, worauf sich die Antwort
 * stützt.
 */
export function fundstelle(ergebnis: string | undefined): { datei: string; stelle: string } | null {
  const treffer = String(ergebnis ?? '').match(/\[([^\]]+)\]\s*([^\n]*)/);
  if (!treffer) {
    return null;
  }
  const stelle = (treffer[2] ?? '').trim();
  return { datei: (treffer[1] ?? '').trim(), stelle: stelle.slice(0, 200) };
}

export interface Quelle {
  /** Dateiname oder Pfad. */
  datei: string;
  /** Der Ausschnitt, auf den sich die Antwort stützt, wenn es einen gibt. */
  stelle?: string;
}

export interface Quellenlage {
  quellen: Quelle[];
  /** Suchen, die nichts gefunden haben, mit ihrem Begriff. */
  ohneTreffer: string[];
  /** Hat der Lauf überhaupt in Dokumenten gesucht oder gelesen? */
  gesucht: boolean;
}

/**
 * Liest die Quellenlage aus den Schritten eines Laufs.
 *
 * @param steps die Schritte der Antwort
 */
export function quellenAusSchritten(steps: AgentToolStep[] | undefined): Quellenlage {
  const quellen: Quelle[] = [];
  const ohneTreffer: string[] = [];
  const gesehen = new Set<string>();
  let gesucht = false;

  for (const step of steps ?? []) {
    if (step.status !== 'done') {
      continue;
    }
    const werkzeug = step.tool || '';
    const liest = LESE_WERKZEUGE.has(werkzeug);
    const sucht = SUCH_WERKZEUGE.has(werkzeug);
    if (!liest && !sucht) {
      continue;
    }
    gesucht = true;

    if (istLeerErgebnis(step.result)) {
      const begriff = suchbegriff(step);
      if (begriff && !ohneTreffer.includes(begriff)) {
        ohneTreffer.push(begriff);
      }
      continue;
    }

    // `dateien_lesen` mit aktion=write oder list ist keine Quelle: geschrieben
    // wird kein Wissen, und eine Ordnerliste ist keine Stelle.
    const aktion = String((step.params as Record<string, unknown>)?.aktion ?? '').toLowerCase();
    if (werkzeug !== 'rag_suche' && aktion && aktion !== 'read') {
      continue;
    }

    const ausErgebnis = werkzeug === 'rag_suche' ? fundstelle(step.result) : null;
    const datei = ausErgebnis?.datei || gelesenerPfad(step);
    if (!datei || gesehen.has(datei)) {
      continue;
    }
    gesehen.add(datei);
    quellen.push(ausErgebnis?.stelle ? { datei, stelle: ausErgebnis.stelle } : { datei });
  }

  return { quellen, ohneTreffer, gesucht };
}
