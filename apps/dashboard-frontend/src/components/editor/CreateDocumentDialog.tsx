import React, { memo } from 'react';
import { FileText, Table } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useModalForm } from '../../hooks/useModalForm';
import Modal from '../ui/Modal';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';

interface Space {
  id: string;
  name: string;
}

interface CreateDocumentDialogProps {
  type: 'markdown' | 'table';
  isOpen: boolean;
  onClose: () => void;
  onCreated: (document: any) => void;
  spaceId?: string | null;
  spaces?: Space[];
}

const CONFIG = {
  markdown: {
    title: 'Neues Markdown-Dokument',
    icon: FileText,
    inputId: 'md-filename',
    inputLabel: 'Dateiname *',
    inputPlaceholder: 'z.B. notizen, dokumentation, anleitung',
    inputHint: '.md wird automatisch angehängt',
    spaceSelectId: 'md-space',
    spaceLabel: 'Wissensbereich',
    emptyValidation: 'Dateiname ist erforderlich',
    submitLabel: 'Dokument erstellen',
    errorLog: 'Error creating markdown document:',
    fallbackError: 'Fehler beim Erstellen des Dokuments',
  },
  table: {
    title: 'Neue Tabelle',
    icon: Table,
    inputId: 'table-name',
    inputLabel: 'Tabellenname *',
    inputPlaceholder: 'z.B. Kunden, Produkte, Aufgaben',
    inputHint: 'Eine Spalte "Name" wird automatisch erstellt',
    spaceSelectId: 'table-space',
    spaceLabel: 'Bereich',
    emptyValidation: 'Tabellenname ist erforderlich',
    submitLabel: 'Erstellen & Bearbeiten',
    errorLog: 'Error creating table:',
    fallbackError: 'Fehler beim Erstellen der Tabelle',
  },
} as const;

const CreateDocumentDialog = memo(function CreateDocumentDialog({
  type,
  isOpen,
  onClose,
  onCreated,
  spaceId,
  spaces = [],
}: CreateDocumentDialogProps) {
  const api = useApi();
  const config = CONFIG[type];
  const Icon = config.icon;

  const { values, setValue, error, setError, saving, handleSubmit } = useModalForm(isOpen, {
    initialValues: { name: '', selectedSpaceId: spaceId || '' },
    onOpen: () => ({ name: '', selectedSpaceId: spaceId || '' }),
  });

  const handleCreate = handleSubmit(async () => {
    if (!values.name.trim()) {
      setError(config.emptyValidation);
      return;
    }

    try {
      if (type === 'markdown') {
        const data = await api.post(
          '/documents/create-markdown',
          {
            filename: values.name.trim(),
            space_id: values.selectedSpaceId || null,
          },
          { showError: false }
        );

        onCreated(data.document);
      } else {
        const responseData = await api.post(
          '/v1/datentabellen/tables',
          {
            name: values.name.trim(),
            createDefaultField: true,
            space_id: values.selectedSpaceId || null,
          },
          { showError: false }
        );

        const newTable = responseData.data;
        onCreated({ ...newTable, space_id: values.selectedSpaceId || null });
      }
    } catch (err: any) {
      console.error(config.errorLog, err);
      if (type === 'table' && err.status === 409) {
        throw new Error('Eine Tabelle mit diesem Namen existiert bereits');
      }
      throw err;
    }
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={config.title} size="small">
      <form onSubmit={handleCreate} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-destructive/10 border border-destructive/30 text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-center text-primary">
          <Icon className="size-8" />
        </div>

        <div>
          <label
            htmlFor={config.inputId}
            className="block text-sm font-semibold text-foreground mb-2"
          >
            {config.inputLabel}
          </label>
          <Input
            id={config.inputId}
            type="text"
            value={values.name}
            onChange={e => setValue('name', e.target.value)}
            placeholder={config.inputPlaceholder}
            autoFocus
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{config.inputHint}</p>
        </div>

        {spaces.length > 0 && (
          <div>
            <label
              htmlFor={config.spaceSelectId}
              className="block text-sm font-semibold text-foreground mb-2"
            >
              {config.spaceLabel}
            </label>
            <select
              id={config.spaceSelectId}
              value={values.selectedSpaceId}
              onChange={e => setValue('selectedSpaceId', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">Allgemein</option>
              {spaces.map(space => (
                <option key={space.id} value={space.id}>
                  {space.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={saving || !values.name.trim()}>
            {saving ? 'Erstelle...' : config.submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
});

export default CreateDocumentDialog;
