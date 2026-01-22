import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FiPackage, FiLock, FiCheckCircle, FiXCircle, FiSettings, FiAlertCircle } from 'react-icons/fi';
import { formatDate } from '../utils/formatting';
import './UpdatePage.css';

const UpdatePage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [signatureFile, setSignatureFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, validating, validated, applying, success, error
  const [validationResult, setValidationResult] = useState(null);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [updateHistory, setUpdateHistory] = useState([]);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Fetch update history on mount
  useEffect(() => {
    fetchUpdateHistory();
  }, []);

  // Poll update status when applying
  useEffect(() => {
    if (uploadStatus === 'applying') {
      const interval = setInterval(() => {
        fetchUpdateStatus();
      }, 2000); // Poll every 2 seconds

      setPollingInterval(interval);

      return () => {
        if (interval) clearInterval(interval);
      };
    } else {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
    }
  }, [uploadStatus]);

  const fetchUpdateHistory = async () => {
    try {
      const response = await axios.get('/api/update/history');
      setUpdateHistory(response.data.updates || []);
    } catch (error) {
      console.error('Failed to fetch update history:', error);
    }
  };

  const fetchUpdateStatus = async () => {
    try {
      const response = await axios.get('/api/update/status');
      setUpdateStatus(response.data);

      if (response.data.status === 'completed') {
        setUploadStatus('success');
        fetchUpdateHistory();
      } else if (response.data.status === 'failed') {
        setUploadStatus('error');
        setErrorMessage(response.data.error || 'Update failed');
      }
    } catch (error) {
      console.error('Failed to fetch update status:', error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.araupdate')) {
      setSelectedFile(file);
      setErrorMessage('');
      setValidationResult(null);
      setUploadStatus('idle');
    } else {
      setErrorMessage('Please select a valid .araupdate file');
      setSelectedFile(null);
    }
  };

  const handleSignatureSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.name.endsWith('.sig')) {
      setSignatureFile(file);
    } else {
      setErrorMessage('Please select a valid .sig signature file');
      setSignatureFile(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select an update file');
      return;
    }

    setUploadStatus('uploading');
    setErrorMessage('');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (signatureFile) {
      formData.append('signature', signatureFile);
    }

    try {
      const response = await axios.post('/api/update/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        },
      });

      setUploadStatus('validated');
      setValidationResult(response.data);
      setUploadProgress(100);
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(
        error.response?.data?.error || 'Upload failed. Please try again.'
      );
      setUploadProgress(0);
    }
  };

  const handleApplyUpdate = async () => {
    if (!validationResult || !validationResult.file_path) {
      setErrorMessage('No validated update available');
      return;
    }

    setUploadStatus('applying');
    setErrorMessage('');

    try {
      const response = await axios.post('/api/update/apply', {
        file_path: validationResult.file_path,
      });

      if (response.data.status === 'started') {
        // Start polling for status
        fetchUpdateStatus();
      }
    } catch (error) {
      setUploadStatus('error');
      setErrorMessage(
        error.response?.data?.error || 'Failed to start update process'
      );
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

  const getStatusBadge = (status) => {
    const statusColors = {
      completed: 'success',
      failed: 'error',
      in_progress: 'warning',
      validated: 'info',
      rolled_back: 'warning',
    };

    return (
      <span className={`status-badge status-${statusColors[status] || 'default'}`}>
        {status}
      </span>
    );
  };

  const getCurrentStepDescription = (step) => {
    const steps = {
      backup: 'Creating backup...',
      loading_images: 'Loading Docker images...',
      migrations: 'Running database migrations...',
      updating_services: 'Updating services...',
      healthchecks: 'Running health checks...',
      done: 'Update completed!',
    };

    return steps[step] || `Processing: ${step}`;
  };

  return (
    <div className="update-page">
      <div className="update-header">
        <h2>System Updates</h2>
        <p>Upload and apply system updates securely</p>
      </div>

      {/* Upload Section */}
      <div className="update-section">
        <h3>Upload Update Package</h3>

        {uploadStatus === 'idle' && (
          <div className="upload-area">
            <div className="file-input-group">
              <label htmlFor="update-file" className="file-label">
                <FiPackage className="file-icon" />
                <span className="file-text">
                  {selectedFile ? selectedFile.name : 'Select .araupdate file'}
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
                  {signatureFile ? signatureFile.name : 'Select .sig file (optional)'}
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
              onClick={handleUpload}
              disabled={!selectedFile}
              className="btn btn-primary"
            >
              Upload & Validate
            </button>
          </div>
        )}

        {uploadStatus === 'uploading' && (
          <div className="upload-progress">
            <p>Uploading update package...</p>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${uploadProgress}%` }}
              ></div>
            </div>
            <p className="progress-text">{uploadProgress}%</p>
          </div>
        )}

        {uploadStatus === 'validated' && validationResult && (
          <div className="validation-result">
            <div className="result-header">
              <FiCheckCircle className="result-icon success" />
              <h4>Update Package Validated</h4>
            </div>

            <div className="result-details">
              <div className="detail-row">
                <span className="detail-label">Version:</span>
                <span className="detail-value">{validationResult.version}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Size:</span>
                <span className="detail-value">
                  {(validationResult.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Components:</span>
                <span className="detail-value">
                  {validationResult.components?.length || 0}
                </span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Requires Reboot:</span>
                <span className="detail-value">
                  {validationResult.requires_reboot ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {validationResult.components && validationResult.components.length > 0 && (
              <div className="components-list">
                <h5>Updated Components:</h5>
                <ul>
                  {validationResult.components.map((comp, idx) => (
                    <li key={idx}>
                      {comp.name} {comp.version_to && `(v${comp.version_to})`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="action-buttons">
              <button onClick={handleApplyUpdate} className="btn btn-success">
                Apply Update
              </button>
              <button onClick={handleReset} className="btn btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        {uploadStatus === 'applying' && updateStatus && (
          <div className="update-progress">
            <div className="progress-header">
              <FiSettings className="progress-icon" />
              <h4>Applying Update...</h4>
            </div>

            <div className="current-step">
              <p>{getCurrentStepDescription(updateStatus.currentStep)}</p>
            </div>

            <div className="progress-bar animated">
              <div className="progress-fill"></div>
            </div>

            <p className="progress-note">
              Please do not close this page or power off the device.
            </p>

            {updateStatus.startTime && (
              <p className="progress-time">
                Started: {formatDate(updateStatus.startTime)}
              </p>
            )}
          </div>
        )}

        {uploadStatus === 'success' && (
          <div className="update-result success">
            <FiCheckCircle className="result-icon" />
            <h4>Update Applied Successfully!</h4>
            <p>System has been updated to version {validationResult?.version}</p>
            {validationResult?.requires_reboot && (
              <p className="reboot-warning">
                <FiAlertCircle style={{ display: 'inline', marginRight: '0.5rem' }} />
                System reboot required. Please restart the system.
              </p>
            )}
            <button onClick={handleReset} className="btn btn-primary">
              Upload Another Update
            </button>
          </div>
        )}

        {uploadStatus === 'error' && errorMessage && (
          <div className="update-result error">
            <FiXCircle className="result-icon" />
            <h4>Update Failed</h4>
            <p className="error-message">{errorMessage}</p>
            <button onClick={handleReset} className="btn btn-primary">
              Try Again
            </button>
          </div>
        )}
      </div>

      {/* Update History */}
      <div className="update-section">
        <h3>Update History</h3>

        {updateHistory.length === 0 ? (
          <p className="no-data">No update history available</p>
        ) : (
          <div className="history-table">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>From Version</th>
                  <th>To Version</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {updateHistory.map((update) => (
                  <tr key={update.id}>
                    <td>{formatDate(update.started_at)}</td>
                    <td>{update.version_from}</td>
                    <td>{update.version_to}</td>
                    <td>{update.source}</td>
                    <td>{getStatusBadge(update.status)}</td>
                    <td>
                      {update.duration_seconds
                        ? `${Math.round(update.duration_seconds / 60)}m`
                        : 'N/A'}
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
