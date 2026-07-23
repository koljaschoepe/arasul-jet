/**
 * MarkdownPreview — die Live-Vorschau im Skill-Editor mit ZWEI Ansichten
 * (Plan 011 Schritt 17 · Plan 012 Phase D Schritt 11).
 *
 *   • „Datei"          — welche Markdown-Datei aus den Eingaben entstünde. Das
 *                        Backend erzeugt und PRÜFT sie (`POST /skills/vorschau`),
 *                        genau wie `saveSkill` vor dem Schreiben; ein ungültiger
 *                        Zwischenstand zeigt dieselbe Fehlermeldung, die auch das
 *                        Speichern abwiese.
 *   • „Laufzeit-Prompt" — was der Runner dem Modell WIRKLICH gibt
 *                        (`POST /skills/vorschau-laufzeit`): der Prompt mit
 *                        eingesetzten Beispiel-Argumenten, plus die strukturell
 *                        daneben übergebenen Werkzeuge/Ordner/Rollen. Volle
 *                        Transparenz — das Herz des USP.
 *
 * Der Aufruf ist entprellt und rennt-sicher: beim Tippen (oder Ansicht-Wechsel)
 * gewinnt nur der jeweils letzte Aufruf.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { cn } from '@/lib/utils';

interface MarkdownPreviewProps {
  /** Der API-Body (aus skillForm.toBody) — die Eingaben in Roh-Form. */
  body: Record<string, unknown>;
}

type PreviewView = 'datei' | 'laufzeit';

interface RuntimePreview {
  systemPrompt: string;
  userInput: string;
  werkzeuge: string[];
  ordner: string[];
  rollen: { name: string; prompt: string }[];
  beispielWerte: Record<string, string>;
}

export default function MarkdownPreview({ body }: MarkdownPreviewProps) {
  const api = useApi();
  const [view, setView] = useState<PreviewView>('datei');
  const [datei, setDatei] = useState<string | null>(null);
  const [laufzeit, setLaufzeit] = useState<RuntimePreview | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  // Nur den letzten Aufruf gewinnen lassen (schnelles Tippen / Ansicht-Wechsel).
  const laufNr = useRef(0);

  // Auf den Body-Inhalt reagieren, nicht auf die Objekt-Identität: sonst löste
  // jeder Render (neues Objekt) einen Aufruf aus.
  const schluessel = JSON.stringify(body);

  useEffect(() => {
    const meine = ++laufNr.current;
    setLaedt(true);
    const timer = setTimeout(() => {
      const endpoint = view === 'datei' ? '/skills/vorschau' : '/skills/vorschau-laufzeit';
      api
        .post<{ data: { datei: string } | RuntimePreview }>(endpoint, body, { showError: false })
        .then(res => {
          if (meine !== laufNr.current) return; // ein neuerer Aufruf ist unterwegs
          if (view === 'datei') {
            setDatei((res.data as { datei: string }).datei);
          } else {
            setLaufzeit(res.data as RuntimePreview);
          }
          setFehler(null);
        })
        .catch((err: ApiError) => {
          if (meine !== laufNr.current) return;
          setDatei(null);
          setLaufzeit(null);
          setFehler(err.message || 'Die Eingaben sind noch nicht gültig.');
        })
        .finally(() => {
          if (meine === laufNr.current) setLaedt(false);
        });
    }, 350);
    return () => clearTimeout(timer);
    // Body-Inhalt UND Ansicht als Abhängigkeit — `api` ist stabil.
  }, [schluessel, view]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="markdown-preview">
      <div className="mb-1.5 flex items-center gap-2">
        <div
          className="flex items-center gap-1 rounded-md border border-border p-0.5"
          role="group"
          aria-label="Vorschau-Ansicht"
        >
          {(
            [
              { key: 'datei', label: 'Datei' },
              { key: 'laufzeit', label: 'Laufzeit-Prompt' },
            ] as const
          ).map(t => (
            <button
              key={t.key}
              type="button"
              data-testid={`preview-view-${t.key}`}
              aria-pressed={view === t.key}
              onClick={() => setView(t.key)}
              className={cn(
                'rounded px-2 py-0.5 text-ui-xs font-medium transition-colors',
                view === t.key
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        {laedt && <span className="text-ui-xs text-muted-foreground/50">· aktualisiert …</span>}
      </div>

      {fehler ? (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-ui-xs text-destructive"
          data-testid="preview-error"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">{fehler}</span>
        </div>
      ) : view === 'datei' ? (
        <pre
          className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
          data-testid="preview-datei"
        >
          {datei ?? ''}
        </pre>
      ) : (
        <RuntimeView preview={laufzeit} />
      )}
    </div>
  );
}

/**
 * Der aufgelöste Laufzeit-Prompt. Ehrlich getrennt: oben die System-Nachricht,
 * die das Modell WIRKLICH bekommt; darunter der strukturell daneben übergebene
 * Kontext (Werkzeuge/Ordner/Rollen), der NICHT im Prompt-Text steht.
 */
function RuntimeView({ preview }: { preview: RuntimePreview | null }) {
  return (
    <div
      className="min-h-0 flex-1 space-y-3 overflow-auto rounded-md border border-border bg-muted/40 p-3"
      data-testid="preview-laufzeit"
    >
      <Section label="System-Prompt ans Modell">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
          {preview?.systemPrompt ?? ''}
        </pre>
      </Section>
      <Section label="Nutzer-Eingabe (Beispiel)">
        <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground">
          {preview?.userInput ?? ''}
        </pre>
      </Section>
      <div className="rounded-md border border-border/60 bg-background/60 p-2 text-ui-xs text-muted-foreground">
        <p className="mb-1.5 font-medium text-foreground/80">
          Strukturell übergeben (nicht im Prompt-Text):
        </p>
        <p>
          <span className="text-foreground/70">Werkzeuge:</span>{' '}
          {preview?.werkzeuge.length ? preview.werkzeuge.join(', ') : '—'}
        </p>
        <p>
          <span className="text-foreground/70">Ordner:</span>{' '}
          {preview?.ordner.length ? preview.ordner.join(', ') : '—'}
        </p>
        <p>
          <span className="text-foreground/70">Rollen:</span>{' '}
          {preview?.rollen.length ? preview.rollen.map(r => r.name).join(', ') : '—'}
        </p>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-ui-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  );
}
