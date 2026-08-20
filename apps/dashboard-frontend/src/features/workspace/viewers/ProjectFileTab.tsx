/**
 * ProjectFileTab — eine Datei aus der Projektablage (echter Geräte-Ordner)
 * im CodeMirror-Editor. Gegenstück zum CodeViewer, aber gegen die Datei-API
 * der Ablage (`/projects/:id/dateien/inhalt`) statt gegen MinIO-Dokumente.
 *
 * Binärdateien und Übergrößen liefern kein `inhalt` — dann gibt es statt des
 * Editors einen Download-Hinweis.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytesBinaer } from '@/utils/formatting';
import { Check, ChevronRight, Code2, Download, Eye, GitCompare, Save, Undo2 } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/shadcn/button';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useReportTabDirty } from '@/hooks/useReportTabDirty';
import { lineDiff, diffZusammenfassung } from '@/utils/lineDiff';
import CodeMirrorEditor from './CodeMirrorEditor';
import { spracheLabel } from './codeLanguage';

/** Breadcrumb-Pfad über dem Editor (Plan 022): Ordnersegmente + Dateiname. */
function Breadcrumbs({ filePath }: { filePath: string }) {
  const teile = filePath.split('/').filter(Boolean);
  return (
    <nav
      className="flex min-w-0 items-center gap-0.5 overflow-hidden text-ui-xs text-muted-foreground"
      aria-label="Dateipfad"
      data-testid="breadcrumbs"
    >
      {teile.map((t, i) => {
        const letzte = i === teile.length - 1;
        return (
          <span key={i} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" aria-hidden="true" />}
            <span className={cn('truncate', letzte && 'font-medium text-foreground')}>{t}</span>
          </span>
        );
      })}
    </nav>
  );
}

// Der TipTap-WYSIWYG ist schwer — nur laden, wenn wirklich eine Markdown-Datei
// in der Vorschau geöffnet wird.
const ProjectMarkdownEditor = lazy(() => import('./ProjectMarkdownEditor'));
// PDF-/Bild-Viewer (Plan 019 · Phase 3) — pdf.js ist schwer, daher lazy; nur
// geladen, wenn wirklich eine PDF/ein Bild geöffnet wird.
const PdfViewer = lazy(() => import('./PdfViewer'));
const ImageViewer = lazy(() => import('./ImageViewer'));

/** Endungen, die als Bild inline gezeigt werden (CSP erlaubt img-src blob:). */
const BILD_ENDUNGEN = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif']);

/** Idle-Zeit (ms) nach der letzten Änderung, bevor Markdown automatisch gespeichert wird. */
const AUTOSAVE_DELAY_MS = 1200;
/** Wie lange der „Gespeichert ✓"-Hinweis sichtbar bleibt. */
const SAVED_FLASH_MS = 2500;

interface AblageInhalt {
  inhalt: string | null;
  groesse: number;
  binaer: boolean;
  zuGross: boolean;
}

// Roh-HTML-Blöcke, die der WYSIWYG (tiptap-markdown mit html:false) beim
// Serialisieren NICHT 1:1 erhält — z. B. agent-geschriebene .md mit
// eingebettetem <div>/<table>/<iframe>. Solche Dateien öffnen wir defensiv im
// Quelltext-Modus (Vorschau bleibt einen Klick entfernt), damit eine WYSIWYG-
// Bearbeitung das HTML nicht still verschluckt (Ein-Ordner-Modell: Platte ist
// Wahrheit). Autolinks (<https://…>, <a@b>) und reine Prosa lösen NICHT aus.
const ROH_HTML_RE =
  /<\/?(div|table|thead|tbody|tr|td|th|section|article|header|footer|nav|aside|form|iframe|script|style|details|summary|figure|figcaption|main|span|button|input|label|img|hr|br)\b/i;

function enthaeltRohesHtml(md: string): boolean {
  return ROH_HTML_RE.test(md);
}

