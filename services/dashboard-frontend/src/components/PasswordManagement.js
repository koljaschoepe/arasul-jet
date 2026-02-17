import React, { useState, useEffect } from 'react';
import { FiLock, FiEye, FiEyeOff, FiCheck, FiX, FiAlertCircle } from 'react-icons/fi';
import { API_BASE, getAuthHeaders } from '../config/api';

function PasswordManagement() {
  const [activeService, setActiveService] = useState('dashboard');
  const [passwords, setPasswords] = useState({
    dashboard: { current: '', new: '', confirm: '' },
    minio: { current: '', new: '', confirm: '' },
    n8n: { current: '', new: '', confirm: '' },
  });
  const [showPasswords, setShowPasswords] = useState({
    dashboard: { current: false, new: false, confirm: false },
    minio: { current: false, new: false, confirm: false },
    n8n: { current: false, new: false, confirm: false },
  });
  const [requirements, setRequirements] = useState(null);
  const [validations, setValidations] = useState({
    minLength: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
    match: false,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchPasswordRequirements();
  }, []);

  useEffect(() => {
    validatePassword();
  }, [passwords, activeService]);

  const fetchPasswordRequirements = async () => {
    try {
      const response = await fetch(`${API_BASE}/settings/password-requirements`, {
        headers: getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setRequirements(data.requirements);
      }
    } catch (error) {
      console.error('Failed to fetch password requirements:', error);
    }
  };

  const validatePassword = () => {
    const newPass = passwords[activeService].new;
    const confirmPass = passwords[activeService].confirm;

    if (!requirements) return;

    setValidations({
      minLength: newPass.length >= requirements.minLength,
      uppercase: requirements.requireUppercase ? /[A-Z]/.test(newPass) : true,
      lowercase: requirements.requireLowercase ? /[a-z]/.test(newPass) : true,
      number: requirements.requireNumbers ? /[0-9]/.test(newPass) : true,
      special: requirements.requireSpecialChars
        ? /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPass)
        : true,
      match: newPass.length > 0 && newPass === confirmPass,
    });
  };

  const handleInputChange = (service, field, value) => {
    setPasswords(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        [field]: value,
      },
    }));
    setMessage(null);
  };

  const togglePasswordVisibility = (service, field) => {
    setShowPasswords(prev => ({
      ...prev,
      [service]: {
        ...prev[service],
        [field]: !prev[service][field],
      },
    }));
  };

  const isFormValid = () => {
    const current = passwords[activeService];
    return (
      current.current &&
      current.new &&
      current.confirm &&
      Object.values(validations).every(v => v === true)
    );
  };

  const handleSubmit = async e => {
    e.preventDefault();

    if (!isFormValid()) {
      setMessage({
        type: 'error',
        text: 'Bitte überprüfen Sie alle Felder und Anforderungen',
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${API_BASE}/settings/password/${activeService}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          currentPassword: passwords[activeService].current,
          newPassword: passwords[activeService].new,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Fehler beim Ändern des Passworts');
      }

      setMessage({
        type: 'success',
        text: data.message || 'Passwort erfolgreich geändert',
      });

      // Reset form
      setPasswords(prev => ({
        ...prev,
        [activeService]: { current: '', new: '', confirm: '' },
      }));

      // If dashboard password was changed, user needs to re-login
      if (activeService === 'dashboard') {
        setTimeout(() => {
          localStorage.removeItem('arasul_token');
          localStorage.removeItem('arasul_user');
          window.location.href = '/';
        }, 2000);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error.message || 'Fehler beim Ändern des Passworts',
      });
    } finally {
      setLoading(false);
    }
  };

  const services = [
    { id: 'dashboard', label: 'Dashboard', icon: '🖥️' },
    { id: 'minio', label: 'MinIO', icon: '📦' },
    { id: 'n8n', label: 'n8n', icon: '🔄' },
  ];

  return (
    <div className="password-management">
      <div className="password-header">
        <FiLock className="password-icon" />
        <div>
          <h2>Passwortverwaltung</h2>
          <p>Ändern Sie die Passwörter für Dashboard, MinIO und n8n</p>
        </div>
      </div>

      {/* Service Selector */}
      <div className="service-selector">
        {services.map(service => (
          <button
            key={service.id}
            className={`service-button ${activeService === service.id ? 'active' : ''}`}
            onClick={() => {
              setActiveService(service.id);
              setMessage(null);
            }}
          >
            <span className="service-icon">{service.icon}</span>
            <span>{service.label}</span>
          </button>
        ))}
      </div>

      {/* Password Change Form */}
      <form onSubmit={handleSubmit} className="password-form">
        {/* Current Password */}
        <div className="form-group">
          <label>Aktuelles Dashboard-Passwort</label>
          <div className="password-input-wrapper">
            <input
              type={showPasswords[activeService].current ? 'text' : 'password'}
              value={passwords[activeService].current}
              onChange={e => handleInputChange(activeService, 'current', e.target.value)}
              placeholder="Aktuelles Passwort eingeben"
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => togglePasswordVisibility(activeService, 'current')}
            >
              {showPasswords[activeService].current ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <small>Zur Sicherheit wird Ihr aktuelles Dashboard-Passwort benötigt</small>
        </div>

        {/* New Password */}
        <div className="form-group">
          <label>Neues Passwort</label>
          <div className="password-input-wrapper">
            <input
              type={showPasswords[activeService].new ? 'text' : 'password'}
              value={passwords[activeService].new}
              onChange={e => handleInputChange(activeService, 'new', e.target.value)}
              placeholder="Neues Passwort eingeben"
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => togglePasswordVisibility(activeService, 'new')}
            >
              {showPasswords[activeService].new ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="form-group">
          <label>Passwort bestätigen</label>
          <div className="password-input-wrapper">
            <input
              type={showPasswords[activeService].confirm ? 'text' : 'password'}
              value={passwords[activeService].confirm}
              onChange={e => handleInputChange(activeService, 'confirm', e.target.value)}
              placeholder="Neues Passwort bestätigen"
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => togglePasswordVisibility(activeService, 'confirm')}
            >
              {showPasswords[activeService].confirm ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        {/* Password Requirements */}
        {requirements && passwords[activeService].new && (
          <div className="password-requirements">
            <h4>Passwortanforderungen</h4>
            <ul>
              <li className={validations.minLength ? 'valid' : 'invalid'}>
                {validations.minLength ? <FiCheck /> : <FiX />}
                Mindestens {requirements.minLength} Zeichen
              </li>
              {requirements.requireUppercase && (
                <li className={validations.uppercase ? 'valid' : 'invalid'}>
                  {validations.uppercase ? <FiCheck /> : <FiX />}
                  Mindestens ein Großbuchstabe
                </li>
              )}
              {requirements.requireLowercase && (
                <li className={validations.lowercase ? 'valid' : 'invalid'}>
                  {validations.lowercase ? <FiCheck /> : <FiX />}
                  Mindestens ein Kleinbuchstabe
                </li>
              )}
              {requirements.requireNumbers && (
                <li className={validations.number ? 'valid' : 'invalid'}>
                  {validations.number ? <FiCheck /> : <FiX />}
                  Mindestens eine Zahl
                </li>
              )}
              {requirements.requireSpecialChars && (
                <li className={validations.special ? 'valid' : 'invalid'}>
                  {validations.special ? <FiCheck /> : <FiX />}
                  Mindestens ein Sonderzeichen
                </li>
              )}
              <li className={validations.match ? 'valid' : 'invalid'}>
                {validations.match ? <FiCheck /> : <FiX />}
                Passwörter stimmen überein
              </li>
            </ul>
          </div>
        )}

        {/* Message */}
        {message && (
          <div className={`password-message ${message.type}`}>
            <FiAlertCircle />
            <span>{message.text}</span>
          </div>
        )}

        {/* Submit Button */}
        <button type="submit" className="submit-button" disabled={!isFormValid() || loading}>
          {loading ? 'Wird geändert...' : 'Passwort ändern'}
        </button>

        {activeService === 'dashboard' && (
          <p className="warning-text">
            ⚠️ Nach dem Ändern des Dashboard-Passworts werden Sie automatisch abgemeldet.
          </p>
        )}

        {(activeService === 'minio' || activeService === 'n8n') && (
          <p className="info-text">
            ℹ️ Der {activeService === 'minio' ? 'MinIO' : 'n8n'}-Service wird nach der
            Passwortänderung automatisch neu gestartet.
          </p>
        )}
      </form>
    </div>
  );
}

export default PasswordManagement;
