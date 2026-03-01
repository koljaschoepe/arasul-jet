import { useState, useCallback } from 'react';
import { useApi } from '../../hooks/useApi';

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
}) {
  const api = useApi();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = useCallback(
    async files => {
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

  const handleDrag = useCallback(e => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback(
    e => {
      handleDrag(e);
      setDragActive(true);
    },
    [handleDrag]
  );

  const handleDragLeave = useCallback(
    e => {
      handleDrag(e);
      setDragActive(false);
    },
    [handleDrag]
  );

  const handleDrop = useCallback(
    e => {
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
