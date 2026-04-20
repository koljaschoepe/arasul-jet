import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../../config/api';
import { getCsrfToken } from '../../utils/csrf';
import { useApi } from '../../hooks/useApi';
import {
  Package,
  Lock,
  CheckCircle,
  XCircle,
  Settings,
  AlertCircle,
  HardDrive,
  RefreshCw,
} from 'lucide-react';
import { formatDate } from '../../utils/formatting';
import EmptyState from '../../components/ui/EmptyState';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';

interface ValidationResult {
  file_path?: string;
  version?: string;
  size?: number;
  components?: Array<{ name?: string; version_to?: string } | string>;
  requires_reboot?: boolean;
  source?: string;
}

interface UpdateStatusData {
  status?: string;
  error?: string;
  currentStep?: string;
  startTime?: string;
}

interface UsbDevice {
  path: string;
  name: string;
  size: number;
  device: string;
  modified?: string;
}

interface HistoryEntry {
  id: number;
  version_from: string;
  version_to: string;
  source: string;
  status: string;
  started_at?: string;
  timestamp?: string;
  duration_seconds?: number;
}

type UploadStatus =
  | 'idle'
  | 'uploading'
  | 'validating'
  | 'validated'
  | 'applying'
  | 'success'
  | 'error';

const UpdatePage = () => {
  const api = useApi();
  const pollingAbortRef = useRef<AbortController | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusData | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [updateHistory, setUpdateHistory] = useState<HistoryEntry[]>([]);
  const [usbDevices, setUsbDevices] = useState<UsbDevice[]>([]);
  const [usbScanning, setUsbScanning] = useState(false);
  const [systemInfo, setSystemInfo] = useState<{
    version?: string;
    build_hash?: string;
    jetpack_version?: string;
    uptime?: number;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchUpdateHistory(controller.signal);
    fetchSystemInfo(controller.signal);
    scanUsbDevices();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (uploadStatus !== 'applying') return;

    const controller = new AbortController();
    pollingAbortRef.current = controller;

    const interval = setInterval(() => {
      fetchUpdateStatus(controller.signal);
    }, 2000);

    return () => {
      clearInterval(interval);
      controller.abort();
      pollingAbortRef.current = null;
    };
  }, [uploadStatus]);

  const fetchSystemInfo = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/system/info', { signal, showError: false });
      setSystemInfo(data);
    } catch {
      // ignore
    }
  };

  const fetchUpdateHistory = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/update/history', { signal, showError: false });
      setUpdateHistory(data.updates || []);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to fetch update history:', error);
    }
  };

  const fetchUpdateStatus = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/update/status', { signal, showError: false });
      setUpdateStatus(data);

      if (data.status === 'completed') {
        setUploadStatus('success');
        fetchUpdateHistory();
      } else if (data.status === 'failed') {
        setUploadStatus('error');
        setErrorMessage(data.error || 'Update fehlgeschlagen');
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to fetch update status:', error);
    }
  };

  const scanUsbDevices = useCallback(async () => {
    setUsbScanning(true);
    try {
      const data = await api.get('/update/usb-devices', { showError: false });
      setUsbDevices(data.devices || []);
    } catch (error) {
      console.error('Failed to scan USB devices:', error);
    } finally {
      setUsbScanning(false);
    }
  }, [api]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.araupdate')) {
      setSelectedFile(file);
      setErrorMessage('');
      setValidationResult(null);
      setUploadStatus('idle');
    } else {
      setErrorMessage('Bitte eine gültige .araupdate Datei auswählen');
      setSelectedFile(null);
    }
  };

  const handleSignatureSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.name.endsWith('.sig')) {
      setSignatureFile(file);
    } else {
      setErrorMessage('Bitte eine gültige .sig Signaturdatei auswählen');
      setSignatureFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Bitte eine Update-Datei auswählen');
      return;
    }

    if (!signatureFile) {
      setErrorMessage('Signaturdatei (.sig) ist erforderlich');
      return;
    }

    setUploadStatus('uploading');
    setErrorMessage('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('signature', signatureFile);

    try {
      const xhr = new XMLHttpRequest();
      const token = localStorage.getItem('arasul_token');

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', event => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded * 100) / event.total));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            setUploadStatus('validated');
            setValidationResult(data);
            setUploadProgress(100);
            resolve();
          } else {
            let msg = 'Upload fehlgeschlagen';
            try {
              const errData = JSON.parse(xhr.responseText);
              msg = errData.error || msg;
            } catch {
              // ignore parse error
            }
            reject(new Error(msg));
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler beim Upload')));
        xhr.open('POST', `${API_BASE}/update/upload`);
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        const csrfToken = getCsrfToken();
        if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken);
        xhr.send(formData);
      });
    } catch (error: unknown) {
      setUploadStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Upload fehlgeschlagen. Bitte erneut versuchen.'
      );
      setUploadProgress(0);
    }
  };

  const handleApplyUpdate = async () => {
    if (!validationResult || !validationResult.file_path) {
      setErrorMessage('Kein validiertes Update verfügbar');
      return;
    }

    setUploadStatus('applying');
    setErrorMessage('');

    try {
      const data = await api.post(
        '/update/apply',
        { file_path: validationResult.file_path },
        { showError: false }
      );
      if (data.status === 'started') {
        fetchUpdateStatus();
      }
    } catch (error: unknown) {
      setUploadStatus('error');
      const err = error as { message?: string };
      setErrorMessage(err.message || 'Update-Prozess konnte nicht gestartet werden');
    }
  };

  const handleUsbInstall = async (usbFile: UsbDevice) => {
    setUploadStatus('uploading');
    setUploadProgress(50);
    setErrorMessage('');

    try {
      const data = await api.post(
        '/update/install-from-usb',
        { file_path: usbFile.path },
        { showError: false }
      );
      setUploadStatus('validated');
      setValidationResult(data);
      setUploadProgress(100);
    } catch (error: unknown) {
      setUploadStatus('error');
      const err = error as { message?: string };
      setErrorMessage(err.message || 'USB-Update konnte nicht geladen werden');
      setUploadProgress(0);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setSignatureFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setValidationResult(null);
    setUpdateStatus(null);
    setErrorMessage('');
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, { text: string; className: string }> = {
      completed: { text: 'Abgeschlossen', className: 'text-primary' },
      failed: { text: 'Fehlgeschlagen', className: 'text-foreground' },
      in_progress: { text: 'In Bearbeitung', className: 'text-muted-foreground' },
      validated: { text: 'Validiert', className: 'text-primary' },
      rolled_back: { text: 'Zurückgesetzt', className: 'text-muted-foreground' },
      signature_verified: { text: 'Signatur OK', className: 'text-primary' },
    };
    const config = labels[status];
    return config ? (
      <span className={cn('text-xs font-medium', config.className)}>{config.text}</span>
    ) : (
      <span className="text-xs text-muted-foreground">{status}</span>
    );
  };

  const getCurrentStepDescription = (step: string) => {
    const steps: Record<string, string> = {
      backup: 'Backup wird erstellt...',
      loading_images: 'Docker-Images werden geladen...',
      migrations: 'Datenbank-Migrationen werden ausgeführt...',
      updating_services: 'Services werden aktualisiert...',
      healthchecks: 'Gesundheitsprüfungen laufen...',
      done: 'Update abgeschlossen!',
    };
    return steps[step] || `Verarbeitung: ${step}`;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="animate-in fade-in">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">System-Updates</h1>
        <p className="text-sm text-muted-foreground">Updates sicher hochladen und installieren</p>
      </div>

      {/* USB Device Detection */}
      {uploadStatus === 'idle' && (
        <div className="pb-6 border-b border-border mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <HardDrive className="size-4 text-muted-foreground" />
              USB-Update erkennen
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={scanUsbDevices}
              disabled={usbScanning}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn('size-3.5', usbScanning && 'animate-spin')} />
            </Button>
          </div>

          {usbDevices.length > 0 ? (
            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              {usbDevices.map((device, idx) => (
                <div key={idx} className="flex items-center justify-between px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground">{device.name}</span>
                    <p className="text-xs text-muted-foreground">
                      {device.device} · {formatFileSize(device.size)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleUsbInstall(device)}
                  >
                    Installieren
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<HardDrive />}
              title={usbScanning ? 'USB-Geräte werden gesucht...' : 'Kein USB-Gerät gefunden'}
              description={
                usbScanning ? undefined : 'Bitte USB-Stick einstecken und erneut scannen.'
              }
            />
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="pb-6 border-b border-border mb-6">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          Update-Paket hochladen
        </h3>

        {uploadStatus === 'idle' && (
          <div className="flex flex-col gap-3">
            <label
              htmlFor="update-file"
              className="flex items-center gap-3 px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer transition-colors hover:bg-muted/30"
            >
              <Package className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {selectedFile ? selectedFile.name : '.araupdate Datei auswählen'}
              </span>
            </label>
            <input
              id="update-file"
              type="file"
              accept=".araupdate"
              onChange={handleFileSelect}
              className="hidden"
            />

            <label
              htmlFor="signature-file"
              className="flex items-center gap-3 px-4 py-3 border border-dashed border-border rounded-lg cursor-pointer transition-colors hover:bg-muted/30"
            >
              <Lock className="size-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-muted-foreground">
                {signatureFile ? signatureFile.name : '.sig Signaturdatei auswählen (erforderlich)'}
              </span>
            </label>
            <input
              id="signature-file"
              type="file"
              accept=".sig"
              onChange={handleSignatureSelect}
              className="hidden"
            />

            {errorMessage && (
              <p className="text-sm text-foreground flex items-center gap-2">
                <AlertCircle className="size-4 shrink-0" />
                {errorMessage}
              </p>
            )}

            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !signatureFile}
              className="w-full"
            >
              Hochladen & Validieren
            </Button>
          </div>
        )}

        {uploadStatus === 'uploading' && (
          <div className="py-6">
            <p className="text-sm text-muted-foreground mb-3">Upload läuft...</p>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-[width] duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-sm font-medium text-foreground mt-2">{uploadProgress}%</p>
          </div>
        )}

        {uploadStatus === 'validated' && validationResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="size-4 text-primary" />
              <span className="text-sm font-medium text-foreground">Update-Paket validiert</span>
            </div>

            <div className="border border-border/50 rounded-lg divide-y divide-border/50">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Version</span>
                <span className="text-sm font-medium text-foreground">
                  {validationResult.version}
                </span>
              </div>
              {validationResult.size && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Größe</span>
                  <span className="text-sm text-foreground">
                    {formatFileSize(validationResult.size)}
                  </span>
                </div>
              )}
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Komponenten</span>
                <span className="text-sm text-foreground">
                  {validationResult.components?.length || 0}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-xs text-muted-foreground">Neustart erforderlich</span>
                <span className="text-sm text-foreground">
                  {validationResult.requires_reboot ? 'Ja' : 'Nein'}
                </span>
              </div>
              {validationResult.source === 'usb' && (
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-xs text-muted-foreground">Quelle</span>
                  <span className="text-sm text-foreground">USB-Gerät</span>
                </div>
              )}
            </div>

            {validationResult.components && validationResult.components.length > 0 && (
              <div className="border-l-2 border-primary/30 pl-4">
                <p className="text-xs font-medium text-foreground mb-2">
                  Aktualisierte Komponenten:
                </p>
                <ul className="space-y-1">
                  {validationResult.components.map((comp, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground">
                      {typeof comp === 'string' ? comp : comp.name || String(comp)}{' '}
                      {typeof comp !== 'string' && comp.version_to && `(v${comp.version_to})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={handleApplyUpdate} className="flex-1">
                Update installieren
              </Button>
              <Button variant="outline" onClick={handleReset} className="flex-1">
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {uploadStatus === 'applying' && updateStatus && (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-2">
              <Settings className="size-4 text-primary animate-spin" />
              <span className="text-sm font-medium text-foreground">
                Update wird installiert...
              </span>
            </div>

            <div className="border-l-2 border-primary/30 pl-4">
              <p className="text-sm text-primary">
                {getCurrentStepDescription(updateStatus.currentStep || '')}
              </p>
            </div>

            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full w-full animate-pulse" />
            </div>

            <p className="text-xs text-muted-foreground">
              Bitte diese Seite nicht schließen und das Gerät nicht ausschalten.
            </p>

            {updateStatus.startTime && (
              <p className="text-xs text-muted-foreground">
                Gestartet: {formatDate(updateStatus.startTime)}
              </p>
            )}
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="py-6 text-center space-y-3">
            <CheckCircle className="size-8 text-primary mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">
              Update erfolgreich installiert!
            </h4>
            <p className="text-sm text-muted-foreground">
              Das System wurde auf Version {validationResult?.version} aktualisiert.
            </p>
            {validationResult?.requires_reboot && (
              <div className="border-l-2 border-primary/30 pl-4 text-left">
                <p className="text-xs text-muted-foreground">
                  <AlertCircle className="size-3.5 inline mr-1" />
                  Systemneustart erforderlich. Bitte starten Sie das System neu.
                </p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={handleReset}>
              Weiteres Update hochladen
            </Button>
          </div>
        )}

        {uploadStatus === 'error' && errorMessage && (
          <div className="py-6 text-center space-y-3">
            <XCircle className="size-8 text-foreground mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">Update fehlgeschlagen</h4>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            <Button variant="outline" size="sm" onClick={handleReset}>
              Erneut versuchen
            </Button>
          </div>
        )}
      </div>

      {/* Update History */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <RefreshCw className="size-4 text-muted-foreground" />
          Update-Verlauf
        </h3>

        {updateHistory.length === 0 ? (
          <div className="border border-border/50 rounded-lg">
            <div className="px-4 py-3 border-b border-border/50">
              <span className="text-xs font-medium text-muted-foreground">Aktueller Stand</span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-border/50">
              <div className="bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground block">Version</span>
                <span className="text-sm font-medium text-foreground">
                  {systemInfo?.version || '1.0.0'}
                </span>
              </div>
              <div className="bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground block">Build</span>
                <span className="text-sm font-mono text-foreground">
                  {systemInfo?.build_hash ? systemInfo.build_hash.substring(0, 7) : '—'}
                </span>
              </div>
              <div className="bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground block">JetPack</span>
                <span className="text-sm font-medium text-foreground">
                  {systemInfo?.jetpack_version || '—'}
                </span>
              </div>
              <div className="bg-background px-4 py-3">
                <span className="text-xs text-muted-foreground block">Letztes Update</span>
                <span className="text-sm text-muted-foreground">Noch kein Update durchgeführt</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="border border-border/50 rounded-lg divide-y divide-border/50">
            {updateHistory.map(update => (
              <div key={update.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-foreground">
                    {update.version_from} → {update.version_to}
                  </span>
                  {getStatusLabel(update.status)}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatDate(update.started_at || update.timestamp || '')}</span>
                  <span>
                    {update.source === 'usb'
                      ? 'USB'
                      : update.source === 'dashboard'
                        ? 'Dashboard'
                        : update.source}
                  </span>
                  {update.duration_seconds && (
                    <span>{Math.round(update.duration_seconds / 60)}m</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdatePage;
