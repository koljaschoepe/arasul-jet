import { useState, useEffect } from 'react';
import { Download, ShieldAlert, Trash2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { useApi } from '../../../hooks/useApi';
import useConfirm from '../../../hooks/useConfirm';
import { API_BASE, getAuthHeaders } from '../../../config/api';

interface PrivacySettingsProps {
  handleLogout: () => void;
}

interface DataCategory {
  name: string;
  description: string;
  count?: number;
}

interface CategoriesResponse {
  categories: DataCategory[];
  timestamp: string;
}

interface DeleteResponse {
  ok: boolean;
  message: string;
  summary: Record<string, number>;
}

const DELETE_TOKEN = 'LOESCHEN-BESTAETIGT';

export function PrivacySettings({ handleLogout }: PrivacySettingsProps) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const [categories, setCategories] = useState<DataCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<CategoriesResponse>('/gdpr/categories', { showError: false })
      .then(data => {
        if (!cancelled) setCategories(data.categories || []);
      })
      .catch(() => {
        // Categories sind optional — Tab funktioniert auch ohne
      })
      .finally(() => {
        if (!cancelled) setLoadingCategories(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  const handleExport = async () => {
    setExporting(true);
    try {
      // /gdpr/export liefert ein JSON-Attachment; Download triggern wir
      // klassisch über ein temporäres <a download>, da useApi keine Blobs
      // direkt herunterlädt. Auth läuft via Cookie + Bearer wie im Rest.
      const res = await fetch(`${API_BASE}/gdpr/export`, {
        method: 'GET',
        headers: getAuthHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `arasul-gdpr-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      // Fallback ohne Toast-System: in Konsole + UI-State
      console.error('GDPR-Export fehlgeschlagen:', err);
      setDeleteError('Export fehlgeschlagen. Bitte erneut versuchen.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async () => {
    setDeleteError(null);
    if (confirmText !== DELETE_TOKEN) {
      setDeleteError(`Bitte exakt "${DELETE_TOKEN}" eingeben, um die Löschung freizugeben.`);
      return;
    }

    const ok = await confirm({
      title: 'Account und alle Daten endgültig löschen?',
      message:
        'Alle deine Konversationen, KI-Erinnerungen und hochgeladenen Dokumente werden unwiderruflich gelöscht. ' +
        'Compliance-relevante Trails werden anonymisiert behalten. Diese Aktion kann nicht rückgängig gemacht werden.',
      confirmText: 'Endgültig löschen',
      cancelText: 'Abbrechen',
      confirmVariant: 'danger',
    });
    if (!ok) return;

    setDeleting(true);
    try {
      // useApi.del() unterstützt keinen Body — DELETE mit Body ist selten genug,
      // dass wir hier direkt request() nutzen, statt die Public-API für 16+
      // existierende Callers zu brechen.
      await api.request<DeleteResponse>('/gdpr/me', {
        method: 'DELETE',
        body: { confirm: DELETE_TOKEN },
        showError: false,
      });
      // Erfolgreich gelöscht → ausloggen und zur Login-Seite zurück.
      handleLogout();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Löschung fehlgeschlagen';
      setDeleteError(msg);
      setDeleting(false);
    }
  };

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">Datenschutz</h1>
        <p className="text-sm text-muted-foreground">
          DSGVO-Rechte: Datenexport und Recht auf Löschung
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Datenkategorien */}
        <section>
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <FileText className="size-4 text-muted-foreground" />
            Was ist über dich gespeichert?
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Übersicht der Datenkategorien, die mit deinem Account verknüpft sind.
          </p>
          {loadingCategories ? (
            <p className="text-xs text-muted-foreground">Lade…</p>
          ) : categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Kategorien verfügbar.</p>
          ) : (
            <ul className="text-sm text-foreground space-y-2">
              {categories.map(cat => (
                <li
                  key={cat.name}
                  className="flex justify-between items-baseline gap-4 py-2 border-b border-border last:border-b-0"
                >
                  <span>
                    <span className="font-medium">{cat.name}</span>{' '}
                    <span className="text-xs text-muted-foreground">— {cat.description}</span>
                  </span>
                  {cat.count != null && (
                    <span className="text-xs font-mono text-muted-foreground shrink-0">
                      {cat.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Datenexport */}
        <section className="pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <Download className="size-4 text-muted-foreground" />
            Datenexport (DSGVO Art. 15)
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Lade alle deine Daten als JSON-Datei herunter. Die Datei enthält Profil, Konversationen,
            Dokumenten-Metadaten, Login-Historie und Aktivitätsprotokolle.
          </p>
          <Button variant="outline" onClick={handleExport} disabled={exporting}>
            <Download className="size-4" />
            {exporting ? 'Wird exportiert…' : 'Export herunterladen'}
          </Button>
        </section>

        {/* Recht auf Löschung */}
        <section className="pt-6 border-t border-border">
          <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <ShieldAlert className="size-4 text-destructive" />
            Recht auf Löschung (DSGVO Art. 17)
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Lösche deinen Account und alle persönlichen Inhalte unwiderruflich. Compliance-relevante
            Audit-Trails werden anonymisiert behalten (Art. 17 (3) (b)). Falls du der einzige
            verbleibende Admin bist, lege erst einen Ersatz an, sonst ist die Box unbedienbar.
          </p>

          <div className="flex flex-col gap-3 max-w-md">
            <label className="text-xs text-muted-foreground">
              Tippe <span className="font-mono font-bold text-foreground">{DELETE_TOKEN}</span>, um
              die Löschung freizugeben:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={e => {
                setConfirmText(e.target.value);
                setDeleteError(null);
              }}
              placeholder={DELETE_TOKEN}
              className="px-3 py-2 rounded-md border border-border bg-background text-sm font-mono"
              autoComplete="off"
              disabled={deleting}
            />
            {deleteError && (
              <p className="text-xs text-destructive" role="alert">
                {deleteError}
              </p>
            )}
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || confirmText !== DELETE_TOKEN}
              className="self-start"
            >
              <Trash2 className="size-4" />
              {deleting ? 'Wird gelöscht…' : 'Account und Daten löschen'}
            </Button>
          </div>
        </section>
      </div>

      {ConfirmDialog}
    </div>
  );
}