/** Inline-Diff „vorher gegen jetzt" (Plan 022) — speist aus dem Snapshot-Stand. */
function DiffPanel({ vorher, jetzt }: { vorher: string; jetzt: string }) {
  const zeilen = useMemo(() => lineDiff(vorher, jetzt), [vorher, jetzt]);
  const { plus, minus } = useMemo(() => diffZusammenfassung(zeilen), [zeilen]);
  const sichtbar = zeilen.slice(0, 800);
  return (
    <div
      className="max-h-64 shrink-0 overflow-auto border-b border-border bg-card font-mono text-ui-xs"
      data-testid="diff-panel"
    >
      <div className="sticky top-0 border-b border-border bg-card px-3 py-1 text-muted-foreground">
        Vorher → Jetzt · <span className="text-primary">+{plus}</span> /{' '}
        <span className="text-destructive">−{minus}</span>
      </div>
      {sichtbar.map((z, i) => (
        <div
          key={i}
          className={cn(
            'whitespace-pre-wrap px-3 [overflow-wrap:anywhere]',
            z.art === 'plus' && 'bg-primary/10 text-primary',
            z.art === 'minus' && 'bg-destructive/10 text-destructive',
            z.art === 'gleich' && 'text-muted-foreground/70'
          )}
        >
          <span className="select-none opacity-60">
            {z.art === 'plus' ? '+ ' : z.art === 'minus' ? '− ' : '  '}
          </span>
          {z.text || ' '}
        </div>
      ))}
      {zeilen.length > 800 && (
        <div className="px-3 py-1 text-muted-foreground/60">
          … {zeilen.length - 800} weitere Zeilen ausgelassen
        </div>
      )}
    </div>
  );
}

