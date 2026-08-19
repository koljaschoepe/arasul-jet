/**
 * FlowEditorTab — der zentrale Flow-Editor als Mitte-Tab (Plan 012 Phase D,
 * Schritte 10 + 11). Löst das frühere Fullscreen-Popup (FlowDialog) ab.
 *
 * EIN Tab für Anlegen UND Bearbeiten: das Ziel steht im ephemeren
 * `flowEditorStore` (`editName === null` legt an, ein Name bearbeitet). Das
 * geführte Formular (`FlowForm`) ist die einzige Ansicht — die frühere Datei-/
 * Laufzeit-Vorschau ist mit dem Flows-Umbau 2026-08-02 bewusst entfernt.
 * Speichern schreibt die vom Backend geprüfte Datei und macht die Flow-Liste
 * (`['flows']`) sofort frisch, sodass der neue/geänderte Flow ohne Neuladen im
 * Slash-Menü und in der Sidebar steht.
 *
 * Bewusst kein eigenes Markdown-Bauen im Client: Die Wahrheit ist die Datei,
 * und die erzeugt der Server.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Save, Sparkles, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore, tabId } from '@/stores/workspaceStore';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import type { FlowBeispiel, FlowDefinition, FlowToolInfo } from '@/types/flows';
import FlowForm from './FlowForm';
import FlowDashboard from './FlowDashboard';
import FlowOverview from './FlowOverview';
import { fromDefinition, LEER_FORM, toBody, type FlowFormState } from './flowFormState';

const FLOW_TAB_ID = tabId({ type: 'flow' });

export default function FlowEditorTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();

  const editName = useFlowEditorStore(s => s.editName);
  const mode = useFlowEditorStore(s => s.mode);
  const projekt = useFlowEditorStore(s => s.projekt);
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);
  // Projektgebundene Flows (Plan 014): alle Einzel-Flow-Aufrufe tragen das Projekt.
  const projektQuery = projekt ? `?projekt=${projekt.id}` : '';
  const closeTab = useWorkspaceStore(s => s.closeTab);
  const updateTabTitle = useWorkspaceStore(s => s.updateTabTitle);

  const bearbeiten = editName !== null;
  // Dashboard-Ansicht (Flow-Zentrale) vs. Editor. Der geladene Flow speist beide.
  const ansicht = mode === 'view' && editName !== null;
  const uebersicht = mode === 'overview';

  const [form, setForm] = useState<FlowFormState>(LEER_FORM);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschDialog, setLoeschDialog] = useState(false);
  const [loescht, setLoescht] = useState(false);

  // Die Werkzeugliste (mit „schon nutzbar?") — geteilt über den Cache.
  const { data: werkzeuge = [] } = useQuery({
    queryKey: ['flow-werkzeuge'],
    queryFn: async () => {
      const res = await api.get<{ data: FlowToolInfo[] }>('/flows/werkzeuge', {
        showError: false,
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  // Die mitgelieferten Startpunkte (Plan 023 B4). Ab Werk liegt kein Flow auf
  // dem Gerät; wer einen anlegt, soll trotzdem nicht vor einem leeren Blatt
  // sitzen. Angelegt wird erst beim Speichern.
  const { data: beispiele = [] } = useQuery({
    queryKey: ['flow-beispiele'],
    queryFn: async () => {
      const res = await api.get<{ data: FlowBeispiel[] }>('/flows/beispiele', {
        showError: false,
      });
      return res.data;
    },
    staleTime: 60 * 60_000,
    enabled: !bearbeiten,
  });

  const beispielUebernehmen = async (name: string) => {
    try {
      const res = await api.get<{ data: FlowDefinition }>(`/flows/beispiele/${name}`, {
        showError: false,
      });
      setForm(fromDefinition(res.data));
      setFehler(null);
    } catch (err) {
      setFehler((err as ApiError).message || 'Beispiel konnte nicht geladen werden');
    }
  };

  // Beim Bearbeiten den Flow laden; beim Anlegen mit dem leeren Formular starten.
  const { data: geladen } = useQuery({
    queryKey: ['flows', editName, projekt?.id ?? null],
    queryFn: async () => {
      const res = await api.get<{ data: FlowDefinition }>(`/flows/${editName}${projektQuery}`, {
        showError: false,
      });
      return res.data;
    },
    enabled: bearbeiten,
  });

  // Formular füllen, wenn sich das Ziel ändert (bzw. der geladene Flow ankommt).
  useEffect(() => {
    setFehler(null);
    if (bearbeiten) {
      if (geladen) setForm(fromDefinition(geladen));
    } else {
      setForm(LEER_FORM);
    }
  }, [bearbeiten, geladen]);

  // Der Tab-Titel folgt dem Ziel — so ist am Reiter erkennbar, welcher Flow
  // gerade offen ist (oder dass ein neuer entsteht).
  useEffect(() => {
    updateTabTitle(
      FLOW_TAB_ID,
      uebersicht
        ? 'Flows'
        : editName
          ? ansicht
            ? `/${editName}`
            : `Flow: /${editName}`
          : 'Neuer Flow'
    );
  }, [editName, ansicht, uebersicht, updateTabTitle]);

  // Der Tab ist keep-alive: beim Wechsel des Ziels (anderer Flow, »Neuer Flow«)
  // würde die alte Scroll-Position kleben — Formulare öffnen dann mitten im
  // Dokument. Deshalb beim Zielwechsel nach oben springen.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [editName, mode]);

  const speichern = async () => {
    setSpeichert(true);
    setFehler(null);
    const body = toBody(form);
    try {
      if (bearbeiten) {
        // Der Name steht in der URL, NICHT im Body: `SaveFlowBody` ist `.strict()`
        // und kennt kein `name`-Feld — ein mitgeschicktes `name` würde die
        // Änderung mit 400 („Unrecognized key: name") ablehnen. Nur beim Anlegen
        // (`CreateFlowBody`) gehört der Name in den Body.
        const { name: _name, ...ohneNamen } = body;
        void _name;
        await api.put(`/flows/${editName}${projektQuery}`, ohneNamen, { showError: false });
        toast.success(`Flow „${editName}" gespeichert`);
        await queryClient.invalidateQueries({ queryKey: ['flows'] });
      } else {
        const neuerName = form.name.trim();
        await api.post('/flows', body, { showError: false });
        toast.success(`Flow „${neuerName}" angelegt`);
        await queryClient.invalidateQueries({ queryKey: ['flows'] });
        // Anders als das alte Popup schließt der Tab nicht: er wechselt in den
        // Bearbeiten-Modus des frisch angelegten Flows, sodass man direkt
        // weiterarbeiten kann (und die Server-normalisierte Fassung sieht).
        setEditTarget(neuerName);
      }
    } catch (err) {
      setFehler((err as ApiError).message || 'Speichern fehlgeschlagen');
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    setLoescht(true);
    try {
      await api.del(`/flows/${editName}${projektQuery}`, { showError: false });
      toast.success(`Flow „${editName}" gelöscht`);
      // Erst den Editor abbauen (Tab schließen + Ziel leeren), dann die
      // Detail-Abfrage des gelöschten Flows verwerfen — sonst löst das breite
      // invalidate(['flows']) noch ein Nachladen von GET /flows/<name> aus, das
      // gegen den eben gelöschten Flow zwangsläufig 404 läuft. Danach nur die
      // LISTE (exakt ['flows']) auffrischen, nicht die Detail-Keys.
      setLoeschDialog(false);
      closeTab(FLOW_TAB_ID);
      setEditTarget(null);
      queryClient.removeQueries({ queryKey: ['flows', editName] });
      await queryClient.invalidateQueries({ queryKey: ['flows'], exact: true });
    } catch (err) {
      setLoeschDialog(false);
      setFehler((err as ApiError).message || 'Löschen fehlgeschlagen');
    } finally {
      setLoescht(false);
    }
  };

  // Flow-Startseite (ActivityBar »Flows«): Anlegen + alle Flows als Karten.
  if (uebersicht) {
    return <FlowOverview />;
  }

  // Flow-Zentrale (Dashboard-Ansicht): read-only Betriebssicht mit Trigger-URL,
  // Läufen, Ausgabeort und Pipeline. „Bearbeiten" wechselt in den Editor unten.
  if (ansicht) {
    return (
      <>
        <FlowDashboard
          name={editName}
          flow={geladen}
          projekt={projekt}
          onEdit={() => setEditTarget(editName, 'edit', projekt)}
          onDelete={() => setLoeschDialog(true)}
        />
        <ConfirmModal
          isOpen={loeschDialog}
          onClose={() => setLoeschDialog(false)}
          onConfirm={loeschen}
          title="Flow löschen"
          message={`Den Flow „${editName}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`}
          confirmText="Löschen"
          confirmVariant="danger"
          isLoading={loescht}
        />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="flow-editor-tab">
      {/* Kopfzeile: eine ruhige Zeile — Titel links, Aktionen rechts, alles auf
          gleicher Höhe. Einheitliche Panel-Kopfhöhe (h-ui-header, Plan 016).
          Kein »Neu«-Knopf hier: Anlegen startet über die Flow-Startseite bzw.
          das + in der Sidebar — im Editor selbst verwirrte er nur. */}
      <div className="flex h-ui-header shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {bearbeiten ? `Flow bearbeiten: /${editName}` : 'Neuer Flow'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {bearbeiten && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setLoeschDialog(true)}
              disabled={speichert}
              aria-label="Flow löschen"
              title="Flow löschen"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
          <Button type="button" size="sm" onClick={speichern} disabled={speichert}>
            <Save className="size-3.5" />
            {speichert ? 'Speichert …' : 'Speichern'}
          </Button>
        </div>
      </div>

      {fehler && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-ui-xs text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-wrap break-words">{fehler}</span>
        </div>
      )}

      {/* Körper: das Formular ist die einzige Ansicht, mittig begrenzt für gute
          Lesbarkeit. Die frühere Datei-/Laufzeit-Vorschau ist bewusst entfernt
          (Flows-Umbau 2026-08-02) — sie war technisches Rauschen für die
          eigentliche Zielgruppe. */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto w-full max-w-3xl">
          {!bearbeiten && beispiele.length > 0 && (
            <div className="mb-4 rounded-lg border border-border p-3">
              <p className="flex items-center gap-1.5 text-ui-xs font-semibold text-foreground">
                <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                Aus einem Beispiel starten
              </p>
              <p className="mt-0.5 text-ui-xs text-muted-foreground">
                Füllt das Formular. Angelegt wird der Flow erst beim Speichern.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {beispiele.map(beispiel => (
                  <button
                    key={beispiel.name}
                    type="button"
                    onClick={() => void beispielUebernehmen(beispiel.name)}
                    title={beispiel.beschreibung}
                    className="rounded-md border border-border px-2.5 py-1 text-ui-xs text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
                  >
                    /{beispiel.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <FlowForm
            value={form}
            onChange={setForm}
            mode={bearbeiten ? 'edit' : 'create'}
            werkzeuge={werkzeuge}
          />
        </div>
      </div>

      <ConfirmModal
        isOpen={loeschDialog}
        onClose={() => setLoeschDialog(false)}
        onConfirm={loeschen}
        title="Flow löschen"
        message={`Den Flow „${editName}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        confirmVariant="danger"
        isLoading={loescht}
      />
    </div>
  );
}
