/**
 * ImageViewer — zeigt ein Bild aus der Projektablage inline (Plan 019 · Phase 3).
 *
 * Holt die Datei über den gestreamten Vorschau-Endpunkt (`…/dateien/vorschau`,
 * bis ~50 MB) als Blob und rendert sie als <img> (CSP erlaubt `img-src blob:`).
 * Zoom über einfache +/- -Schalter; das Bild scrollt bei Übergröße im Container.
 */
import { useEffect, useState } from 'react';
import { Download, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';

const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const ZOOM_STEP = 0.25;

export default function ImageViewer({
  projectId,
  filePath,
  onDownload,
}: {
  projectId: string;
  filePath: string;
  onDownload?: () => void;
}) {
  const api = useApi();
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setUrl(null);
    setError(null);
    (async () => {
      try {
        const res = await api.get<Response>(
          `/projects/${projectId}/dateien/vorschau?pfad=${encodeURIComponent(filePath)}`,
          // Bis 50 MB — großzügigeres Zeitbudget als useApis 30-s-Default.
          { raw: true, showError: false, signal: AbortSignal.timeout(120_000) }
        );
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        if (!cancelled) {
          setError((err as { message?: string })?.message ?? 'Bild konnte nicht geladen werden');
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, projectId, filePath]);

  const zoomBy = (delta: number) =>
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((z + delta) * 100) / 100)));

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-sm">{error}</p>
        {onDownload && (
          <Button type="button" variant="secondary" onClick={onDownload}>
            <Download className="mr-2 size-4" aria-hidden="true" /> Herunterladen
          </Button>
        )}
      </div>
    );
  }

  if (!url) {
    return <LoadingSpinner message="Bild wird geladen …" />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="image-viewer">
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
          aria-label="Originalgröße"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-muted/30 p-4">
        <img
          src={url}
          alt={filePath.split('/').pop() ?? filePath}
          style={{ width: `${zoom * 100}%` }}
          className="mx-auto block h-auto max-w-none"
          data-testid="image-viewer-img"
        />
      </div>
    </div>
  );
}
