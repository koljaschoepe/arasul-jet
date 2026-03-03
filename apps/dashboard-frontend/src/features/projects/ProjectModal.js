import React, { memo, useState, useEffect } from 'react';
import { FiSave, FiAlertCircle, FiCheck, FiTrash2, FiDatabase } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import Modal from '../../components/ui/Modal';
import './projects.css';

const DEFAULT_COLOR = '#45ADFF';

const ProjectModal = memo(function ProjectModal({
  isOpen,
  onClose,
  onSave,
  project = null,
  mode = 'create',
}) {
  const api = useApi();
  const { confirm, ConfirmDialog } = useConfirm();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [knowledgeSpaceId, setKnowledgeSpaceId] = useState('');
  const [spaces, setSpaces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    api
      .get('/spaces', { signal: controller.signal, showError: false })
      .then(data => setSpaces(data.spaces || []))
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen, api]);

  useEffect(() => {
    if (isOpen) {
      if (project && mode === 'edit') {
        setName(project.name || '');
        setDescription(project.description || '');
        setSystemPrompt(project.system_prompt || '');
        setKnowledgeSpaceId(project.knowledge_space_id || '');
      } else {
        setName('');
        setDescription('');
        setSystemPrompt('');
        setKnowledgeSpaceId('');
      }
      setError(null);
      setSuccess(null);
    }
  }, [isOpen, project, mode]);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Bitte geben Sie einen Namen ein');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        icon: project?.icon || 'folder',
        color: project?.color || DEFAULT_COLOR,
        knowledge_space_id: knowledgeSpaceId || null,
      };
      let data;
      if (mode === 'edit' && project?.id) {
        data = await api.put(`/projects/${project.id}`, payload, { showError: false });
      } else {
        data = await api.post('/projects', payload, { showError: false });
      }
      setSuccess(mode === 'edit' ? 'Projekt aktualisiert' : 'Projekt erstellt');
      setTimeout(() => {
        onSave(data.project || data);
        onClose();
      }, 500);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!project?.id) return;
    if (
      !(await confirm({
        message: `Projekt "${project.name}" wirklich löschen? Chats werden zum Standard-Projekt verschoben.`,
      }))
    ) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.del(`/projects/${project.id}`, { showError: false });
      setSuccess('Projekt gelöscht');
      setTimeout(() => {
        onSave(null);
        onClose();
      }, 500);
    } catch (err) {
      setError(err.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? 'Projekt bearbeiten' : 'Neues Projekt'}
      size="medium"
      className="project-modal"
      footer={
        <div className="pm-footer">
          {mode === 'edit' && project && !project.is_default && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleDelete}
              disabled={saving}
            >
              <FiTrash2 />
              Löschen
            </button>
          )}
          <div className="pm-footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !name.trim()}
              onClick={handleSubmit}
            >
              {saving ? (
                'Speichern...'
              ) : (
                <>
                  <FiSave />
                  {mode === 'edit' ? 'Speichern' : 'Erstellen'}
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <div className="pm-body">
        {error && (
          <div className="pm-message pm-error">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="pm-message pm-success">
            <FiCheck />
            <span>{success}</span>
          </div>
        )}

        {/* Name */}
        <div className="pm-field">
          <label htmlFor="pm-name">Name</label>
          <input
            id="pm-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Kundenservice, Marketing..."
            maxLength={100}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="pm-field">
          <label htmlFor="pm-desc">
            Beschreibung <span className="pm-hint">optional</span>
          </label>
          <input
            id="pm-desc"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Wofür ist dieses Projekt?"
          />
        </div>

        {/* System Prompt */}
        <div className="pm-field">
          <label htmlFor="pm-prompt">
            System-Prompt <span className="pm-hint">Anweisungen für die KI</span>
          </label>
          <textarea
            id="pm-prompt"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Du bist ein Experte für... Antworte immer auf Deutsch..."
            rows={5}
          />
          {systemPrompt.length > 0 && (
            <div className={`pm-char-count${systemPrompt.length > 2000 ? ' warn' : ''}`}>
              {systemPrompt.length} / 2000
            </div>
          )}
        </div>

        {/* Knowledge Space */}
        {spaces.length > 0 && (
          <div className="pm-field">
            <label htmlFor="pm-space">
              <FiDatabase className="pm-label-icon" />
              Knowledge Space <span className="pm-hint">RAG auf Bereich einschränken</span>
            </label>
            <select
              id="pm-space"
              value={knowledgeSpaceId}
              onChange={e => setKnowledgeSpaceId(e.target.value)}
              className="pm-select"
            >
              <option value="">Kein Space (globale Suche)</option>
              {spaces.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.document_count || 0} Dokumente)
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default ProjectModal;
