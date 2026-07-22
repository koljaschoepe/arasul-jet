/**
 * MarkdownPreview — die Live-Vorschau der erzeugten Skill-Datei (Plan 011, Schritt 17).
 *
 * Rechts im Anlege-/Bearbeiten-Dialog: zeigt, welche Markdown-Datei aus den
 * aktuellen Eingaben entstünde. Die Datei erzeugt und PRÜFT das Backend
 * (`POST /api/skills/vorschau`) — genau das, was `saveSkill` vor dem Schreiben
 * tut. So sieht man dieselbe Fehlermeldung, die auch das Speichern abweisen
 * würde, noch bevor man speichert.
 *
 * Der Aufruf ist entprellt: Beim Tippen wird nicht jeder Tastendruck geschickt,
 * sondern erst nach einer kurzen Ruhe. Ein ungültiger Zwischenstand (noch kein
 * Name, leerer Prompt) liefert die Prüf-Meldung statt einer Datei.
 */
import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';

interface MarkdownPreviewProps {
  /** Der API-Body (aus skillForm.toBody) — die Eingaben in Roh-Form. */
  body: Record<string, unknown>;
}

export default function MarkdownPreview({ body }: MarkdownPreviewProps) {
  const api = useApi();
  const [datei, setDatei] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);
  // Nur den letzten Aufruf gewinnen lassen (schnelles Tippen).
  const laufNr = useRef(0);

  // Auf den Body-Inhalt reagieren, nicht auf die Objekt-Identität: sonst löste
  // jeder Render (neues Objekt) einen Aufruf aus.
  const schluessel = JSON.stringify(body);

  useEffect(() => {
    const meine = ++laufNr.current;
    setLaedt(true);
    const timer = setTimeout(() => {
      api
        .post<{ data: { datei: string } }>('/skills/vorschau', body, { showError: false })
        .then(res => {
          if (meine !== laufNr.current) return; // ein neuerer Aufruf ist unterwegs
          setDatei(res.data.datei);
          setFehler(null);
        })
        .catch((err: ApiError) => {
          if (meine !== laufNr.current) return;
          setDatei(null);
          setFehler(err.message || 'Die Eingaben sind noch nicht gültig.');
        })
        .finally(() => {
          if (meine === laufNr.current) setLaedt(false);
        });
    }, 350);
    return () => clearTimeout(timer);
    // Bewusst nur `schluessel` (der Body-Inhalt) als Abhängigkeit — `api` ist
    // stabil, und `body` als Objekt wechselte bei jedem Render die Identität.
  }, [schluessel]);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="markdown-preview">
      <div className="mb-1.5 flex items-center gap-2 text-ui-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Vorschau der Datei
        {laedt && <span className="text-muted-foreground/50">· aktualisiert …</span>}
      </div>
      {fehler ? (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-ui-xs text-destructive"
          data-testid="preview-error"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">{fehler}</span>
        </div>
      ) : (
        <pre
          className="min-h-0 flex-1 overflow-auto rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground"
          data-testid="preview-datei"
        >
          {datei ?? ''}
        </pre>
      )}
    </div>
  );
}
