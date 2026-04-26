import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE, getAuthHeaders } from '../../../config/api';
import { getCsrfToken } from '../../../utils/csrf';
import { useToast } from '../../../contexts/ToastContext';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.yaml', '.yml'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_CONCURRENT = 3;
const UPLOAD_TIMEOUT = 120000; // 120s

export interface FileUploadStatus {
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
}

interface UseDocumentUploadParams {
  activeSpaceId: string | null;
  uploadSpaceId: string | null;
  setError: (message: string) => void;
  loadDocuments: () => void;
  loadStatistics: () => void;
  loadSpaces: () => void;
}

interface UseDocumentUploadReturn {
  uploading: boolean;
  uploadProgress: number;
  fileStatuses: FileUploadStatus[];
  dragActive: boolean;
  handleFileUpload: (files: FileList | File[] | null) => Promise<void>;
  handleDrag: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

function validateFile(file: File): string | null {
  const ext = getFileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Ungültiger Dateityp "${ext}". Erlaubt: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `Datei zu groß (${sizeMB} MB). Maximum: 50 MB`;
  }
  if (file.size === 0) {
    return 'Leere Datei';
  }
  return null;
}

function uploadFileXHR(
  file: File,
  spaceId: string | null,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    if (spaceId) {
      formData.append('space_id', spaceId);
    }

    // Timeout
    xhr.timeout = UPLOAD_TIMEOUT;

    // Progress
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    // Success
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        let message = `HTTP ${xhr.status}`;
        try {
          const body = JSON.parse(xhr.responseText);
          message = body.message || body.error || message;
        } catch {
          /* ignore parse error */
        }
        reject(new Error(message));
      }
    });

    // Network error
    xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout — Upload dauerte zu lange')));
    xhr.addEventListener('abort', () => reject(new Error('Upload abgebrochen')));

    // Open and set headers
    xhr.open('POST', `${API_BASE}/documents/upload`);
    const authHeaders = getAuthHeaders();
    for (const [key, value] of Object.entries(authHeaders)) {
      xhr.setRequestHeader(key, value);
    }
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      xhr.setRequestHeader('X-CSRF-Token', csrfToken);
    }
    // Don't set Content-Type — browser adds multipart boundary automatically

    xhr.send(formData);
  });
}

/**
 * useDocumentUpload - Parallel file upload with per-file progress, validation, and retry
 */
