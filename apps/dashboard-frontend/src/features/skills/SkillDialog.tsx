/**
 * SkillDialog — Anlege- und Bearbeiten-Dialog für Skills (Plan 011, Schritt 17).
 *
 * EIN Dialog für beides: `editName === null` legt an, ein Name lädt den Skill
 * und bearbeitet ihn (mit Löschen-Knopf). Links das Formular (`SkillForm`),
 * rechts die Live-Vorschau der erzeugten Markdown-Datei (`MarkdownPreview`) —
 * dieselbe, die das Backend beim Speichern prüft. Speichern schreibt die
 * geprüfte Datei und macht die Skill-Liste (`['skills']`) sofort frisch, damit
 * der neue/geänderte Skill ohne Neuladen im Slash-Menü steht.
 *
 * Bewusst kein eigenes Markdown-Bauen im Client: Die Wahrheit ist die Datei,
 * und die erzeugt der Server (Vorschau wie Speichern über denselben Weg).
 */
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Save, Trash2 } from 'lucide-react';
import Modal, { ConfirmModal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '@/hooks/useApi';
import type { ApiError } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import type { SkillDefinition, SkillToolInfo } from '@/types/skills';
import SkillForm from './SkillForm';
import MarkdownPreview from './MarkdownPreview';
import { fromDefinition, LEER_FORM, toBody, type SkillFormState } from './skillFormState';

interface SkillDialogProps {
  open: boolean;
  /** null = Anlegen; ein Name = diesen Skill bearbeiten. */
  editName: string | null;
  onClose: () => void;
}

export default function SkillDialog({ open, editName, onClose }: SkillDialogProps) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const bearbeiten = editName !== null;

  const [form, setForm] = useState<SkillFormState>(LEER_FORM);
  const [fehler, setFehler] = useState<string | null>(null);
  const [speichert, setSpeichert] = useState(false);
  const [loeschDialog, setLoeschDialog] = useState(false);
  const [loescht, setLoescht] = useState(false);

  // Die Werkzeugliste (mit „schon nutzbar?") — geteilt über den Cache.
  const { data: werkzeuge = [] } = useQuery({
    queryKey: ['skill-werkzeuge'],
    queryFn: async () => {
      const res = await api.get<{ data: SkillToolInfo[] }>('/skills/werkzeuge', {
        showError: false,
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
    enabled: open,
  });

  // Beim Bearbeiten den Skill laden; beim Anlegen mit dem leeren Formular starten.
  const { data: geladen } = useQuery({
    queryKey: ['skills', editName],
    queryFn: async () => {
      const res = await api.get<{ data: SkillDefinition }>(`/skills/${editName}`, {
        showError: false,
      });
      return res.data;
    },
    enabled: open && bearbeiten,
  });

  // Formular füllen, wenn der Dialog öffnet (bzw. der geladene Skill ankommt).
  useEffect(() => {
    if (!open) return;
    setFehler(null);
    if (bearbeiten) {
      if (geladen) setForm(fromDefinition(geladen));
    } else {
      setForm(LEER_FORM);
    }
  }, [open, bearbeiten, geladen]);

  const speichern = async () => {
    setSpeichert(true);
    setFehler(null);
    const body = toBody(form);
    try {
      if (bearbeiten) {
        // Der Name steht in der URL, NICHT im Body: `SaveSkillBody` ist `.strict()`
        // und kennt kein `name`-Feld — ein mitgeschicktes `name` würde die
        // Änderung mit 400 („Unrecognized key: name") ablehnen. Nur beim Anlegen
        // (`CreateSkillBody`) gehört der Name in den Body.
        const { name: _name, ...ohneNamen } = body;
        void _name;
        await api.put(`/skills/${editName}`, ohneNamen, { showError: false });
        toast.success(`Skill „${editName}" gespeichert`);
      } else {
        await api.post('/skills', body, { showError: false });
        toast.success(`Skill „${form.name.trim()}" angelegt`);
      }
      await queryClient.invalidateQueries({ queryKey: ['skills'] });
      onClose();
    } catch (err) {
      setFehler((err as ApiError).message || 'Speichern fehlgeschlagen');
    } finally {
      setSpeichert(false);
    }
  };

  const loeschen = async () => {
    setLoescht(true);
    try {
      await api.del(`/skills/${editName}`, { showError: false });
      toast.success(`Skill „${editName}" gelöscht`);
      await queryClient.invalidateQueries({ queryKey: ['skills'] });
      setLoeschDialog(false);
      onClose();
    } catch (err) {
      setLoeschDialog(false);
      setFehler((err as ApiError).message || 'Löschen fehlgeschlagen');
    } finally {
      setLoescht(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={open}
        onClose={onClose}
        size="fullscreen"
        title={bearbeiten ? `Skill bearbeiten: /${editName}` : 'Neuer Skill'}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {bearbeiten ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setLoeschDialog(true)}
                disabled={speichert}
              >
                <Trash2 className="size-4" /> Löschen
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={speichert}>
                Abbrechen
              </Button>
              <Button type="button" onClick={speichern} disabled={speichert}>
                <Save className="size-4" />
                {speichert ? 'Speichert …' : 'Speichern'}
              </Button>
            </div>
          </div>
        }
      >
        {fehler && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-ui-xs text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span className="whitespace-pre-wrap break-words">{fehler}</span>
          </div>
        )}
        <div className="grid h-full min-h-0 grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto pr-1">
            <SkillForm
              value={form}
              onChange={setForm}
              mode={bearbeiten ? 'edit' : 'create'}
              werkzeuge={werkzeuge}
            />
          </div>
          <div className="hidden min-h-0 lg:block">
            <MarkdownPreview body={toBody(form)} />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={loeschDialog}
        onClose={() => setLoeschDialog(false)}
        onConfirm={loeschen}
        title="Skill löschen"
        message={`Den Skill „${editName}" wirklich löschen? Das kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        confirmVariant="danger"
        isLoading={loescht}
      />
    </>
  );
}
