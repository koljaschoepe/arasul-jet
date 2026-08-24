/**
 * PdfViewer — rendert eine PDF aus der Projektablage seitenweise (Plan 019 ·
 * Phase 3). Holt die Datei über den gestreamten Vorschau-Endpunkt
 * (`…/dateien/vorschau`, bis ~50 MB) und zeichnet jede Seite mit pdf.js auf ein
 * <canvas> — KEIN <iframe>/<object> (die CSP verbietet `frame-src blob:` /
 * `object-src`), KEIN CDN (Worker selbst gehostet über Vites `?worker`).
 *
 * Bis pdfjs-dist 4 stand hier `isEvalSupported: false`, weil die Edge-CSP kein
 * `unsafe-eval` erlaubt. Ab 6 gibt es die Option nicht mehr, und sie wird auch
 * nicht gebraucht: in `build/pdf.mjs` und `build/pdf.worker.mjs` steht weder
 * `eval(` noch `new Function` (am 24.08.2026 gezaehlt, je 0). Der eine Treffer,
 * den eine Textsuche im Worker findet, ist `new FunctionBasedShading` — ein
 * Klassenname.
 * Lazy geladen (pdf.js ist schwer). Das PDF wird EINMAL geparst (Document in
 * einer Ref); Zoom zeichnet nur neu, ohne erneutes Parsen.
 *
 * Nebenläufigkeit (Datei-/Zoom-Wechsel): ein Generations-Zähler (`genRef`)
 * macht jeden Lauf eindeutig. Lade- und Render-Effekt brechen ab, sobald eine
 * neue Generation startet — so schreibt kein veralteter Lauf in den Container
 * oder auf ein bereits zerstörtes Document, und laufende Downloads/Render-Tasks
 * werden echt abgebrochen.
 */
import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
// Vite bündelt den Worker als eigenes, gleich-originiges Asset (CSP: 'self').
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;
// Vorschau kann groß sein (bis 50 MB) — großzügigeres Zeitbudget als useApis
// 30-s-Default.
const LADE_TIMEOUT_MS = 120_000;

