import React, { memo, useState, useEffect } from 'react';
import { FiFolder, FiSave, FiAlertCircle, FiCheck, FiTrash2 } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import useConfirm from '../../hooks/useConfirm';
import Modal from '../../components/ui/Modal';
import './projects.css';

const PROJECT_ICONS = [
  { value: 'folder', label: 'Ordner' },
  { value: 'briefcase', label: 'Aktenkoffer' },
  { value: 'file-text', label: 'Dokument' },
  { value: 'users', label: 'Team' },
  { value: 'settings', label: 'Einstellungen' },
  { value: 'dollar-sign', label: 'Finanzen' },
  { value: 'shopping-cart', label: 'Vertrieb' },
  { value: 'tool', label: 'Technik' },
  { value: 'book', label: 'Wissen' },
  { value: 'archive', label: 'Archiv' },
];

const PROJECT_COLORS = [
  '#45ADFF', // Primary blue
  '#6366f1', // Indigo
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#22c55e', // Green
  '#14b8a6', // Teal
  '#06b6d4', // Cyan
  '#64748b', // Slate
];

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
  const [icon, setIcon] = useState('folder');
  const [color, setColor] = useState('#45ADFF');
  const [knowledgeSpaceId, setKnowledgeSpaceId] = useState('');
  const [spaces, setSpaces] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load available knowledge spaces
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    api
      .get('/spaces', { signal: controller.signal, showError: false })
      .then(data => setSpaces(data.spaces || []))
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen, api]);

  // Reset form when modal opens/closes or project changes
  useEffect(() => {
    if (isOpen) {
      if (project && mode === 'edit') {
        setName(project.name || '');
        setDescription(project.description || '');
        setSystemPrompt(project.system_prompt || '');
        setIcon(project.icon || 'folder');
        setColor(project.color || '#45ADFF');
        setKnowledgeSpaceId(project.knowledge_space_id || '');
      } else {
        setName('');
        setDescription('');
        setSystemPrompt('');
        setIcon('folder');
        setColor('#45ADFF');
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
        icon,
        color,
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
        message: `Projekt "${project.name}" wirklich löschen? Conversations werden beibehalten, aber nicht mehr gruppiert.`,
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
      title={
        <>
          <FiFolder style={{ color }} />
          {mode === 'edit' ? ' Projekt bearbeiten' : ' Neues Projekt erstellen'}
        </>
      }
      size="medium"
      className="project-modal-wrapper"
      footer={
        <div className="space-modal-footer">
          {mode === 'edit' && project && (
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
          <div className="footer-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Abbrechen
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
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
      <div className="space-modal-body">
        {error && (
          <div className="space-message error">
            <FiAlertCircle />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="space-message success">
            <FiCheck />
            <span>{success}</span>
          </div>
        )}

        {/* Name */}
        <div className="space-form-group">
          <label htmlFor="project-name">Name</label>
          <input
            id="project-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="z.B. Kundenservice, Marketing, Intern..."
            maxLength={100}
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="space-form-group">
          <label htmlFor="project-description">
            Beschreibung
            <span className="label-hint">(optional, für eigene Notizen)</span>
          </label>
          <input
            id="project-description"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Kurze Beschreibung des Projekts..."
          />
        </div>

        {/* System Prompt */}
        <div className="space-form-group">
          <label htmlFor="project-system-prompt">
            System-Prompt
            <span className="label-hint">(Anweisungen für die KI)</span>
          </label>
          <textarea
            id="project-system-prompt"
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="Du bist ein Experte für... Antworte immer auf Deutsch und verwende..."
            rows={6}
          />
          <div className="prompt-char-count">
            {systemPrompt.length} / 2000 Zeichen
            {systemPrompt.length > 2000 && (
              <span className="prompt-warning"> (empfohlen: max. 2000)</span>
            )}
          </div>
        </div>

        {/* Icon and Color */}
        <div className="space-form-row">
          <div className="space-form-group half">
            <label>Icon</label>
            <div className="icon-selector">
              {PROJECT_ICONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`icon-option ${icon === opt.value ? 'selected' : ''}`}
                  onClick={() => setIcon(opt.value)}
                  title={opt.label}
                >
                  <FiFolder />
                </button>
              ))}
            </div>
          </div>

          <div className="space-form-group half">
            <label>Farbe</label>
            <div className="color-selector">
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-option ${color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Knowledge Space */}
        <div className="space-form-group">
          <label htmlFor="project-space">
            Knowledge Space
            <span className="label-hint">(optional, schränkt RAG auf diesen Bereich ein)</span>
          </label>
          <select
            id="project-space"
            value={knowledgeSpaceId}
            onChange={e => setKnowledgeSpaceId(e.target.value)}
            className="project-space-select"
          >
            <option value="">Kein Space (globale Suche)</option>
            {spaces.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {ConfirmDialog}
    </Modal>
  );
});

export default ProjectModal;
