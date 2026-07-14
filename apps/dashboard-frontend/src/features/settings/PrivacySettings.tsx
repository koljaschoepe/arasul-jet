import { useState } from 'react';
import { Download, Trash2, Info } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import Modal from '@/components/ui/Modal';
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
  // In-app type-to-confirm modal (replaces native window.prompt).
  const [tokenModalOpen, setTokenModalOpen] = useState(false);
  const [typedToken, setTypedToken] = useState('');

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
      // Export is admin-only server-side; surface the real reason instead of a
      // generic message. useApi throws an ApiError with .status even for raw:true,
      // and AbortSignal.timeout rejects with a TimeoutError DOMException.
      const e = err as { status?: number; name?: string };
      if (e.status === 403) {
        toast.error('Nur Admins dürfen exportieren.');
      } else if (e.name === 'TimeoutError') {
        toast.error('Export hat zu lange gedauert — bitte erneut versuchen.');
      } else {
        toast.error('Export fehlgeschlagen.');
      }
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

    // Second gate: collect the exact confirmation token via an in-app modal,
    // consistent with the app's dialog system (no native window.prompt).
    setTypedToken('');
    setTokenModalOpen(true);
  };

  const confirmDeletion = async () => {
    if (typedToken !== DELETE_CONFIRMATION_TOKEN) {
      toast.warning('Löschvorgang abgebrochen — Bestätigungstoken falsch.');
      return;
    }

    setTokenModalOpen(false);
    setDeleting(true);
    try {
      // Backend re-validates req.body.confirm === 'LOESCHEN-BESTAETIGT'.
      await api.request('/gdpr/me', {
        method: 'DELETE',
        body: { confirm: typedToken },
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
    <div className="animate-in fade-in">
      {ConfirmDialog}

      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">Datenschutz</h1>
        <p className="text-sm text-muted-foreground">
          DSGVO-Rechte: Auskunft (Art. 15) und Löschung (Art. 17)
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" />
            Meine Daten exportieren
          </h3>
          <p className="text-sm text-muted-foreground">
            Lädt eine JSON-Datei mit allen zu deinem Account gespeicherten Daten herunter (Profil,
            Chats, Dokument-Metadaten, Projekte, API-Keys, Audit-Log).
          </p>
          <Button onClick={handleExport} disabled={exporting} variant="outline">
            {exporting ? 'Exportiere...' : 'Datenexport herunterladen'}
          </Button>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Trash2 className="size-4 text-destructive" />
            Konto löschen
          </h3>
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

      <Modal
        isOpen={tokenModalOpen}
        onClose={() => setTokenModalOpen(false)}
        title={
          <>
            <Trash2 className="size-4 text-destructive" /> Löschung bestätigen
          </>
        }
        size="small"
        footer={
          <div className="flex gap-3 w-full justify-end">
            <Button type="button" variant="outline" onClick={() => setTokenModalOpen(false)}>
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDeletion}
              disabled={typedToken !== DELETE_CONFIRMATION_TOKEN}
            >
              Endgültig löschen
            </Button>
          </div>
        }
      >
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            confirmDeletion();
          }}
        >
          <Label htmlFor="delete-confirm-token">
            Tippe zur Bestätigung genau{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-foreground">
              {DELETE_CONFIRMATION_TOKEN}
            </code>{' '}
            ein:
          </Label>
          <Input
            id="delete-confirm-token"
            value={typedToken}
            onChange={e => setTypedToken(e.target.value)}
            placeholder={DELETE_CONFIRMATION_TOKEN}
            autoComplete="off"
          />
        </form>
      </Modal>
    </div>
  );
}
