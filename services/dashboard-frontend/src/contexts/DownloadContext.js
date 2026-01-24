/**
 * DownloadContext - Global Download State Management
 *
 * Manages model downloads globally so they persist across page navigation.
 * Downloads continue in the background even when user navigates away from ModelStore.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../config/api';

// Context
const DownloadContext = createContext(null);

// Helper: Interpret Ollama status messages
const interpretDownloadStatus = (status) => {
    if (!status) return { phase: 'init', label: 'Initialisiere...' };

    const statusLower = status.toLowerCase();
    if (statusLower.includes('pulling manifest')) {
        return { phase: 'init', label: 'Lade Manifest...' };
    } else if (statusLower.includes('pulling') || statusLower.includes('downloading')) {
        return { phase: 'download', label: 'Download läuft...' };
    } else if (statusLower.includes('verifying')) {
        return { phase: 'verify', label: 'Verifiziere Daten...' };
    } else if (statusLower.includes('writing') || statusLower.includes('extracting')) {
        return { phase: 'verify', label: 'Schreibe Daten...' };
    } else if (statusLower.includes('success')) {
        return { phase: 'complete', label: 'Abgeschlossen!' };
    }
    return { phase: 'download', label: status };
};

// Provider Component
export function DownloadProvider({ children }) {
    // Active downloads: { modelId: { progress, status, phase, error } }
    const [activeDownloads, setActiveDownloads] = useState({});

    // Ref to track active abort controllers
    const abortControllersRef = useRef({});

    // Callbacks to notify when download completes (for ModelStore to refresh)
    const onCompleteCallbacksRef = useRef(new Set());

    // RC-004 FIX: Use ref to track activeDownloads for polling
    // This prevents the useEffect from re-running when activeDownloads changes
    const activeDownloadsRef = useRef(activeDownloads);

    // Keep ref in sync with state
    useEffect(() => {
        activeDownloadsRef.current = activeDownloads;
    }, [activeDownloads]);

    // Check for existing downloads on mount (poll DB state)
    useEffect(() => {
        const checkExistingDownloads = async () => {
            try {
                const token = localStorage.getItem('arasul_token');
                const response = await fetch(`${API_BASE}/models/catalog`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const models = data.models || [];

                    // Find models that are downloading
                    const downloading = models.filter(m => m.install_status === 'downloading');

                    if (downloading.length > 0) {
                        const newDownloads = {};
                        downloading.forEach(m => {
                            newDownloads[m.id] = {
                                progress: m.download_progress || 0,
                                status: 'Download läuft...',
                                phase: 'download',
                                error: null,
                                modelName: m.name
                            };
                        });
                        setActiveDownloads(prev => ({ ...prev, ...newDownloads }));
                    }
                }
            } catch (err) {
                console.error('[DownloadContext] Error checking existing downloads:', err);
            }
        };

        checkExistingDownloads();

        // RC-004 FIX: Poll using ref instead of state in dependency array
        // This creates only one interval that persists for the component lifetime
        const pollInterval = setInterval(async () => {
            // Use ref to get current downloads
            const currentDownloads = Object.keys(activeDownloadsRef.current);
            if (currentDownloads.length === 0) return;

            try {
                const token = localStorage.getItem('arasul_token');
                const response = await fetch(`${API_BASE}/models/catalog`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (response.ok) {
                    const data = await response.json();
                    const models = data.models || [];

                    setActiveDownloads(prev => {
                        const updated = { ...prev };
                        let hasChanges = false;

                        for (const modelId of Object.keys(prev)) {
                            const model = models.find(m => m.id === modelId);
                            if (model) {
                                if (model.install_status === 'available') {
                                    // Download completed
                                    delete updated[modelId];
                                    hasChanges = true;
                                    // Notify callbacks
                                    onCompleteCallbacksRef.current.forEach(cb => cb(modelId, true));
                                } else if (model.install_status === 'error') {
                                    // Download failed
                                    updated[modelId] = {
                                        ...prev[modelId],
                                        progress: 0,
                                        phase: 'error',
                                        error: model.install_error || 'Download fehlgeschlagen'
                                    };
                                    hasChanges = true;
                                } else if (model.install_status === 'downloading') {
                                    // Update progress from DB
                                    if (prev[modelId].progress !== model.download_progress) {
                                        updated[modelId] = {
                                            ...prev[modelId],
                                            progress: model.download_progress || 0
                                        };
                                        hasChanges = true;
                                    }
                                }
                            }
                        }

                        return hasChanges ? updated : prev;
                    });
                }
            } catch (err) {
                console.debug('[DownloadContext] Poll error:', err);
            }
        }, 3000);

        return () => clearInterval(pollInterval);
    }, []); // RC-004 FIX: Empty dependency array - only run on mount

    // Start a download
    const startDownload = useCallback(async (modelId, modelName) => {
        // Don't start if already downloading
        if (activeDownloads[modelId]) {
            console.log(`[DownloadContext] Model ${modelId} already downloading`);
            return;
        }

        // Set initial state
        setActiveDownloads(prev => ({
            ...prev,
            [modelId]: {
                progress: 0,
                status: 'Starte Download...',
                phase: 'init',
                error: null,
                modelName: modelName || modelId
            }
        }));

        const abortController = new AbortController();
        abortControllersRef.current[modelId] = abortController;

        try {
            const token = localStorage.getItem('arasul_token');
            const response = await fetch(`${API_BASE}/models/download`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ model_id: modelId }),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.substring(6));

                            setActiveDownloads(prev => {
                                if (!prev[modelId]) return prev;

                                const update = { ...prev[modelId] };

                                if (data.progress !== undefined) {
                                    update.progress = data.progress;
                                }

                                if (data.status) {
                                    const interpreted = interpretDownloadStatus(data.status);
                                    update.phase = interpreted.phase;
                                    update.status = interpreted.label;
                                }

                                if (data.done) {
                                    if (data.success) {
                                        update.phase = 'complete';
                                        update.status = 'Abgeschlossen!';
                                        update.progress = 100;
                                    }
                                    if (data.error) {
                                        update.phase = 'error';
                                        update.error = data.error;
                                    }
                                }

                                return { ...prev, [modelId]: update };
                            });

                            // Handle completion
                            if (data.done) {
                                setTimeout(() => {
                                    setActiveDownloads(prev => {
                                        const updated = { ...prev };
                                        delete updated[modelId];
                                        return updated;
                                    });
                                    // Notify callbacks
                                    onCompleteCallbacksRef.current.forEach(cb => cb(modelId, data.success));
                                }, 2000);
                            }
                        } catch (e) {
                            console.debug('[DownloadContext] SSE parse error:', e.message);
                        }
                    }
                }
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                console.log(`[DownloadContext] Download ${modelId} aborted`);
            } else {
                console.error(`[DownloadContext] Download error for ${modelId}:`, err);
                setActiveDownloads(prev => ({
                    ...prev,
                    [modelId]: {
                        ...prev[modelId],
                        phase: 'error',
                        error: err.message
                    }
                }));
            }
        } finally {
            delete abortControllersRef.current[modelId];
        }
    }, [activeDownloads]);

    // Cancel a download
    const cancelDownload = useCallback((modelId) => {
        const controller = abortControllersRef.current[modelId];
        if (controller) {
            controller.abort();
        }
        setActiveDownloads(prev => {
            const updated = { ...prev };
            delete updated[modelId];
            return updated;
        });
    }, []);

    // Register callback for download completion
    const onDownloadComplete = useCallback((callback) => {
        onCompleteCallbacksRef.current.add(callback);
        return () => onCompleteCallbacksRef.current.delete(callback);
    }, []);

    // Check if a model is downloading
    const isDownloading = useCallback((modelId) => {
        return !!activeDownloads[modelId];
    }, [activeDownloads]);

    // Get download state for a model
    const getDownloadState = useCallback((modelId) => {
        return activeDownloads[modelId] || null;
    }, [activeDownloads]);

    // Get all active downloads count
    const activeDownloadCount = Object.keys(activeDownloads).length;

    // Get all active downloads as array
    const activeDownloadsList = Object.entries(activeDownloads).map(([modelId, state]) => ({
        modelId,
        ...state
    }));

    const value = {
        activeDownloads,
        activeDownloadCount,
        activeDownloadsList,
        startDownload,
        cancelDownload,
        isDownloading,
        getDownloadState,
        onDownloadComplete
    };

    return (
        <DownloadContext.Provider value={value}>
            {children}
        </DownloadContext.Provider>
    );
}

// Hook to use download context
export function useDownloads() {
    const context = useContext(DownloadContext);
    if (!context) {
        throw new Error('useDownloads must be used within a DownloadProvider');
    }
    return context;
}

export default DownloadContext;
