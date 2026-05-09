import { useState } from 'react';
import { Download, Trash2, ShieldAlert, Info } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';

const DELETE_CONFIRMATION_TOKEN = 'LOESCHEN-BESTAETIGT';

/**
 * P3.3: Datenschutz-Tab. DSGVO Art. 15 (Auskunft) + Art. 17 (Löschung).
 * Backend routes are at /api/gdpr/* (cherry-picked from feat/telegram-bot-overhaul).
 */
export function PrivacySettings() {
  const api = useApi();
  const { logout } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get<Response>('/gdpr/export', { raw: true, showError: false });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arasul-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      toast.success('Datenexport heruntergeladen');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Export fehlgeschlagen');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Konto wirklich endgültig löschen?',
      message:
        'Alle Chats, Dokumente, Projekte und Datentabellen werden unwiderruflich gelöscht. ' +
        'Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Endgültig löschen',
    });
    if (!ok) return;

    const typed = window.prompt(
      `Bestätigung erforderlich. Tippe genau "${DELETE_CONFIRMATION_TOKEN}" ein, um fortzufahren:`
    );
    if (typed !== DELETE_CONFIRMATION_TOKEN) {
      toast.warning('Löschvorgang abgebrochen — Bestätigungstoken falsch.');
      return;
    }

    setDeleting(true);
    try {
      await api.request('/gdpr/me', {
        method: 'DELETE',
        body: { confirm: typed },
        showError: false,
      });
      toast.success('Konto gelöscht — du wirst abgemeldet.');
      // Wait briefly for toast to render, then logout (server already invalidated session).
      setTimeout(() => {
        logout().finally(() => {
          window.location.href = '/';
        });
      }, 1500);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Löschung fehlgeschlagen — bitte erneut versuchen oder Admin kontaktieren.');
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {ConfirmDialog}

      <div>
        <h2 className="text-xl font-bold text-foreground mb-1 flex items-center gap-2">
          <ShieldAlert className="size-5 text-primary" />
          Datenschutz
        </h2>
        <p className="text-sm text-muted-foreground">
          DSGVO-Rechte: Auskunft (Art. 15) und Löschung (Art. 17)
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <Download className="size-4" /> Meine Daten exportieren
        </div>
        <p className="text-sm text-muted-foreground">
          Lädt eine JSON-Datei mit allen zu deinem Account gespeicherten Daten herunter (Profil,
          Chats, Dokument-Metadaten, Projekte, API-Keys, Audit-Log).
        </p>
        <Button onClick={handleExport} disabled={exporting} variant="outline">
          {exporting ? 'Exportiere...' : 'Datenexport herunterladen'}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2 text-foreground font-semibold">
          <Trash2 className="size-4 text-destructive" /> Konto löschen
        </div>
        <Alert variant="destructive">
          <Info className="size-4" />
          <AlertDescription>
            Diese Aktion löscht dein Konto und alle damit verbundenen Daten unwiderruflich. Eine
            Wiederherstellung ist nicht möglich.
          </AlertDescription>
        </Alert>
        <Button onClick={handleDelete} disabled={deleting} variant="destructive">
          {deleting ? 'Lösche...' : 'Konto endgültig löschen'}
        </Button>
      </section>
    </div>
  );
}
