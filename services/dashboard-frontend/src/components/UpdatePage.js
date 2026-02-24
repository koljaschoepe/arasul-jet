import React, { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE, getAuthHeaders } from '../config/api';
import {
  FiPackage,
  FiLock,
  FiCheckCircle,
  FiXCircle,
  FiSettings,
  FiAlertCircle,
  FiHardDrive,
  FiRefreshCw,
} from 'react-icons/fi';
import { formatDate } from '../utils/formatting';
import EmptyState from './EmptyState';
import './UpdatePage.css';

const UpdatePage = () => {
  // RC-003: AbortController for polling cleanup
  const pollingAbortRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, validating, validated, applying, success, error
  const [validationResult, setValidationResult] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [updateHistory, setUpdateHistory] = useState([]);
  const [usbDevices, setUsbDevices] = useState([]);
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

  const fetchUpdateHistory = async signal => {
    try {
      const response = await fetch(`${API_BASE}/update/history`, {
        headers: getAuthHeaders(),
        signal,
      });
      if (response.ok) {
        const data = await response.json();
        setUpdateHistory(data.updates || []);
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Failed to fetch update history:', error);
    }
  };

  const fetchUpdateStatus = async signal => {
    try {
      const response = await fetch(`${API_BASE}/update/status`, {
        headers: getAuthHeaders(),
        signal,
      });
      if (!response.ok) return;

      const data = await response.json();
      setUpdateStatus(data);

      if (data.status === 'completed') {
        setUploadStatus('success');
        fetchUpdateHistory();
      } else if (data.status === 'failed') {
        setUploadStatus('error');
        setErrorMessage(data.error || 'Update fehlgeschlagen');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      console.error('Failed to fetch update status:', error);
    }
  };

  const scanUsbDevices = useCallback(async () => {
    setUsbScanning(true);
    try {
      const response = await fetch(`${API_BASE}/update/usb-devices`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setUsbDevices(data.devices || []);
      }
    } catch (error) {
      console.error('Failed to scan USB devices:', error);
    } finally {
      setUsbScanning(false);
    }
  }, []);

  const handleFileSelect = event => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.araupdate')) {
      setSelectedFile(file);
      setErrorMessage('');
      setValidationResult(null);
      setUploadStatus('idle');
    } else {
      setErrorMessage('Bitte eine gueltige .araupdate Datei auswaehlen');
      setSelectedFile(null);
    }
  };

  const handleSignatureSelect = event => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.sig')) {
      setSignatureFile(file);
    } else {
      setErrorMessage('Bitte eine gueltige .sig Signaturdatei auswaehlen');
      setSignatureFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Bitte eine Update-Datei auswaehlen');
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

      await new Promise((resolve, reject) => {
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
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error.message || 'Upload fehlgeschlagen. Bitte erneut versuchen.');
      setUploadProgress(0);
    }
  };

  const handleApplyUpdate = async () => {
    if (!validationResult || !validationResult.file_path) {
      setErrorMessage('Kein validiertes Update verfuegbar');
      return;
    }

    setUploadStatus('applying');
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE}/update/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ file_path: validationResult.file_path }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'started') {
          fetchUpdateStatus();
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Update konnte nicht gestartet werden');
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error.message || 'Update-Prozess konnte nicht gestartet werden');
    }
  };

  const handleUsbInstall = async usbFile => {
    setUploadStatus('uploading');
    setUploadProgress(50);
    setErrorMessage('');

    try {
      const response = await fetch(`${API_BASE}/update/install-from-usb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ file_path: usbFile.path }),
      });

      if (response.ok) {
        const data = await response.json();
        setUploadStatus('validated');
        setValidationResult(data);
        setUploadProgress(100);
      } else {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'USB-Update Validierung fehlgeschlagen');
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(error.message || 'USB-Update konnte nicht geladen werden');
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

  const getStatusBadge = status => {
    const statusColors = {
      completed: 'success',
      failed: 'error',
      in_progress: 'warning',
      validated: 'info',
      rolled_back: 'warning',
    };

    const statusLabels = {
      completed: 'Abgeschlossen',
      failed: 'Fehlgeschlagen',
      in_progress: 'In Bearbeitung',
      validated: 'Validiert',
      rolled_back: 'Zurueckgesetzt',
      signature_verified: 'Signatur OK',
    };

    return (
      <span className={`badge badge-${statusColors[status] || 'neutral'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

  const getCurrentStepDescription = step => {
    const steps = {
      backup: 'Backup wird erstellt...',
      loading_images: 'Docker-Images werden geladen...',
      migrations: 'Datenbank-Migrationen werden ausgefuehrt...',
      updating_services: 'Services werden aktualisiert...',
      healthchecks: 'Gesundheitspruefungen laufen...',
      done: 'Update abgeschlossen!',
    };

    return steps[step] || `Verarbeitung: ${step}`;
  };

  const formatFileSize = bytes => {
    if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="update-page">
      <div className="update-header">
        <h2>System-Updates</h2>
        <p>Updates sicher hochladen und installieren</p>
      </div>

      {/* USB Device Detection */}
      {uploadStatus === 'idle' && (
        <div className="update-section">
          <div className="section-header-row">
            <h3>
              <FiHardDrive style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
              USB-Update erkennen
            </h3>
            <button
              type="button"
              onClick={scanUsbDevices}
              disabled={usbScanning}
              className="btn-icon"
              title="Erneut scannen"
            >
              <FiRefreshCw className={usbScanning ? 'spinning' : ''} />
            </button>
          </div>

          {usbDevices.length > 0 ? (
            <div className="usb-devices-list">
              {usbDevices.map((device, idx) => (
                <div key={idx} className="usb-device-card">
                  <div className="usb-device-info">
                    <span className="usb-device-name">{device.name}</span>
                    <span className="usb-device-meta">
                      {device.device} &middot; {formatFileSize(device.size)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUsbInstall(device)}
                    className="btn btn-primary btn-sm"
                  >
                    Installieren
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FiHardDrive />}
              title={usbScanning ? 'USB-Geraete werden gesucht...' : 'Kein USB-Geraet gefunden'}
              description={
                usbScanning ? undefined : 'Bitte USB-Stick einstecken und erneut scannen.'
              }
            />
          )}
        </div>
      )}

      {/* Upload Section */}
      <div className="update-section">
        <h3>Update-Paket hochladen</h3>

        {uploadStatus === 'idle' && (
          <div className="upload-area">
            <div className="file-input-group">
              <label htmlFor="update-file" className="file-label">
                <FiPackage className="file-icon" />
                <span className="file-text">
                  {selectedFile ? selectedFile.name : '.araupdate Datei auswaehlen'}
                </span>
              </label>
              <input
                id="update-file"
                type="file"
                accept=".araupdate"
                onChange={handleFileSelect}
                className="file-input"
              />
            </div>

            <div className="file-input-group">
              <label htmlFor="signature-file" className="file-label secondary">
                <FiLock className="file-icon" />
                <span className="file-text">
                  {signatureFile
                    ? signatureFile.name
                    : '.sig Signaturdatei auswaehlen (erforderlich)'}
                </span>
              </label>
              <input
                id="signature-file"
                type="file"
                accept=".sig"
                onChange={handleSignatureSelect}
                className="file-input"
              />
            </div>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || !signatureFile}
              className="btn btn-primary"
            >
              Hochladen & Validieren
            </button>
          </div>
        )}

        {uploadStatus === 'uploading' && (
          <div className="upload-progress">
            <p>Update-Paket wird hochgeladen...</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
            </div>
            <p className="progress-text">{uploadProgress}%</p>
          </div>
        )}

        {uploadStatus === 'validated' && validationResult && (
          <div className="validation-result">
            <div className="result-header">
              <FiCheckCircle className="result-icon success" />
              <h4>Update-Paket validiert</h4>
            </div>

            <div className="result-details">
              <div className="detail-row">
                <span className="detail-label">Version:</span>
                <span className="detail-value">{validationResult.version}</span>
              </div>
              {validationResult.size && (
                <div className="detail-row">
                  <span className="detail-label">Groesse:</span>
                  <span className="detail-value">{formatFileSize(validationResult.size)}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Komponenten:</span>
                <span className="detail-value">{validationResult.components?.length || 0}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Neustart erforderlich:</span>
                <span className="detail-value">
                  {validationResult.requires_reboot ? 'Ja' : 'Nein'}
                </span>
              </div>
              {validationResult.source === 'usb' && (
                <div className="detail-row">
                  <span className="detail-label">Quelle:</span>
                  <span className="detail-value">USB-Geraet</span>
                </div>
              )}
            </div>

            {validationResult.components && validationResult.components.length > 0 && (
              <div className="components-list">
                <h5>Aktualisierte Komponenten:</h5>
                <ul>
                  {validationResult.components.map((comp, idx) => (
                    <li key={idx}>
                      {comp.name || comp} {comp.version_to && `(v${comp.version_to})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="action-buttons">
              <button type="button" onClick={handleApplyUpdate} className="btn btn-success">
                Update installieren
              </button>
              <button type="button" onClick={handleReset} className="btn btn-secondary">
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {uploadStatus === 'applying' && updateStatus && (
          <div className="update-progress">
            <div className="progress-header">
              <FiSettings className="progress-icon" />
              <h4>Update wird installiert...</h4>
            </div>

            <div className="current-step">
              <p>{getCurrentStepDescription(updateStatus.currentStep)}</p>
            </div>

            <div className="progress-bar animated">
              <div className="progress-fill"></div>
            </div>

            <p className="progress-note">
              Bitte diese Seite nicht schliessen und das Geraet nicht ausschalten.
            </p>

            {updateStatus.startTime && (
              <p className="progress-time">Gestartet: {formatDate(updateStatus.startTime)}</p>
            )}
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="update-result success">
            <FiCheckCircle className="result-icon" />
            <h4>Update erfolgreich installiert!</h4>
            <p>Das System wurde auf Version {validationResult?.version} aktualisiert.</p>
            {validationResult?.requires_reboot && (
              <p className="reboot-warning">
                <FiAlertCircle style={{ display: 'inline', marginRight: '0.5rem' }} />
                Systemneustart erforderlich. Bitte starten Sie das System neu.
              </p>
            )}
            <button type="button" onClick={handleReset} className="btn btn-primary">
              Weiteres Update hochladen
            </button>
          </div>
        )}

        {uploadStatus === 'error' && errorMessage && (
          <div className="update-result error">
            <FiXCircle className="result-icon" />
            <h4>Update fehlgeschlagen</h4>
            <p className="error-message">{errorMessage}</p>
            <button type="button" onClick={handleReset} className="btn btn-primary">
              Erneut versuchen
            </button>
          </div>
        )}
      </div>

      {/* Update History */}
      <div className="update-section">
        <h3>Update-Verlauf</h3>

        {updateHistory.length === 0 ? (
          <EmptyState icon={<FiPackage />} title="Kein Update-Verlauf vorhanden" />
        ) : (
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Von Version</th>
                  <th>Auf Version</th>
                  <th>Quelle</th>
                  <th>Status</th>
                  <th>Dauer</th>
                </tr>
              </thead>
              <tbody>
                {updateHistory.map(update => (
                  <tr key={update.id}>
                    <td data-label="Datum">{formatDate(update.started_at || update.timestamp)}</td>
                    <td data-label="Von">{update.version_from}</td>
                    <td data-label="Auf">{update.version_to}</td>
                    <td data-label="Quelle">
                      {update.source === 'usb'
                        ? 'USB'
                        : update.source === 'dashboard'
                          ? 'Dashboard'
                          : update.source}
                    </td>
                    <td data-label="Status">{getStatusBadge(update.status)}</td>
                    <td data-label="Dauer">
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
