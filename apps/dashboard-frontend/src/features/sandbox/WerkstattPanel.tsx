/**
 * WerkstattPanel (Plan 017 Schritt 7) — ersetzt WerkstattLeiste.
 *
 * Ein auf-/zuklappbares Panel über dem Terminal (nur in Erweiterungs-
 * Werkstätten). Es zeigt das Werkstatt-Inventar (Datenquelle: GET
 * /extensions/werkstatt/inventar) mit ruhigen Status-Punkten und pro Zeile die
 * Aktionen Live schalten / Zurücknehmen / Rollback / Öffnen / Herunterladen.
 * Kein Freitext-Ordnerfeld, kein Rocket/Hammer — Bausteine-Ikonografie.
 *
 * Live schalten öffnet bei deklarierten, noch nicht freigegebenen Fähigkeiten
 * den FreigabeDialog; App-Erweiterungen öffnen nach dem Live-Schalten direkt
 * als Tab.
 */
import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Blocks,
  Package,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Undo2,
  Power,
  PowerOff,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useExtensions, type WerkstattInventarEintrag } from '@/hooks/useExtensions';
import { type ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import FreigabeDialog, { type FreigabeAnfrage } from './FreigabeDialog';
import type { SandboxProject } from './types';

/** Ruhiger Status-Punkt statt Rocket/Hammer. */
function StatusPunkt({ status }: { status: WerkstattInventarEintrag['status'] }) {
  const map: Record<WerkstattInventarEintrag['status'], { cls: string; label: string }> = {
    live: { cls: 'bg-success', label: 'live' },
    registriert: { cls: 'bg-muted-foreground', label: 'bereit' },
    erkannt: { cls: 'bg-muted-foreground/50', label: 'erkannt' },
    abgelehnt: { cls: 'bg-warning', label: 'abgelehnt' },
  };
  const s = map[status];
  return (
    <span className="flex items-center gap-1.5 text-ui-xs text-text-secondary">
      <span className={`inline-block size-2 rounded-full ${s.cls}`} aria-hidden />
      {s.label}
    </span>
  );
}

export default function WerkstattPanel({ projekt }: { projekt: SandboxProject }) {
  const toast = useToast();
  const { setExtensionEnabled, rollbackExtension, loadInventar, downloadUrl } = useExtensions();
  const openTab = useWorkspaceStore(s => s.openTab);

  const [offen, setOffen] = useState(true);
  // Busy pro Erweiterung (nicht global) — sonst überschreibt eine Aktion in
  // Zeile B den Lade-/Sperrzustand von Zeile A (Doppel-Submit-Fenster).
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [freigabe, setFreigabe] = useState<FreigabeAnfrage | null>(null);
  const markBusy = useCallback((id: string, on: boolean) => {
    setBusyIds(prev => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const { data: eintraege = [], refetch } = useQuery({
    queryKey: ['werkstatt-inventar', projekt.slug],
    queryFn: () => loadInventar(projekt.slug),
    refetchInterval: 15000,
  });

  const abgelehnt = eintraege.filter(e => e.status === 'abgelehnt');
  const erweiterungen = eintraege.filter(e => e.status !== 'abgelehnt');

  const oeffnenWennApp = useCallback(
    (e: WerkstattInventarEintrag) => {
      if (e.type === 'app' && e.extId) {
        openTab({ type: 'extension', extensionId: e.extId, title: e.name || e.extId });
      }
    },
    [openTab]
  );

  const liveSchalten = useCallback(
    async (e: WerkstattInventarEintrag, freigeben = false) => {
      if (!e.extId) return;
      markBusy(e.extId, true);
      try {
        await setExtensionEnabled(e.extId, true, freigeben);
        toast.success(`„${e.name || e.extId}" ist live`);
        setFreigabe(null);
        oeffnenWennApp(e);
        await refetch();
      } catch (err) {
        const apiErr = err as ApiError;
        const details = apiErr.details as
          | { freigabe_erforderlich?: boolean; faehigkeiten?: string[] }
          | undefined;
        if (apiErr.status === 400 && details?.freigabe_erforderlich) {
          // Fähigkeiten müssen bestätigt werden → Dialog öffnen.
          setFreigabe({
            extId: e.extId,
            name: e.name || e.extId,
            faehigkeiten: details.faehigkeiten || [],
          });
        } else {
          toast.error(apiErr.message || 'Live schalten fehlgeschlagen');
        }
      } finally {
        markBusy(e.extId, false);
      }
    },
    [setExtensionEnabled, toast, oeffnenWennApp, refetch, markBusy]
  );

  const zuruecknehmen = useCallback(
    async (e: WerkstattInventarEintrag) => {
      if (!e.extId) return;
      markBusy(e.extId, true);
      try {
        await setExtensionEnabled(e.extId, false);
        toast.success(`„${e.name || e.extId}" zurückgenommen`);
        await refetch();
      } catch (err) {
        toast.error((err as ApiError).message || 'Zurücknehmen fehlgeschlagen');
      } finally {
        markBusy(e.extId, false);
      }
    },
    [setExtensionEnabled, toast, refetch, markBusy]
  );

  const zurueckrollen = useCallback(
    async (e: WerkstattInventarEintrag) => {
      if (!e.extId) return;
      markBusy(e.extId, true);
      try {
        await rollbackExtension(e.extId);
        toast.success(`„${e.name || e.extId}" auf den vorherigen Stand zurückgerollt`);
        await refetch();
      } catch (err) {
        toast.error((err as ApiError).message || 'Rollback fehlgeschlagen');
      } finally {
        markBusy(e.extId, false);
      }
    },
    [rollbackExtension, toast, refetch, markBusy]
  );

  // Freigabe im Dialog bestätigt → mit Freigabe-Flag live schalten.
  const freigabeBestaetigen = useCallback(() => {
    const e = eintraege.find(x => x.extId === freigabe?.extId);
    if (e) void liveSchalten(e, true);
  }, [eintraege, freigabe, liveSchalten]);

  return (
    <div className="shrink-0 border-b border-border bg-background" data-testid="werkstatt-panel">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-ui-sm font-medium text-foreground hover:bg-muted/40"
      >
        {offen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Blocks className="size-3.5 text-primary" />
        Werkstatt
        <span className="text-ui-xs text-text-secondary">
          {erweiterungen.length} Erweiterung{erweiterungen.length === 1 ? '' : 'en'}
        </span>
        {abgelehnt.length > 0 && (
          <span className="ml-1 flex items-center gap-1 text-ui-xs text-warning">
            <AlertTriangle className="size-3" />
            {abgelehnt.length} abgelehnt
          </span>
        )}
      </button>

      {offen && (
        <div className="max-h-56 overflow-y-auto px-2 pb-2">
          {eintraege.length === 0 && (
            <p className="px-1 py-2 text-ui-xs text-text-secondary">
              Noch nichts gebaut. Im Terminal mit{' '}
              <code className="rounded bg-muted px-1">/plan</code> →{' '}
              <code className="rounded bg-muted px-1">/execute</code> eine Erweiterung bauen, sie
              erscheint hier automatisch.
            </p>
          )}

          {erweiterungen.map(e => (
            <div
              key={`${e.slug}/${e.subfolder}`}
              className="flex flex-wrap items-center gap-2 rounded px-1.5 py-1.5 hover:bg-muted/40"
            >
              <Package className="size-3.5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1 basis-32">
                <div className="flex items-center gap-2">
                  <span className="truncate text-ui-sm text-foreground">
                    {e.name || e.subfolder}
                  </span>
                  {e.version && (
                    <span className="text-ui-xs text-text-secondary">v{e.version}</span>
                  )}
                  <StatusPunkt status={e.status} />
                </div>
                {e.faehigkeiten && e.faehigkeiten.wirksam.length > 0 && (
                  <span className="text-ui-xs text-text-secondary">
                    darf: {e.faehigkeiten.wirksam.join(', ')}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-0.5">
                {busyIds.has(e.extId || '') ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    {e.status === 'live' ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Zurücknehmen (deaktivieren)"
                        onClick={() => void zuruecknehmen(e)}
                      >
                        <PowerOff className="size-3.5" />
                      </Button>
                    ) : (
                      e.extId && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Live schalten"
                          onClick={() => void liveSchalten(e)}
                        >
                          <Power className="size-3.5 text-primary" />
                        </Button>
                      )
                    )}
                    {e.type === 'app' && e.status === 'live' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Öffnen"
                        onClick={() => oeffnenWennApp(e)}
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                    )}
                    {e.rollbackVerfuegbar && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Einen Schritt zurück (Rollback)"
                        onClick={() => void zurueckrollen(e)}
                      >
                        <Undo2 className="size-3.5" />
                      </Button>
                    )}
                    {e.extId && (
                      <a
                        href={downloadUrl(e.extId)}
                        download
                        title="Herunterladen (.tar.gz)"
                        className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Download className="size-3.5" />
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {abgelehnt.map(e => (
            <div
              key={`${e.slug}/${e.subfolder}`}
              className="flex items-start gap-2 rounded px-1.5 py-1.5"
              title={e.grund || undefined}
            >
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <span className="truncate text-ui-sm text-foreground">{e.subfolder}</span>
                <p className="truncate text-ui-xs text-warning">{e.grund}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <FreigabeDialog
        anfrage={freigabe}
        laeuft={freigabe != null && busyIds.has(freigabe.extId)}
        onBestaetigen={freigabeBestaetigen}
        onAbbrechen={() => setFreigabe(null)}
      />
    </div>
  );
}
