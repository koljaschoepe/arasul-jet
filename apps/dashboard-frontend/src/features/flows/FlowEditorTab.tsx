/**
 * FlowEditorTab — der zentrale Flow-Editor als Mitte-Tab (Plan 012 Phase D,
 * Schritte 10 + 11). Löst das frühere Fullscreen-Popup (FlowDialog) ab.
 *
 * EIN Tab für Anlegen UND Bearbeiten: das Ziel steht im ephemeren
 * `flowEditorStore` (`editName === null` legt an, ein Name bearbeitet). Das
 * Formular (`FlowForm`) ist die Hauptansicht; die Live-Vorschau
 * (`MarkdownPreview`, erzeugte Datei UND aufgelöster Laufzeit-Prompt) öffnet auf
 * Wunsch über den »Vorschau«-Schalter in der Kopfzeile als schmale rechte Spalte
 * — nicht mehr fest daneben. Speichern schreibt die vom Backend geprüfte Datei
 * und macht die Flow-Liste (`['flows']`) sofort frisch, sodass der neue/
 * geänderte Flow ohne Neuladen im Slash-Menü und in der Sidebar steht.
 *
 * Bewusst kein eigenes Markdown-Bauen im Client: Die Wahrheit ist die Datei,
 * und die erzeugt der Server (Vorschau wie Speichern über denselben Weg).
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import { useWorkspaceStore, tabId } from '@/stores/workspaceStore';
import { useFlowEditorStore } from '@/stores/flowEditorStore';
import type { FlowDefinition, FlowToolInfo } from '@/types/flows';
import FlowForm from './FlowForm';
import MarkdownPreview from './MarkdownPreview';
import { fromDefinition, LEER_FORM, toBody, type FlowFormState } from './flowFormState';

const FLOW_TAB_ID = tabId({ type: 'flow' });

export default function FlowEditorTab() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();

  const editName = useFlowEditorStore(s => s.editName);
  const setEditTarget = useFlowEditorStore(s => s.setEditTarget);
  const closeTab = useWorkspaceStore(s => s.closeTab);
  const updateTabTitle = useWorkspaceStore(s => s.updateTabTitle);

  const bearbeiten = editName !== null;

  const [form, setForm] = useState<FlowFormState>(LEER_FORM);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschDialog, setLoeschDialog] = useState(false);
  const [loescht, setLoescht] = useState(false);
  // Das Formular ist die Hauptansicht; die Laufzeit-Vorschau ist ein kleiner,
  // bewusst auszuklappender Blick auf den vollständigen Prompt — nicht mehr fest
  // daneben (das drängte das Formular ab lg dauerhaft in die halbe Breite).
  const [vorschauOffen, setVorschauOffen] = useState(false);

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

  // Beim Bearbeiten den Flow laden; beim Anlegen mit dem leeren Formular starten.
  const { data: geladen } = useQuery({
    queryKey: ['flows', editName],
    queryFn: async () => {
      const res = await api.get<{ data: FlowDefinition }>(`/flows/${editName}`, {
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
    updateTabTitle(FLOW_TAB_ID, editName ? `Flow: /${editName}` : 'Neuer Flow');
  }, [editName, updateTabTitle]);

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
        await api.put(`/flows/${editName}`, ohneNamen, { showError: false });
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
      await api.del(`/flows/${editName}`, { showError: false });
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="flow-editor-tab">
      {/* Kopfzeile: eine ruhige Zeile — Titel links, Aktionen rechts, alles auf
          gleicher Höhe (h-14, items-center). Vorschau · Neu · Löschen · Speichern. */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {bearbeiten ? `Flow bearbeiten: /${editName}` : 'Neuer Flow'}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant={vorschauOffen ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={vorschauOffen}
            onClick={() => setVorschauOffen(v => !v)}
            className={cn(vorschauOffen && 'border-primary/40')}
          >
            <Eye className="size-4" /> Vorschau
          </Button>
          <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditTarget(null)}
            disabled={speichert}
          >
            <Plus className="size-4" /> Neu
          </Button>
          {bearbeiten && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setLoeschDialog(true)}
              disabled={speichert}
            >
              <Trash2 className="size-4" /> Löschen
            </Button>
          )}
          <Button type="button" size="sm" onClick={speichern} disabled={speichert}>
            <Save className="size-4" />
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

      {/* Körper: das Formular ist die Hauptansicht (bei geschlossener Vorschau
          mittig begrenzt für gute Lesbarkeit). Die Vorschau öffnet als schmale
          rechte Spalte — nur wenn angefordert, und zeigt gleich den vollen
          Laufzeit-Prompt. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            'min-h-0 overflow-y-auto p-4',
            vorschauOffen ? 'flex-1' : 'mx-auto w-full max-w-3xl'
          )}
        >
          <FlowForm
            value={form}
            onChange={setForm}
            mode={bearbeiten ? 'edit' : 'create'}
            werkzeuge={werkzeuge}
          />
        </div>
        {vorschauOffen && (
          <div className="flex min-h-0 w-full max-w-[460px] shrink-0 flex-col border-l border-border p-4">
            <MarkdownPreview body={toBody(form)} defaultView="laufzeit" />
          </div>
        )}
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
