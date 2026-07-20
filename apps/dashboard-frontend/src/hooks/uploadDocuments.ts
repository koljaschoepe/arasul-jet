/**
 * Geteilter Dokument-Upload-Kern (XHR mit Fortschritt, Validierung).
 *
 * Wird von zwei Features genutzt (klassische Dokumentverwaltung und
 * Workspace-Explorer) und lebt deshalb in hooks/ statt in einem
 * features/-Ordner (Promotion-Regel, siehe apps/dashboard-frontend/CLAUDE.md).
 */
import { useCallback, useRef, useState } from 'react';
import { API_BASE, getAuthHeaders } from '@/config/api';

/**
 * In-App indexierbare/durchsuchbare Typen. Plan 009: der Upload nimmt BELIEBIGE
 * Dateitypen an (echtes Dateisystem); diese Liste dient nur der Anzeige/Hinweisen,
 * nicht als Whitelist. Nicht-indexierbare Dateien werden „nur gespeichert".
 */
export const INDEXABLE_EXTENSIONS = ['.pdf', '.docx', '.md', '.markdown', '.txt', '.yaml', '.yml'];
export const MAX_UPLOAD_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const UPLOAD_TIMEOUT = 120000; // 120 s

export function getFileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Client-seitige Validierung; gibt eine deutsche Fehlermeldung oder null zurück.
 * Plan 009: keine Typ-Whitelist mehr — beliebige Dateitypen sind erlaubt. Es
 * bleiben nur Größen- und Leer-Prüfung.
 */
export function validateUploadFile(file: File): string | null {
  if (file.size > MAX_UPLOAD_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return `Datei zu groß (${sizeMB} MB). Maximum: 50 MB`;
  }
  if (file.size === 0) {
    return 'Leere Datei';
  }
  return null;
}

/** Einzelnen Upload per XHR fahren (Fortschritt via Callback). */
export function uploadFileXHR(
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

    xhr.timeout = UPLOAD_TIMEOUT;
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });
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
    xhr.addEventListener('error', () => reject(new Error('Netzwerkfehler')));
    xhr.addEventListener('timeout', () => reject(new Error('Timeout — Upload dauerte zu lange')));
    xhr.addEventListener('abort', () => reject(new Error('Upload abgebrochen')));

    xhr.open('POST', `${API_BASE}/documents/upload`);
    // WICHTIG: getAuthHeaders() enthält bereits X-CSRF-Token. Ihn hier ein
    // zweites Mal zu setzen APPENDED bei XHR ("A, A") → das Backend vergleicht
    // gegen das Cookie ("A") und lehnt mit 403 »CSRF token invalid« ab.
    // Genau dieser Doppel-Set hat die Dokument-Uploads plattformweit gebrochen.
    for (const [key, value] of Object.entries(getAuthHeaders())) {
      xhr.setRequestHeader(key, value);
    }
    xhr.send(formData);
  });
}

export interface UploadResult {
  ok: number;
  failed: { name: string; error: string }[];
}

/**
 * Schlanker Upload-Hook für den Explorer: `uploadFiles(files, spaceId)` lädt
 * parallel (max. 3), je Datei ein Retry, aggregierter Fortschritt.
 */
export function useUploadDocuments(onDone?: (result: UploadResult) => void) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const uploadingRef = useRef(false);

  const uploadFiles = useCallback(
    async (files: FileList | File[], spaceId: string | null): Promise<UploadResult> => {
      const result: UploadResult = { ok: 0, failed: [] };
      if (uploadingRef.current) return result;

      const valid: File[] = [];
      for (const file of Array.from(files)) {
        const error = validateUploadFile(file);
        if (error) {
          result.failed.push({ name: file.name, error });
        } else {
          valid.push(file);
        }
      }
      if (valid.length === 0) {
        onDone?.(result);
        return result;
      }

      uploadingRef.current = true;
      setUploading(true);
      setProgress(0);
      let completed = 0;

      const uploadOne = async (file: File) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await uploadFileXHR(file, spaceId, () => undefined);
            result.ok++;
            return;
          } catch (err: unknown) {
            if (attempt === 0) {
              await new Promise(r => setTimeout(r, 1000));
            } else {
              result.failed.push({
                name: file.name,
                error: err instanceof Error ? err.message : 'Upload fehlgeschlagen',
              });
            }
          }
        }
      };

      // max. 3 parallel
      const queue = [...valid];
      const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
        while (queue.length > 0) {
          const file = queue.shift();
          if (!file) break;
          await uploadOne(file);
          completed++;
          setProgress(Math.round((completed / valid.length) * 100));
        }
      });
      await Promise.all(workers);

      uploadingRef.current = false;
      setUploading(false);
      onDone?.(result);
      return result;
    },
    [onDone]
  );

  return { uploadFiles, uploading, progress };
}
