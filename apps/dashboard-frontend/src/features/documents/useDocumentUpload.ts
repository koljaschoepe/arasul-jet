import { useState, useCallback, useRef, useEffect } from 'react';
import { useToast } from '../../contexts/ToastContext';
// Upload-Kern (Validierung + XHR) ist nach hooks/ promotet — auch der
// Workspace-Explorer lädt darüber hoch (Promotion-Regel, CLAUDE.md).
import { uploadFileXHR, validateUploadFile } from '@/hooks/uploadDocuments';

const MAX_CONCURRENT = 3;

export interface FileUploadStatus {
  // P2.5.3: stable per-upload id so two files with the same filename do not
  // collide on status updates (previous code keyed by `name`, which produced
  // visible progress/state cross-talk for duplicate filenames).
  id: string;
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
      const validFiles: Array<{ file: File; id: string }> = [];
      const initialStatuses: FileUploadStatus[] = [];

      for (const file of fileArray) {
        const id =
          typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const error = validateUploadFile(file);
        if (error) {
          initialStatuses.push({
            id,
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'error',
            error,
          });
        } else {
          initialStatuses.push({
            id,
            name: file.name,
            size: file.size,
            progress: 0,
            status: 'pending',
          });
          validFiles.push({ file, id });
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

      // Update a single file's status — keyed by stable id so duplicate filenames
      // don't collide.
      const updateFile = (id: string, update: Partial<FileUploadStatus>) => {
        setFileStatuses(prev => prev.map(f => (f.id === id ? { ...f, ...update } : f)));
      };

      // Upload a single file with one retry
      const uploadOne = async ({ file, id }: { file: File; id: string }) => {
        updateFile(id, { status: 'uploading', progress: 0 });

        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await uploadFileXHR(file, targetSpaceId, percent => {
              updateFile(id, { progress: percent });
            });
            updateFile(id, { status: 'success', progress: 100 });
            completedCount++;
            setUploadProgress(Math.round((completedCount / totalValid) * 100));
            return;
          } catch (err: unknown) {
            if (attempt === 0) {
              // Retry once
              updateFile(id, { progress: 0 });
              await new Promise(r => setTimeout(r, 1000));
            } else {
              updateFile(id, {
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
