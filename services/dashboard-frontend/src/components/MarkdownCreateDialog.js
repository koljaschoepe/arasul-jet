/**
 * MarkdownCreateDialog - Dialog for creating a new Markdown document
 */

import React, { useState, memo } from 'react';
import axios from 'axios';
import { FiFileText } from 'react-icons/fi';
import { API_BASE } from '../config/api';
import Modal from './Modal';

const MarkdownCreateDialog = memo(function MarkdownCreateDialog({
    isOpen,
    onClose,
    onCreated,
    spaceId,
    spaces = []
}) {
    const [filename, setFilename] = useState('');
    const [description, setDescription] = useState('');
    const [selectedSpaceId, setSelectedSpaceId] = useState(spaceId || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reset form when dialog opens
    React.useEffect(() => {
        if (isOpen) {
            setFilename('');
            setDescription('');
            setSelectedSpaceId(spaceId || '');
            setError(null);
        }
    }, [isOpen, spaceId]);

    // Create the markdown document
    const handleCreate = async (e) => {
        e.preventDefault();

        if (!filename.trim()) {
            setError('Dateiname ist erforderlich');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await axios.post(`${API_BASE}/documents/create-markdown`, {
                filename: filename.trim(),
                description: description.trim(),
                space_id: selectedSpaceId || null
            });

            // Reset form
            setFilename('');
            setDescription('');

            // Notify parent with the created document
            onCreated(response.data.document);
        } catch (err) {
            console.error('Error creating markdown document:', err);
            setError(err.response?.data?.error || 'Fehler beim Erstellen des Dokuments');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Neues Markdown-Dokument" size="medium">
            <form onSubmit={handleCreate} className="yaml-create-form">
                {error && <div className="yaml-form-error">{error}</div>}

                <div className="yaml-create-header-icon">
                    <FiFileText />
                </div>

                <div className="yaml-form-group">
                    <label htmlFor="md-filename">Dateiname *</label>
                    <input
                        id="md-filename"
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="z.B. notizen, dokumentation, anleitung"
                        autoFocus
                        required
                    />
                    <span className="yaml-form-hint">.md wird automatisch angehängt</span>
                </div>

                <div className="yaml-form-group">
                    <label htmlFor="md-desc">Beschreibung (optional)</label>
                    <textarea
                        id="md-desc"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Kurze Beschreibung des Dokuments"
                        rows={2}
                    />
                </div>

                {spaces.length > 0 && (
                    <div className="yaml-form-group">
                        <label htmlFor="md-space">Wissensbereich</label>
                        <select
                            id="md-space"
                            value={selectedSpaceId}
                            onChange={(e) => setSelectedSpaceId(e.target.value)}
                        >
                            <option value="">Allgemein</option>
                            {spaces.map(space => (
                                <option key={space.id} value={space.id}>
                                    {space.name}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="yaml-modal-actions">
                    <button type="button" className="btn-secondary" onClick={onClose}>
                        Abbrechen
                    </button>
                    <button
                        type="submit"
                        className="btn-primary"
                        disabled={loading || !filename.trim()}
                    >
                        {loading ? 'Erstelle...' : 'Dokument erstellen'}
                    </button>
                </div>
            </form>
        </Modal>
    );
});

export default MarkdownCreateDialog;
