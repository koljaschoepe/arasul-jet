import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../../config/api';
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
import { Badge } from '@/components/ui/shadcn/badge';
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
  // RC-003: AbortController for polling cleanup
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

  // Fetch update history on mount
  useEffect(() => {
    const controller = new AbortController();
    fetchUpdateHistory(controller.signal);
    scanUsbDevices();
    return () => controller.abort();
  }, []);

  // Poll update status when applying (RC-003: AbortController prevents post-unmount updates)
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

  const fetchUpdateHistory = async (signal?: AbortSignal) => {
    try {
      const data = await api.get('/update/history', { signal, showError: false });
      setUpdateHistory(data.updates || []);
    } catch (error: any) {
      if (error.name === 'AbortError') return;
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
    } catch (error: any) {
      if (error.name === 'AbortError') return;
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
        xhr.send(formData);
      });
    } catch (error: any) {
      setUploadStatus('error');
      setErrorMessage(error.message || 'Upload fehlgeschlagen. Bitte erneut versuchen.');
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
    } catch (error: any) {
      setUploadStatus('error');
      setErrorMessage(
        error.data?.error || error.message || 'Update-Prozess konnte nicht gestartet werden'
      );
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
    } catch (error: any) {
      setUploadStatus('error');
      setErrorMessage(
        error.data?.error || error.message || 'USB-Update konnte nicht geladen werden'
      );
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

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<
      string,
      {
        variant: 'default' | 'secondary' | 'destructive' | 'outline';
        label: string;
        className?: string;
      }
    > = {
      completed: {
        variant: 'secondary',
        label: 'Abgeschlossen',
        className: 'bg-[rgba(16,185,129,0.15)] text-emerald-400 border-emerald-500/20',
      },
      failed: { variant: 'destructive', label: 'Fehlgeschlagen' },
      in_progress: {
        variant: 'secondary',
        label: 'In Bearbeitung',
        className: 'bg-[rgba(245,158,11,0.15)] text-amber-400 border-amber-500/20',
      },
      validated: {
        variant: 'secondary',
        label: 'Validiert',
        className:
          'bg-[rgba(69,173,255,0.15)] text-[var(--primary-color)] border-[var(--primary-color)]/20',
      },
      rolled_back: {
        variant: 'secondary',
        label: 'Zurückgesetzt',
        className: 'bg-[rgba(245,158,11,0.15)] text-amber-400 border-amber-500/20',
      },
      signature_verified: {
        variant: 'secondary',
        label: 'Signatur OK',
        className:
          'bg-[rgba(69,173,255,0.15)] text-[var(--primary-color)] border-[var(--primary-color)]/20',
      },
    };

    const config = statusConfig[status];

    if (!config) {
      return (
        <Badge variant="outline" className="badge badge-neutral">
          {status}
        </Badge>
      );
    }

    return (
      <Badge
        variant={config.variant}
        className={cn(
          `badge badge-${status === 'completed' ? 'success' : status === 'failed' ? 'error' : status === 'in_progress' || status === 'rolled_back' ? 'warning' : 'info'}`,
          config.className
        )}
      >
        {config.label}
      </Badge>
    );
  };

  const getCurrentStepDescription = (step: string) => {
    const steps: Record<string, string> = {
      backup: 'Backup wird erstellt...',
      loading_images: 'Docker-Images werden geladen...',
      migrations: 'Datenbank-Migrationen werden ausgefuehrt...',
      updating_services: 'Services werden aktualisiert...',
      healthchecks: 'Gesundheitspruefungen laufen...',
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
    <div className="update-page animate-[fadeIn_0.3s_ease]">
      <div className="update-header mb-8 pb-6 border-b border-[var(--border-subtle)]">
        <h2 className="text-3xl font-bold text-[var(--text-primary)] mb-2">System-Updates</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Updates sicher hochladen und installieren
        </p>
      </div>

      {/* USB Device Detection */}
      {uploadStatus === 'idle' && (
        <div className="update-section bg-[rgba(16,25,35,0.4)] border border-[rgba(69,173,255,0.15)] rounded-xl p-8 mb-6 shadow-md backdrop-blur-sm transition-all duration-300 hover:border-[rgba(69,173,255,0.3)] hover:shadow-lg hover:-translate-y-0.5">
          <div className="section-header-row flex items-center justify-between mb-5">
            <h3 className="!m-0 text-[var(--text-primary)] text-lg font-semibold">
              <HardDrive className="inline-block mr-2 align-middle" size={18} />
              USB-Update erkennen
            </h3>
            <button
              type="button"
              onClick={scanUsbDevices}
              disabled={usbScanning}
              className="btn-icon bg-[rgba(69,173,255,0.1)] border border-[rgba(69,173,255,0.2)] rounded-md p-2 cursor-pointer text-[var(--text-secondary)] transition-all flex items-center justify-center hover:bg-[rgba(69,173,255,0.2)] hover:text-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed"
              title="Erneut scannen"
            >
              <RefreshCw className={cn('size-4', usbScanning && 'animate-spin')} />
            </button>
          </div>

          {usbDevices.length > 0 ? (
            <div className="flex flex-col gap-3">
              {usbDevices.map((device, idx) => (
                <div
                  key={idx}
                  className="usb-device-card flex items-center justify-between p-4 px-5 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.15)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.1)] hover:border-[rgba(69,173,255,0.3)]"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-[var(--text-primary)] font-semibold text-sm">
                      {device.name}
                    </span>
                    <span className="text-[var(--text-muted)] text-xs">
                      {device.device} &middot; {formatFileSize(device.size)}
                    </span>
                  </div>
                  <Button type="button" onClick={() => handleUsbInstall(device)} size="sm">
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
      <div className="update-section bg-[rgba(16,25,35,0.4)] border border-[rgba(69,173,255,0.15)] rounded-xl p-8 mb-6 shadow-md backdrop-blur-sm transition-all duration-300 hover:border-[rgba(69,173,255,0.3)] hover:shadow-lg hover:-translate-y-0.5">
        <h3 className="mb-6 text-[var(--text-primary)] text-lg font-semibold">
          Update-Paket hochladen
        </h3>

        {uploadStatus === 'idle' && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col">
              <label
                htmlFor="update-file"
                className="file-label flex items-center gap-4 p-5 px-6 bg-[rgba(69,173,255,0.05)] border-2 border-dashed border-[rgba(69,173,255,0.2)] rounded-xl cursor-pointer transition-all relative overflow-hidden hover:bg-[rgba(69,173,255,0.12)] hover:border-[rgba(69,173,255,0.4)] hover:-translate-y-1 hover:shadow-lg"
              >
                <Package className="text-[var(--primary-color)]" size={24} />
                <span className="flex-1 text-[var(--text-secondary)] font-medium text-sm">
                  {selectedFile ? selectedFile.name : '.araupdate Datei auswählen'}
                </span>
              </label>
              <input
                id="update-file"
                type="file"
                accept=".araupdate"
                onChange={handleFileSelect}
                className="file-input hidden"
              />
            </div>

            <div className="flex flex-col">
              <label
                htmlFor="signature-file"
                className="file-label secondary flex items-center gap-4 p-5 px-6 bg-[rgba(139,92,246,0.05)] border-2 border-dashed border-[rgba(69,173,255,0.2)] rounded-xl cursor-pointer transition-all relative overflow-hidden hover:bg-[rgba(139,92,246,0.08)] hover:border-[rgba(69,173,255,0.4)] hover:-translate-y-1 hover:shadow-lg"
              >
                <Lock className="text-[var(--primary-color)]" size={24} />
                <span className="flex-1 text-[var(--text-secondary)] font-medium text-sm">
                  {signatureFile
                    ? signatureFile.name
                    : '.sig Signaturdatei auswählen (erforderlich)'}
                </span>
              </label>
              <input
                id="signature-file"
                type="file"
                accept=".sig"
                onChange={handleSignatureSelect}
                className="file-input hidden"
              />
            </div>

            <Button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || !signatureFile}
              className="w-full py-4 text-sm font-semibold shadow-md"
              size="lg"
            >
              Hochladen & Validieren
            </Button>
          </div>
        )}

        {uploadStatus === 'uploading' && (
          <div className="text-center py-8 px-6">
            <p className="mb-5 text-[var(--text-secondary)] font-medium text-sm">
              Update-Paket wird hochgeladen...
            </p>
            <div className="progress-bar h-2 bg-[rgba(69,173,255,0.1)] rounded-sm overflow-hidden relative my-5">
              <div
                className="progress-fill h-full bg-gradient-to-r from-[var(--primary-color)] to-[var(--primary-hover,#3d9ee6)] rounded-sm transition-[width] duration-300 relative overflow-hidden"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="mt-3 text-base font-semibold text-[var(--primary-color)]">
              {uploadProgress}%
            </p>
          </div>
        )}

        {uploadStatus === 'validated' && validationResult && (
          <div className="validation-result p-6 bg-[rgba(16,185,129,0.05)] border border-[rgba(16,185,129,0.2)] rounded-md">
            <div className="flex items-center gap-4 mb-6">
              <div className="result-icon success w-10 h-10 flex items-center justify-center rounded-full bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] shrink-0">
                <CheckCircle size={20} />
              </div>
              <h4 className="text-[var(--text-primary)] text-lg font-semibold">
                Update-Paket validiert
              </h4>
            </div>

            <div className="flex flex-col gap-3 mb-6">
              <div className="flex justify-between p-3.5 px-4 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.08)] hover:border-[rgba(69,173,255,0.25)] hover:translate-x-1">
                <span className="font-semibold text-[var(--text-muted)] text-sm">Version:</span>
                <span className="text-[var(--text-primary)] font-medium text-sm">
                  {validationResult.version}
                </span>
              </div>
              {validationResult.size && (
                <div className="flex justify-between p-3.5 px-4 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.08)] hover:border-[rgba(69,173,255,0.25)] hover:translate-x-1">
                  <span className="font-semibold text-[var(--text-muted)] text-sm">Größe:</span>
                  <span className="text-[var(--text-primary)] font-medium text-sm">
                    {formatFileSize(validationResult.size)}
                  </span>
                </div>
              )}
              <div className="flex justify-between p-3.5 px-4 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.08)] hover:border-[rgba(69,173,255,0.25)] hover:translate-x-1">
                <span className="font-semibold text-[var(--text-muted)] text-sm">Komponenten:</span>
                <span className="text-[var(--text-primary)] font-medium text-sm">
                  {validationResult.components?.length || 0}
                </span>
              </div>
              <div className="flex justify-between p-3.5 px-4 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.08)] hover:border-[rgba(69,173,255,0.25)] hover:translate-x-1">
                <span className="font-semibold text-[var(--text-muted)] text-sm">
                  Neustart erforderlich:
                </span>
                <span className="text-[var(--text-primary)] font-medium text-sm">
                  {validationResult.requires_reboot ? 'Ja' : 'Nein'}
                </span>
              </div>
              {validationResult.source === 'usb' && (
                <div className="flex justify-between p-3.5 px-4 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md transition-all hover:bg-[rgba(69,173,255,0.08)] hover:border-[rgba(69,173,255,0.25)] hover:translate-x-1">
                  <span className="font-semibold text-[var(--text-muted)] text-sm">Quelle:</span>
                  <span className="text-[var(--text-primary)] font-medium text-sm">USB-Gerät</span>
                </div>
              )}
            </div>

            {validationResult.components && validationResult.components.length > 0 && (
              <div className="my-5 p-5 bg-[rgba(69,173,255,0.05)] border border-[rgba(69,173,255,0.1)] rounded-md">
                <h5 className="mb-4 text-[var(--text-primary)] text-sm font-semibold">
                  Aktualisierte Komponenten:
                </h5>
                <ul className="m-0 pl-6">
                  {validationResult.components.map((comp: any, idx: number) => (
                    <li key={idx} className="my-2 text-[var(--text-secondary)] text-sm">
                      {typeof comp === 'string' ? comp : comp.name || String(comp)}{' '}
                      {typeof comp !== 'string' && comp.version_to && `(v${comp.version_to})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex gap-4 mt-6 max-md:flex-col">
              <Button
                type="button"
                onClick={handleApplyUpdate}
                className="flex-1 py-4 font-semibold shadow-md"
                size="lg"
              >
                Update installieren
              </Button>
              <Button
                type="button"
                onClick={handleReset}
                variant="outline"
                className="flex-1 py-4 font-semibold"
                size="lg"
              >
                Abbrechen
              </Button>
            </div>
          </div>
        )}

        {uploadStatus === 'applying' && updateStatus && (
          <div className="text-center py-8 px-6">
            <div className="flex items-center justify-center gap-4 mb-6">
              <Settings className="text-[var(--primary-color)] animate-spin" size={28} />
              <h4 className="text-[var(--text-primary)] text-lg font-semibold">
                Update wird installiert...
              </h4>
            </div>

            <div className="my-5 py-4 px-5 bg-[rgba(69,173,255,0.08)] border-l-[3px] border-l-[var(--primary-color)] rounded-sm">
              <p className="!m-0 text-[var(--primary-color)] font-medium text-sm">
                {getCurrentStepDescription(updateStatus.currentStep || '')}
              </p>
            </div>

            <div className="progress-bar animated h-2 bg-[rgba(69,173,255,0.1)] rounded-sm overflow-hidden relative my-5">
              <div className="progress-fill h-full bg-gradient-to-r from-[var(--primary-color)] to-[var(--primary-hover,#3d9ee6)] rounded-sm w-full animate-[progressSlide_2s_ease-in-out_infinite]"></div>
            </div>

            <p className="mt-6 text-[var(--warning-color)] font-medium text-sm">
              Bitte diese Seite nicht schließen und das Gerät nicht ausschalten.
            </p>

            {updateStatus.startTime && (
              <p className="mt-3 text-[var(--text-muted)] text-sm">
                Gestartet: {formatDate(updateStatus.startTime)}
              </p>
            )}
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="update-result success text-center p-10 px-6 rounded-md bg-[var(--status-neutral-bg)] border border-[var(--status-neutral-border)]">
            <div className="result-icon w-[60px] h-[60px] flex items-center justify-center rounded-full bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] mx-auto mb-4">
              <CheckCircle size={32} />
            </div>
            <h4 className="text-[var(--text-primary)] text-xl font-semibold mb-3">
              Update erfolgreich installiert!
            </h4>
            <p className="text-[var(--text-secondary)] text-sm my-3">
              Das System wurde auf Version {validationResult?.version} aktualisiert.
            </p>
            {validationResult?.requires_reboot && (
              <p className="mt-6 py-4 px-5 bg-[var(--warning-alpha-10)] border-2 border-[var(--warning-alpha-30)] rounded-md text-[var(--warning-color)] font-medium text-sm">
                <AlertCircle className="inline mr-2" size={16} />
                Systemneustart erforderlich. Bitte starten Sie das System neu.
              </p>
            )}
            <Button
              type="button"
              onClick={handleReset}
              className="mt-6 px-8 py-4 font-semibold shadow-md"
              size="lg"
            >
              Weiteres Update hochladen
            </Button>
          </div>
        )}

        {uploadStatus === 'error' && errorMessage && (
          <div className="update-result error text-center p-10 px-6 rounded-md bg-[rgba(239,68,68,0.08)] border border-[var(--danger-alpha-20)]">
            <div className="result-icon w-[60px] h-[60px] flex items-center justify-center rounded-full bg-[var(--danger-alpha-15)] text-[var(--error-color)] mx-auto mb-4">
              <XCircle size={32} />
            </div>
            <h4 className="text-[var(--text-primary)] text-xl font-semibold mb-3">
              Update fehlgeschlagen
            </h4>
            <p className="error-message font-medium text-base text-[var(--error-color)] my-3">
              {errorMessage}
            </p>
            <Button
              type="button"
              onClick={handleReset}
              className="mt-6 px-8 py-4 font-semibold shadow-md"
              size="lg"
            >
              Erneut versuchen
            </Button>
          </div>
        )}
      </div>

      {/* Update History */}
      <div className="update-section bg-[rgba(16,25,35,0.4)] border border-[rgba(69,173,255,0.15)] rounded-xl p-8 mb-6 shadow-md backdrop-blur-sm transition-all duration-300 hover:border-[rgba(69,173,255,0.3)] hover:shadow-lg hover:-translate-y-0.5">
        <h3 className="mb-6 text-[var(--text-primary)] text-lg font-semibold">Update-Verlauf</h3>

        {updateHistory.length === 0 ? (
          <EmptyState icon={<Package />} title="Kein Update-Verlauf vorhanden" />
        ) : (
          <div className="history-table overflow-x-auto mt-2">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Datum
                  </th>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Von Version
                  </th>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Auf Version
                  </th>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Quelle
                  </th>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Status
                  </th>
                  <th className="p-4 text-left bg-[var(--bg-table-header)] text-[var(--text-muted)] font-semibold uppercase tracking-wide text-xs">
                    Dauer
                  </th>
                </tr>
              </thead>
              <tbody>
                {updateHistory.map(update => (
                  <tr key={update.id} className="hover:bg-[rgba(69,173,255,0.03)]">
                    <td
                      data-label="Datum"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {formatDate(update.started_at || update.timestamp || '')}
                    </td>
                    <td
                      data-label="Von"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {update.version_from}
                    </td>
                    <td
                      data-label="Auf"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {update.version_to}
                    </td>
                    <td
                      data-label="Quelle"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {update.source === 'usb'
                        ? 'USB'
                        : update.source === 'dashboard'
                          ? 'Dashboard'
                          : update.source}
                    </td>
                    <td
                      data-label="Status"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {getStatusBadge(update.status)}
                    </td>
                    <td
                      data-label="Dauer"
                      className="p-4 text-left border-b border-[var(--border-subtle)] text-sm text-[var(--text-secondary)]"
                    >
                      {update.duration_seconds
                        ? `${Math.round(update.duration_seconds / 60)}m`
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default UpdatePage;
