import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, Info, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';
import Modal from '@/components/ui/Modal';
import { useApi } from '../../hooks/useApi';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Section, SectionList } from '@/components/ui/Section';

const DELETE_CONFIRMATION_TOKEN = 'LOESCHEN-BESTAETIGT';

/** Ein angesteckter Datenträger (Plan 023 J3). */
interface Datentraeger {
  name: string;
  freiBytes: number | null;
  beschreibbar: boolean;
}

interface ZieleAntwort {
  medien: Datentraeger[];
  ordner: string;
  hinweis: string | null;
}

/** Bytes als Zahl, die jemand vorlesen kann. */
function groesse(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return 'unbekannt';
  const einheiten = ['Byte', 'KB', 'MB', 'GB', 'TB'];
  let wert = bytes;
  let i = 0;
  while (wert >= 1024 && i < einheiten.length - 1) {
    wert /= 1024;
    i += 1;
  }
  const gerundet = i === 0 ? Math.round(wert) : Math.round(wert * 10) / 10;
  return `${String(gerundet).replace('.', ',')} ${einheiten[i]}`;
}

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

  // Angesteckte Datenträger als Ziel (Plan 023 J3). `hinweis` unterscheidet
  // „keine Platte angesteckt" von „der Ordner ist gar nicht eingebunden" — ohne
  // diesen Unterschied sucht jemand am falschen Ende.
  const [medien, setMedien] = useState<Datentraeger[]>([]);
  const [medienHinweis, setMedienHinweis] = useState<string | null>(null);
  const [medienLaedt, setMedienLaedt] = useState(false);

  const ladeMedien = useCallback(async () => {
    setMedienLaedt(true);
    try {
      const res = await api.get<{ data: ZieleAntwort }>('/gdpr/ziele', { showError: false });
      setMedien(res.data.medien ?? []);
      setMedienHinweis(res.data.hinweis ?? null);
    } catch {
      setMedien([]);
      setMedienHinweis('Die Datenträger lassen sich gerade nicht abfragen.');
    } finally {
      setMedienLaedt(false);
    }
  }, [api]);

  // Beim Öffnen einmal, danach alle zehn Sekunden: die Abnahme verlangt, dass
  // eine angesteckte Platte „innerhalb von zehn Sekunden" erscheint.
  useEffect(() => {
    void ladeMedien();
    const takt = setInterval(() => void ladeMedien(), 10_000);
    return () => clearInterval(takt);
  }, [ladeMedien]);

  const exportAufMedium = async (name: string) => {
    setExporting(true);
    try {
      const res = await api.get<{ datei: string; bytes: number }>(
        `/gdpr/export?ziel=${encodeURIComponent(name)}`,
        { showError: false }
      );
      toast.success(`Export liegt auf „${name}": ${res.datei} (${groesse(res.bytes)})`);
      void ladeMedien();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export auf den Datenträger schlug fehl');
    } finally {
      setExporting(false);
    }
  };

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
        toast.error('Export hat zu lange gedauert, bitte erneut versuchen.');
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
        'Alle Chats, Dokumente und Projekte werden unwiderruflich gelöscht. ' +
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
      toast.warning('Löschvorgang abgebrochen, Bestätigungstoken falsch.');
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
      toast.success('Konto gelöscht, du wirst abgemeldet.');
      // Wait briefly for toast to render, then logout (server already invalidated session).
      setTimeout(() => {
        logout().finally(() => {
          window.location.href = '/';
        });
      }, 1500);
    } catch (err) {
      console.error('Delete error:', err);
      toast.error('Löschung fehlgeschlagen, bitte erneut versuchen oder Admin kontaktieren.');
      setDeleting(false);
    }
  };

  return (
    <div className="animate-in fade-in">
      {ConfirmDialog}

      <PageHeader
        title="Datenschutz"
        description="DSGVO-Rechte: Auskunft (Art. 15) und Löschung (Art. 17)"
      />

      <SectionList>
        <Section
          title="Meine Daten exportieren"
          icon={<Download />}
          description="Lädt eine JSON-Datei mit allen zu deinem Konto gespeicherten Daten herunter: Profil, Chats, Dokument-Metadaten, Projekte, API-Schlüssel, Prüfprotokoll."
        >
          <div className="flex flex-col gap-3">
            <Button onClick={handleExport} disabled={exporting} variant="outline">
              {exporting ? 'Exportiere...' : 'Datenexport herunterladen'}
            </Button>

            {/* Angesteckte Datenträger (Plan 023 J3). Auf einem Gerät im
                Serverraum ist ein Browser-Download der unbequemste Weg. */}
            <div className="flex flex-col gap-2" data-testid="export-ziele">
              <div className="flex items-center gap-2 text-ui-xs text-muted-foreground">
                <HardDrive className="size-3.5" aria-hidden="true" />
                <span>Oder direkt auf einen angesteckten Datenträger</span>
                <button
                  type="button"
                  onClick={() => void ladeMedien()}
                  className="ml-auto rounded p-1 hover:bg-accent"
                  aria-label="Datenträger neu suchen"
                  title="Datenträger neu suchen"
                >
                  <RefreshCw
                    className={`size-3.5 ${medienLaedt ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {medien.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {medien.map(m => (
                    <Button
                      key={m.name}
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={exporting || !m.beschreibbar}
                      data-testid={`export-ziel-${m.name}`}
                      title={
                        m.beschreibbar ? `${groesse(m.freiBytes)} frei` : 'Nur lesend eingehängt'
                      }
                      onClick={() => void exportAufMedium(m.name)}
                    >
                      <HardDrive className="size-3.5" aria-hidden="true" />
                      {m.name}
                      <span className="text-ui-xs text-muted-foreground">
                        {m.beschreibbar ? groesse(m.freiBytes) : 'nur lesend'}
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-ui-xs text-muted-foreground">{medienHinweis}</p>
              )}
            </div>
          </div>
        </Section>

        <Section title="Konto löschen" icon={<Trash2 className="text-destructive" />}>
          <Alert variant="destructive">
            <Info className="size-4" />
            <AlertDescription>
              Diese Aktion löscht dein Konto und alle damit verbundenen Daten unwiderruflich. Eine
              Wiederherstellung ist nicht möglich.
            </AlertDescription>
          </Alert>
          <Button onClick={handleDelete} disabled={deleting} variant="destructive" className="mt-3">
            {deleting ? 'Lösche...' : 'Konto endgültig löschen'}
          </Button>
        </Section>
      </SectionList>

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
