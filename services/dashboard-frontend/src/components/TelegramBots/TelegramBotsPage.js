/**
 * TelegramBotsPage - Main page for managing multiple Telegram bots
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiMessageCircle,
  FiPlus,
  FiAlertCircle,
  FiRefreshCw,
  FiAlertTriangle,
} from 'react-icons/fi';
import { API_BASE } from '../../config/api';
import { useToast } from '../../contexts/ToastContext';
import BotCard from './BotCard';
import BotSetupWizard from './BotSetupWizard';
import BotDetailsModal from './BotDetailsModal';
import Modal from '../Modal';
import './TelegramBots.css';

function TelegramBotsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [deleteBot, setDeleteBot] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Auth headers
  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('arasul_token');
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }, []);

  // Fetch all bots
  const fetchBots = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/telegram-bots`, {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Fehler beim Laden der Bots');
      }

      const data = await response.json();
      setBots(data.bots || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching bots:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchBots();
  }, [fetchBots]);

  // Loading timeout - show message after 15s
  useEffect(() => {
    if (loading) {
      const timeout = setTimeout(() => setLoadingTimeout(true), 15000);
      return () => clearTimeout(timeout);
    }
    setLoadingTimeout(false);
  }, [loading]);

  // Handle bot created
  const handleBotCreated = newBot => {
    setBots(prev => [newBot, ...prev]);
    setShowWizard(false);
  };

  // Handle bot updated
  const handleBotUpdated = updatedBot => {
    setBots(prev => prev.map(bot => (bot.id === updatedBot.id ? { ...bot, ...updatedBot } : bot)));
    setSelectedBot(null);
  };

  // Handle activate/deactivate
  const handleToggleActive = async (botId, activate) => {
    try {
      const endpoint = activate ? 'activate' : 'deactivate';
      const response = await fetch(`${API_BASE}/telegram-bots/${botId}/${endpoint}`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Aktion fehlgeschlagen');
      }

      const data = await response.json();
      setBots(prev =>
        prev.map(bot => (bot.id === botId ? { ...bot, isActive: data.bot.is_active } : bot))
      );
    } catch (err) {
      console.error('Error toggling bot:', err);
      toast.error(err.message);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteBot) return;

    setDeleting(true);
    try {
      const response = await fetch(`${API_BASE}/telegram-bots/${deleteBot.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error('Löschen fehlgeschlagen');
      }

      setBots(prev => prev.filter(bot => bot.id !== deleteBot.id));
      setDeleteBot(null);
    } catch (err) {
      console.error('Error deleting bot:', err);
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="telegram-bots-page">
        <div className="bots-loading">
          <div className="loading-spinner" />
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Lade Bots...</p>
          {loadingTimeout && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--warning-color)', marginBottom: '1rem' }}>
                <FiAlertTriangle style={{ marginRight: '0.5rem', verticalAlign: 'middle' }} />
                Laden dauert länger als erwartet.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  className="add-bot-btn"
                  onClick={() => {
                    setLoading(true);
                    setLoadingTimeout(false);
                    fetchBots();
                  }}
                >
                  <FiRefreshCw /> Erneut versuchen
                </button>
                <button
                  className="add-bot-btn"
                  onClick={() => navigate('/')}
                  style={{ background: 'var(--bg-card)' }}
                >
                  Zurück zum Dashboard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="telegram-bots-page">
        <div className="bots-error">
          <FiAlertCircle className="bots-error-icon" />
          <h3>Fehler beim Laden</h3>
          <p>{error}</p>
          <button className="add-bot-btn" onClick={fetchBots} style={{ marginTop: '1rem' }}>
            <FiRefreshCw /> Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="telegram-bots-page">
      {/* Header */}
      <div className="telegram-bots-header">
        <h1 className="telegram-bots-title">
          <FiMessageCircle />
          Telegram Bots
        </h1>
        <button className="add-bot-btn" onClick={() => setShowWizard(true)}>
          <FiPlus />
          Neuer Bot
        </button>
      </div>

      {/* Bot Grid or Empty State */}
      {bots.length === 0 ? (
        <div className="bots-empty">
          <FiMessageCircle className="bots-empty-icon" />
          <h3 className="bots-empty-title">Noch keine Bots</h3>
          <p className="bots-empty-text">Erstelle deinen ersten Telegram Bot, um loszulegen.</p>
          <button className="add-bot-btn" onClick={() => setShowWizard(true)}>
            <FiPlus />
            Bot erstellen
          </button>
        </div>
      ) : (
        <div className="bots-grid">
          {bots.map(bot => (
            <BotCard
              key={bot.id}
              bot={bot}
              onEdit={() => setSelectedBot(bot)}
              onToggleActive={activate => handleToggleActive(bot.id, activate)}
              onDelete={() => setDeleteBot(bot)}
            />
          ))}
        </div>
      )}

      {/* Setup Wizard Modal */}
      <Modal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        title="Neuen Bot erstellen"
        size="large"
      >
        <BotSetupWizard onComplete={handleBotCreated} onCancel={() => setShowWizard(false)} />
      </Modal>

      {/* Edit Bot Modal */}
      {selectedBot && (
        <BotDetailsModal
          bot={selectedBot}
          onClose={() => setSelectedBot(null)}
          onSave={handleBotUpdated}
          onRefresh={fetchBots}
        />
      )}

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteBot}
        onClose={() => setDeleteBot(null)}
        title="Bot löschen"
        size="small"
      >
        <div style={{ textAlign: 'center', padding: '1rem 0' }}>
          <FiAlertCircle
            style={{ fontSize: '2.5rem', color: 'var(--danger-color)', marginBottom: '1rem' }}
          />
          <p style={{ marginBottom: '0.5rem' }}>
            Möchtest du <strong>{deleteBot?.name}</strong> wirklich löschen?
          </p>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Alle Commands und Chat-Verbindungen werden ebenfalls gelöscht.
          </p>
        </div>
        <div className="modal-actions" style={{ marginTop: '1.5rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => setDeleteBot(null)}
            disabled={deleting}
          >
            Abbrechen
          </button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Lösche...' : 'Löschen'}
          </button>
        </div>
      </Modal>
    </div>
  );
}

export default TelegramBotsPage;