export default function ProjectFileTab({
  projectId,
  filePath,
  tabId,
}: {
  projectId: string;
  filePath: string;
  tabId: string;
}) {
  const api = useApi();
  const toast = useToast();
  const updateTabTitle = useWorkspaceStore(s => s.updateTabTitle);
  const closeTab = useWorkspaceStore(s => s.closeTab);

  const [original, setOriginal] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState<AblageInhalt | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateiname = filePath.split('/').pop() ?? filePath;
  const endung = dateiname.includes('.') ? '.' + dateiname.split('.').pop() : '';
  // HTML aus der Ablage (z. B. vom Chat-Agent erzeugte Webseiten) öffnet
  // standardmäßig GERENDERT — wie eine kleine Webseite im Tab; der Quelltext
  // bleibt einen Klick entfernt.
  const istHtml = endung.toLowerCase() === '.html' || endung.toLowerCase() === '.htm';
  // Markdown öffnet als gerenderte, direkt bearbeitbare TipTap-Vorschau (Default);
  // ein Klick auf „Quelltext" zeigt das rohe Markdown in CodeMirror (Plan 016).
  const istMarkdown = endung.toLowerCase() === '.md' || endung.toLowerCase() === '.markdown';
  const hatVorschau = istHtml || istMarkdown;
  // PDF/Bild → eigener gestreamter Viewer (Plan 019 · Phase 3) statt Download-Karte.
  const istPdf = endung.toLowerCase() === '.pdf';
  const istBild = BILD_ENDUNGEN.has(endung.toLowerCase());
  const [ansicht, setAnsicht] = useState<'vorschau' | 'code'>('vorschau');

  // Tab-Titel = Dateiname (der Store kennt beim Öffnen nur den Pfad).
  useEffect(() => {
    updateTabTitle(tabId, dateiname);
  }, [tabId, dateiname, updateTabTitle]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<{ data: AblageInhalt }>(
        `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(filePath)}`,
        { showError: false }
      )
      .then(res => {
        if (cancelled) return;
        setMeta(res.data);
        setOriginal(res.data.inhalt);
        setDraft(res.data.inhalt ?? '');
        // Markdown mit Roh-HTML defensiv im Quelltext öffnen (siehe oben) —
        // der Nutzer kann jederzeit auf Vorschau umschalten.
        if (istMarkdown && res.data.inhalt && enthaeltRohesHtml(res.data.inhalt)) {
          setAnsicht('code');
        }
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        // F-03: Ein wiederhergestellter Tab kann auf eine inzwischen gelöschte
        // Datei (oder ein entferntes Projekt) zeigen (404). Dann den toten Tab
        // automatisch schließen statt einen Fehlerzustand zu zeigen. Bewusst
        // neutral formuliert, weil der 404 auch vom fehlenden Projekt kommen
        // kann. Andere Fehler (500, Timeout) behalten den Fehlerzustand.
        if (err?.status === 404) {
          toast.info(`„${dateiname}" ist nicht mehr verfügbar, Tab geschlossen.`);
          closeTab(tabId);
          return;
        }
        setError(err?.message ?? 'Datei konnte nicht geladen werden');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, filePath, api, istMarkdown, dateiname, tabId, closeTab, toast]);

  const dirty = original !== null && draft !== original;

  // Ungespeicherten Zustand an den Store melden — Tab-Punkt, Schließen-Warnung
  // und beforeunload-Guard hängen daran.
  useReportTabDirty(tabId, dirty);

  // Wurzel-Element: dient dem Strg+S-Handler UND als Sichtbarkeits-Prüfung —
  // seit Datei-Tabs keep-alive sind, sind mehrere Editoren gleichzeitig
  // gemountet; nur der sichtbare soll auf Fenster-Fokus neu laden.
  const wurzelRef = useRef<HTMLDivElement | null>(null);

  // Aktueller Zustand für die Fokus-Aktualisierung unten — der Listener soll
  // nicht bei jedem Tastendruck neu registriert werden.
  const zustandRef = useRef({ dirty, saving, loading, original });
  useEffect(() => {
    zustandRef.current = { dirty, saving, loading, original };
  }, [dirty, saving, loading, original]);

  // Externe Änderungen bemerken (z. B. der Chat-Agent schreibt dieselbe
  // Datei): beim Zurückkehren ins Fenster die Datei still neu laden — aber
  // NUR, wenn keine ungespeicherten Änderungen vorliegen. Kein Polling.
  useEffect(() => {
    let inFlight = false;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;
      // Versteckter Keep-Alive-Tab: nicht neu laden — sonst löst ein einziger
      // Fenster-Fokus einen GET je offenem Datei-Tab aus (Request-Stampede).
      if (wurzelRef.current?.closest('[hidden]')) return;
      const z = zustandRef.current;
      if (inFlight || z.dirty || z.saving || z.loading) return;
      inFlight = true;
      api
        .get<{ data: AblageInhalt }>(
          `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(filePath)}`,
          { showError: false }
        )
        .then(res => {
          const jetzt = zustandRef.current;
          // Nichts überschreiben, wenn der Nutzer inzwischen tippt oder sich
          // auf dem Server nichts geändert hat (erhält die Cursor-Position).
          if (jetzt.dirty || res.data.inhalt === jetzt.original) return;
          setMeta(res.data);
          setOriginal(res.data.inhalt);
          setDraft(res.data.inhalt ?? '');
        })
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [api, projectId, filePath]);

  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `silent`: Markdown-Autosave meldet sich nur dezent über „Gespeichert ✓"
  // (kein Toast pro 1,2 s Tippen); manuelles Speichern von Quelltext toastet.
  const save = async (silent = false) => {
    setSaving(true);
    try {
      await api.put(`/projects/${projectId}/dateien/inhalt`, { pfad: filePath, inhalt: draft });
      setOriginal(draft);
      if (silent) {
        setSavedFlash(true);
        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        savedFlashTimer.current = setTimeout(() => setSavedFlash(false), SAVED_FLASH_MS);
      } else {
        toast.success('Gespeichert');
      }
    } catch {
      /* Toast kommt aus useApi */
    } finally {
      setSaving(false);
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  // Undo/Diff (Plan 022): der Snapshot-Dienst sichert jeden Schreibschritt —
  // Agent wie Editor. Hier fragen wir Anzahl + Vorher-Stand ab und bieten
  // mehrstufiges „Rückgängig" plus einen Inline-Diff „vorher gegen jetzt".
  const [versionAnzahl, setVersionAnzahl] = useState(0);
  const [vorherInhalt, setVorherInhalt] = useState<string | null>(null);
  const [diffOffen, setDiffOffen] = useState(false);
  const [undoLaeuft, setUndoLaeuft] = useState(false);

  const ladeVersionen = useCallback(async () => {
    try {
      const res = await api.get<{ data: { anzahl: number; vorherInhalt: string | null } | null }>(
        `/projects/${projectId}/dateien/versionen?pfad=${encodeURIComponent(filePath)}`,
        { showError: false }
      );
      setVersionAnzahl(res.data?.anzahl ?? 0);
      setVorherInhalt(res.data?.vorherInhalt ?? null);
    } catch {
      setVersionAnzahl(0);
      setVorherInhalt(null);
    }
  }, [api, projectId, filePath]);

  // Beim Öffnen und nach jedem Speichern die Undo-Historie nachziehen.
  useEffect(() => {
    if (!loading) void ladeVersionen();
  }, [loading, ladeVersionen, original]);

  const undo = async () => {
    // Kein stiller Datenverlust: bei ungespeicherten Änderungen im Editor NICHT
    // rückgängig machen — der Server-Restore würde den Entwurf überschreiben.
    if (dirty || undoLaeuft) return;
    setUndoLaeuft(true);
    try {
      await api.post(`/projects/${projectId}/dateien/undo`, { pfad: filePath });
      const res = await api.get<{ data: AblageInhalt }>(
        `/projects/${projectId}/dateien/inhalt?pfad=${encodeURIComponent(filePath)}`,
        { showError: false }
      );
      setMeta(res.data);
      setOriginal(res.data.inhalt);
      setDraft(res.data.inhalt ?? '');
      await ladeVersionen();
      toast.success('Änderung rückgängig gemacht');
    } catch {
      /* Toast kommt aus useApi */
    } finally {
      setUndoLaeuft(false);
    }
  };

  // Dezenter Auto-Save für Markdown (Plan 016): nach kurzer Tipp-Pause still
  // speichern — kein großer Knopf. Nur bei echter Änderung; der Vorschau-Editor
  // meldet Änderungen ohnehin erst nach echter Nutzer-Eingabe.
  useEffect(() => {
    if (!istMarkdown || !dirty || saving || loading) return;
    const t = setTimeout(() => {
      void saveRef.current(true);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [istMarkdown, dirty, saving, loading, draft]);

  // Flash-Timer beim Unmount aufräumen.
  useEffect(() => {
    return () => {
      if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
    };
  }, []);

  // Strg+S/Cmd+S speichert — Editor-Grunderwartung; ohne den Handler frisst
  // der Browser den Shortcut für seinen "Seite speichern"-Dialog. Der Tab
  // selbst fängt den Shortcut (Capture), damit er auch im CodeMirror greift.
  useEffect(() => {
    const wurzel = wurzelRef.current;
    if (!wurzel) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        const z = zustandRef.current;
        if (z.dirty && !z.saving && !z.loading) {
          void saveRef.current();
        }
      }
    };
    wurzel.addEventListener('keydown', onKey, true);
    return () => wurzel.removeEventListener('keydown', onKey, true);
  }, [loading]);

  const download = async () => {
    try {
      const res = await api.get<Response>(
        `/projects/${projectId}/dateien/download?pfad=${encodeURIComponent(filePath)}`,
        { raw: true }
      );
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = dateiname;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Toast kommt aus useApi */
    }
  };

  if (loading) {
    return <LoadingSpinner message="Lade Datei …" />;
  }

  if (error) {
    // Typischer Fall: der Tab wurde restauriert, aber die Datei ist inzwischen
    // gelöscht/verschoben — dann ist Schließen die einzig sinnvolle Aktion.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-sm">{error}</p>
        <Button type="button" variant="secondary" onClick={() => closeTab(tabId)}>
          Tab schließen
        </Button>
      </div>
    );
  }

  // PDF und Bild bekommen IMMER den echten Viewer (Plan 019 · Phase 3) — nach
  // ENDUNG, nicht nach der Binär-Klassifizierung: eine SVG ist Text (kein
  // NUL-Byte) und käme sonst fälschlich in den Editor statt in den Bild-Viewer.
  if (istPdf || istBild) {
    return (
      <div ref={wurzelRef} className="flex h-full min-h-0 flex-col" data-testid="project-file-tab">
        <div className="flex h-ui-header shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <span className="min-w-0 truncate text-ui-xs font-medium text-muted-foreground">
            {filePath}
            {meta && (
              <span className="ml-2 text-muted-foreground/60">
                {formatBytesBinaer(meta.groesse)}
              </span>
            )}
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={download}
            aria-label="Herunterladen"
            title="Herunterladen"
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Suspense fallback={<LoadingSpinner message="Vorschau wird geladen …" />}>
            {istPdf ? (
              <PdfViewer projectId={projectId} filePath={filePath} onDownload={download} />
            ) : (
              <ImageViewer projectId={projectId} filePath={filePath} onDownload={download} />
            )}
          </Suspense>
        </div>
      </div>
    );
  }

  // Sonstige Binär-/Übergrößen-Dateien: Download-Karte.
  if (meta && meta.inhalt === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <p className="text-sm">
          {meta.binaer
            ? `„${dateiname}" ist eine Binärdatei (${formatBytesBinaer(meta.groesse)}).`
            : `„${dateiname}" ist zu groß für den Editor (${formatBytesBinaer(meta.groesse)}).`}
        </p>
        <Button type="button" variant="secondary" onClick={download}>
          <Download className="mr-2 size-4" aria-hidden="true" /> Herunterladen
        </Button>
      </div>
    );
  }

  return (
    <div ref={wurzelRef} className="flex h-full min-h-0 flex-col" data-testid="project-file-tab">
      {/* Kopfzeile — einheitlich mit dem CodeViewer: Label links, Aktionen rechts. */}
      <div className="flex h-ui-header shrink-0 items-center justify-between gap-2 border-b border-border px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Breadcrumbs filePath={filePath} />
          <span className="shrink-0 text-ui-xs text-muted-foreground/60">
            {spracheLabel(endung)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {hatVorschau && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setAnsicht(a => (a === 'vorschau' ? 'code' : 'vorschau'))}
              data-testid="ansicht-toggle"
            >
              {ansicht === 'vorschau' ? (
                <>
                  <Code2 className="mr-1.5 size-3.5" aria-hidden="true" /> Quelltext
                </>
              ) : (
                <>
                  <Eye className="mr-1.5 size-3.5" aria-hidden="true" /> Vorschau
                </>
              )}
            </Button>
          )}
          {istMarkdown ? (
            // Markdown speichert automatisch (dezent) — kein großer Knopf, nur
            // ein ruhiger Status.
            <span
              className="flex items-center gap-1 text-ui-xs text-muted-foreground"
              data-testid="project-file-status"
              aria-live="polite"
            >
              {saving ? (
                'Speichert …'
              ) : savedFlash ? (
                <>
                  <Check className="size-3.5 text-primary" aria-hidden="true" /> Gespeichert
                </>
              ) : dirty ? (
                'Nicht gespeichert'
              ) : (
                ''
              )}
            </span>
          ) : (
            <>
              {dirty && (
                <span className="text-ui-xs text-muted-foreground" data-testid="project-file-dirty">
                  Nicht gespeichert
                </span>
              )}
              <Button type="button" size="sm" onClick={() => save()} disabled={!dirty || saving}>
                <Save className="mr-1.5 size-3.5" aria-hidden="true" />
                {saving ? 'Speichert …' : 'Speichern'}
              </Button>
            </>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={download}
            aria-label="Herunterladen"
            title="Herunterladen"
          >
            <Download className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Diff-/Undo-Leiste (Plan 022): mehrstufiges Rückgängig + Inline-Diff,
          gespeist aus dem Snapshot-Dienst (Agent- wie Editor-Änderungen). */}
      {versionAnzahl > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-1 text-ui-xs"
          data-testid="undo-leiste"
        >
          <span className="text-muted-foreground">
            {versionAnzahl} Schritt{versionAnzahl === 1 ? '' : 'e'} rückgängig machbar
          </span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={undo}
            disabled={undoLaeuft || dirty}
            title={dirty ? 'Erst speichern oder Änderungen verwerfen' : undefined}
            data-testid="undo-button"
          >
            <Undo2 className="mr-1.5 size-3.5" aria-hidden="true" />
            {undoLaeuft ? 'Setzt zurück …' : 'Rückgängig'}
          </Button>
          {vorherInhalt != null && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setDiffOffen(o => !o)}
              data-testid="diff-toggle"
            >
              <GitCompare className="mr-1.5 size-3.5" aria-hidden="true" />
              {diffOffen ? 'Diff ausblenden' : 'Änderungen'}
            </Button>
          )}
        </div>
      )}
      {diffOffen && vorherInhalt != null && <DiffPanel vorher={vorherInhalt} jetzt={draft} />}

      <div className="min-h-0 flex-1 overflow-auto">
        {istHtml && ansicht === 'vorschau' ? (
          // Sandbox OHNE allow-same-origin: das gerenderte HTML darf Skripte
          // ausführen, kommt aber nicht an Cookies/API der Plattform heran.
          <iframe
            srcDoc={draft}
            sandbox="allow-scripts"
            title={`Vorschau von ${dateiname}`}
            className="h-full w-full border-0 bg-white"
            data-testid="html-vorschau"
          />
        ) : istMarkdown && ansicht === 'vorschau' ? (
          <Suspense fallback={<LoadingSpinner message="Editor wird geladen …" />}>
            <ProjectMarkdownEditor
              value={draft}
              onChange={setDraft}
              ariaLabel={`Inhalt von ${dateiname}`}
            />
          </Suspense>
        ) : (
          <CodeMirrorEditor
            value={draft}
            onChange={setDraft}
            fileExtension={endung}
            ariaLabel={`Inhalt von ${dateiname}`}
            testId="project-file-editor"
          />
        )}
      </div>
    </div>
  );
}