export default function PdfViewer({
  projectId,
  filePath,
  onDownload,
}: {
  projectId: string;
  filePath: string;
  onDownload?: () => void;
}) {
  const api = useApi();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  // Der Ladevorgang bleibt erreichbar, weil nur er ein destroy() hat.
  const ladeTaskRef = useRef<pdfjsLib.PDFDocumentLoadingTask | null>(null);
  // Jeder Lade-Lauf bekommt eine Generation; alles Ältere gilt als veraltet.
  const genRef = useRef(0);
  const [docGen, setDocGen] = useState(0);
  const [seiten, setSeiten] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState<'laedt' | 'bereit' | 'fehler'>('laedt');
  const [fehler, setFehler] = useState('');

  // 1) Datei laden UND einmal parsen (Document lebt in pdfRef bis Wechsel/Unmount).
  useEffect(() => {
    const myGen = ++genRef.current;
    const ac = new AbortController();
    // Alt-Document sofort freigeben — die neue Generation übernimmt.
    // Freigegeben wird über den Ladevorgang: `PDFDocumentProxy.destroy()` gibt
    // es ab pdfjs-dist 6 nicht mehr, nur noch `PDFDocumentLoadingTask.destroy()`
    // (und das zerstört das Document mit).
    void ladeTaskRef.current?.destroy();
    ladeTaskRef.current = null;
    pdfRef.current = null;
    setStatus('laedt');
    setSeiten(0);
    let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    (async () => {
      try {
        const res = await api.get<Response>(
          `/projects/${projectId}/dateien/vorschau?pfad=${encodeURIComponent(filePath)}`,
          {
            raw: true,
            showError: false,
            signal: AbortSignal.any([ac.signal, AbortSignal.timeout(LADE_TIMEOUT_MS)]),
          }
        );
        const buf = await res.arrayBuffer();
        if (genRef.current !== myGen) return;
        loadingTask = pdfjsLib.getDocument({ data: buf });
        const pdf = await loadingTask.promise;
        if (genRef.current !== myGen) {
          void loadingTask.destroy();
          return;
        }
        ladeTaskRef.current = loadingTask;
        pdfRef.current = pdf;
        setSeiten(pdf.numPages);
        setStatus('bereit');
        setDocGen(myGen); // triggert den Render-Effekt für genau diese Generation
      } catch (err) {
        if (genRef.current === myGen && (err as { name?: string })?.name !== 'AbortError') {
          setFehler((err as { message?: string })?.message ?? 'PDF konnte nicht geladen werden');
          setStatus('fehler');
        }
      }
    })();
    return () => {
      // Nächste Generation macht diesen Lauf ungültig; laufenden Download +
      // Ladevorgang abbrechen. (Das Document zerstört der nächste Lauf/Unmount.)
      ac.abort();
      void loadingTask?.destroy();
    };
  }, [api, projectId, filePath]);

  // Beim endgültigen Unmount das zuletzt geparste Document freigeben.
  useEffect(() => {
    return () => {
      void ladeTaskRef.current?.destroy();
      ladeTaskRef.current = null;
      pdfRef.current = null;
    };
  }, []);

  // 2) Rendern — sobald eine Generation bereit ist und bei Zoom-Änderung.
  //    Parst NICHT neu; bricht ab, sobald eine neue Generation startet.
  useEffect(() => {
    if (status !== 'bereit' || docGen === 0) return;
    const myGen = docGen;
    const pdf = pdfRef.current;
    const container = containerRef.current;
    if (!pdf || !container) return;
    const renderTasks: pdfjsLib.RenderTask[] = [];
    const veraltet = () => genRef.current !== myGen;
    (async () => {
      try {
        const ratio = window.devicePixelRatio || 1;
        const breite = container.clientWidth || 800;
        container.replaceChildren();
        for (let n = 1; n <= pdf.numPages; n++) {
          if (veraltet()) return;
          const page = await pdf.getPage(n);
          if (veraltet()) return;
          const roh = page.getViewport({ scale: 1 });
          const passScale = ((breite - 24) / roh.width) * zoom;
          const viewport = page.getViewport({ scale: passScale });
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          canvas.width = Math.floor(viewport.width * ratio);
          canvas.height = Math.floor(viewport.height * ratio);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          canvas.className = 'mx-auto mb-3 border border-border bg-white shadow-sm';
          if (veraltet()) return;
          container.appendChild(canvas);
          // v6 nimmt das Canvas selbst. `canvasContext` gibt es noch, aber nur
          // rueckwaertskompatibel und dann mit `canvas: null` — der empfohlene
          // Weg ist das Canvas.
          const task = page.render({
            canvas,
            viewport,
            transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          });
          renderTasks.push(task);
          await task.promise;
        }
      } catch (err) {
        // Abgebrochene Render-Tasks / veraltete Läufe still ignorieren.
        const name = (err as { name?: string })?.name;
        if (!veraltet() && name !== 'RenderingCancelledException') {
          setFehler((err as { message?: string })?.message ?? 'PDF konnte nicht gerendert werden');
          setStatus('fehler');
        }
      }
    })();
    return () => {
      for (const t of renderTasks) t.cancel();
    };
  }, [status, docGen, zoom]);

  const zoomBy = (delta: number) =>
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));

  if (status === 'fehler') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-sm">{fehler}</p>
        {onDownload && (
          <Button type="button" variant="secondary" onClick={onDownload}>
            <Download className="mr-2 size-4" aria-hidden="true" /> Herunterladen
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="pdf-viewer">
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => zoomBy(-ZOOM_STEP)}
          aria-label="Verkleinern"
        >
          <ZoomOut className="size-4" aria-hidden="true" />
        </Button>
        <span className="w-12 text-center text-ui-xs tabular-nums text-muted-foreground">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label="Vergrößern"
        >
          <ZoomIn className="size-4" aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setZoom(1)}
          aria-label="Breite anpassen"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Button>
        {seiten > 0 && (
          <span className="ml-2 text-ui-xs text-muted-foreground">
            {seiten} {seiten === 1 ? 'Seite' : 'Seiten'}
          </span>
        )}
      </div>
      {status === 'laedt' && <LoadingSpinner message="PDF wird geladen …" />}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto bg-muted/30 p-3"
        data-testid="pdf-viewer-pages"
      />
    </div>
  );
}
