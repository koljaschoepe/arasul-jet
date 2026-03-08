import { useState, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';

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
  dragActive: boolean;
  handleFileUpload: (files: FileList | File[]) => Promise<void>;
  handleDrag: (e: React.DragEvent) => void;
  handleDragEnter: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
}

/**
 * useDocumentUpload - File upload and drag/drop handlers for DocumentManager
 */
export default function useDocumentUpload({
  activeSpaceId,
  uploadSpaceId,
  setError,
  loadDocuments,
  loadStatistics,
  loadSpaces,
}: UseDocumentUploadParams): UseDocumentUploadReturn {
  const api = useApi();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      setUploadProgress(0);

      const totalFiles = files.length;
      let completedFiles = 0;
      const targetSpaceId = uploadSpaceId || activeSpaceId;

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          if (targetSpaceId) {
            formData.append('space_id', targetSpaceId);
          }

          await api.post('/documents/upload', formData, { showError: false });

          completedFiles++;
          setUploadProgress(Math.round((completedFiles / totalFiles) * 100));
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
          setError(`Fehler beim Hochladen von "${file.name}"`);
        }
      }

      setUploading(false);
      setUploadProgress(0);
      loadDocuments();
      loadStatistics();
      loadSpaces();
    },
    [api, activeSpaceId, uploadSpaceId, setError, loadDocuments, loadStatistics, loadSpaces]
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
    dragActive,
    handleFileUpload,
    handleDrag,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
  };
}