export default function useDocumentUpload({
  activeSpaceId,
  uploadSpaceId,
  setError,
  loadDocuments,
  loadStatistics,
  loadSpaces,
}: UseDocumentUploadParams): UseDocumentUploadReturn {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileStatuses, setFileStatuses] = useState<FileUploadStatus[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const uploadingRef = useRef(false);
  // Track timers for cleanup on unmount
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup all timers on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (pollStopRef.current) clearTimeout(pollStopRef.current);
      if (statusClearRef.current) clearTimeout(statusClearRef.current);
    };
  }, []);

  const handleFileUpload = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files || files.length === 0) return;
      if (uploadingRef.current) return; // Prevent double-upload

      const fileArray = Array.from(files);
      const targetSpaceId = uploadSpaceId || activeSpaceId;

      // Client-side validation
      const validFiles: File[] = [];
      const initialStatuses: FileUploadStatus[] = [];

      for (const file of fileArray) {
        const error = validateFile(file);
        if (error) {
          initialStatuses.push({
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'error',
            error,
          });
        } else {
          initialStatuses.push({
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'pending',
          });
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) {
        setFileStatuses(initialStatuses);
        // Show first error
        const firstErr = initialStatuses.find(s => s.error);
        if (firstErr) setError(firstErr.error!);
        // Clear statuses after a delay
        if (statusClearRef.current) clearTimeout(statusClearRef.current);
        statusClearRef.current = setTimeout(() => setFileStatuses([]), 5000);
        return;
      }

      setUploading(true);
      uploadingRef.current = true;
      setUploadProgress(0);
      setFileStatuses(initialStatuses);

      let completedCount = 0;
      const totalValid = validFiles.length;

      // Update a single file's status
      const updateFile = (name: string, update: Partial<FileUploadStatus>) => {
        setFileStatuses(prev => prev.map(f => (f.name === name ? { ...f, ...update } : f)));
      };

      // Upload a single file with one retry
      const uploadOne = async (file: File) => {
        updateFile(file.name, { status: 'uploading', progress: 0 });

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await uploadFileXHR(file, targetSpaceId, percent => {
              updateFile(file.name, { progress: percent });
            });
            updateFile(file.name, { status: 'success', progress: 100 });
            completedCount++;
            setUploadProgress(Math.round((completedCount / totalValid) * 100));
            return;
          } catch (err: unknown) {
            if (attempt === 0) {
              // Retry once
              updateFile(file.name, { progress: 0 });
              await new Promise(r => setTimeout(r, 1000));
            } else {
              updateFile(file.name, {
                status: 'error',
                error: err instanceof Error ? err.message : 'Upload fehlgeschlagen',
              });
            }
          }
        }
      };

      // Process files in parallel batches (Set-based to avoid splice mutation bugs)
      const queue = [...validFiles];
      const running = new Set<Promise<void>>();

      while (queue.length > 0 || running.size > 0) {
        while (running.size < MAX_CONCURRENT && queue.length > 0) {
          const file = queue.shift()!;
          const promise = uploadOne(file).then(() => {
            running.delete(promise);
          });
          running.add(promise);
        }
        if (running.size > 0) {
          await Promise.race(running);
        }
      }

      // Summary toast — count errors from validation + upload failures
      const errorCount =
        totalValid - completedCount + initialStatuses.filter(s => s.status === 'error').length;
      if (completedCount > 0 && errorCount > 0) {
        toast.warning(`${completedCount} hochgeladen, ${errorCount} fehlgeschlagen`);
      } else if (completedCount > 0) {
        toast.success(
          `${completedCount} ${completedCount === 1 ? 'Dokument' : 'Dokumente'} hochgeladen`
        );
      } else if (errorCount > 0) {
        toast.error(
          `Upload fehlgeschlagen: ${errorCount} ${errorCount === 1 ? 'Datei' : 'Dateien'}`
        );
      }

      setUploading(false);
      uploadingRef.current = false;
      setUploadProgress(0);

      // Immediate refresh + aggressive post-upload polling (3s for 30s)
      // so status transitions (pending → processing → indexed) are visible
      loadDocuments();
      loadStatistics();
      loadSpaces();

      if (completedCount > 0) {
        const POST_UPLOAD_INTERVAL = 3000;
        const POST_UPLOAD_DURATION = 30000;
        // Clear previous timers if any
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (pollStopRef.current) clearTimeout(pollStopRef.current);
        pollTimerRef.current = setInterval(() => {
          loadDocuments();
          loadStatistics();
        }, POST_UPLOAD_INTERVAL);
        pollStopRef.current = setTimeout(() => {
          if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
          }
        }, POST_UPLOAD_DURATION);
      }

      // Clear file statuses after a delay so user can see results
      if (statusClearRef.current) clearTimeout(statusClearRef.current);
      statusClearRef.current = setTimeout(() => setFileStatuses([]), 4000);
    },
    [activeSpaceId, uploadSpaceId, setError, loadDocuments, loadStatistics, loadSpaces, toast]
  );

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      handleDrag(e);
      setDragActive(true);
    },
    [handleDrag]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      handleDrag(e);
      setDragActive(false);
    },
    [handleDrag]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      handleDrag(e);
      setDragActive(false);
      handleFileUpload(e.dataTransfer.files);
    },
    [handleDrag, handleFileUpload]
  );

  return {
    uploading,
    uploadProgress,
    fileStatuses,
    dragActive,
    handleFileUpload,
    handleDrag,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
