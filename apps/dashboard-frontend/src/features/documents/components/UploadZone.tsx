import { Upload, Check, AlertCircle, RefreshCw, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileUploadStatus } from '../hooks/useDocumentUpload';
import type { DocumentSpace } from '../../../types';

interface UploadZoneProps {
  uploading: boolean;
  uploadProgress: number;
  fileStatuses: FileUploadStatus[];
  dragActive: boolean;
  spaces: DocumentSpace[];
  uploadSpaceId: string | null;
  activeSpaceId: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileUpload: (files: FileList | null) => void;
  onDrag: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

/**
 * UploadZone — Drag&Drop area with per-file progress indicators.
 * Stateless: receives all upload state from useDocumentUpload via props.
 * fileInputRef is owned by the parent so other UI (e.g. empty-state button)
 * can also trigger the file picker.
 */
export default function UploadZone({
  uploading,
  uploadProgress,
  fileStatuses,
  dragActive,
  spaces,
  uploadSpaceId,
  activeSpaceId,
  fileInputRef,
  onFileUpload,
  onDrag,
  onDragEnter,
  onDragLeave,
  onDrop,
}: UploadZoneProps) {
  const targetSpaceId = uploadSpaceId || activeSpaceId;
  const targetSpaceName = targetSpaceId ? spaces.find(s => s.id === targetSpaceId)?.name : null;

  return (
    <div
      className={cn(
        'bg-[var(--bg-dropzone)] border-2 border-dashed border-[var(--border-dropzone)] rounded-lg p-8 text-center cursor-pointer transition-all mb-6 hover:border-[var(--border-dropzone-hover)] hover:bg-[var(--bg-dropzone-hover)]',
        dragActive &&
          'border-[var(--border-dropzone-active)] bg-[var(--bg-dropzone-active)] scale-[1.01]',
        uploading && 'pointer-events-none opacity-80'
      )}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDrag}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
      role="button"
      tabIndex={0}
      aria-label="Dateien hochladen - Klicken oder Dateien hierher ziehen"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={e => {
          onFileUpload((e.target as HTMLInputElement).files);
          (e.target as HTMLInputElement).value = '';
        }}
        multiple
        accept=".pdf,.docx,.md,.markdown,.txt,.yaml,.yml"
        style={{ display: 'none' }}
        aria-label="Datei auswählen"
      />

      {uploading || fileStatuses.length > 0 ? (
        <div className="w-full max-w-md mx-auto space-y-2" onClick={e => e.stopPropagation()}>
          {uploading && (
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-1.5 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full bg-primary rounded-sm transition-[width] duration-300"
                  style={{ width: `${uploadProgress}%` }}
                  role="progressbar"
                  aria-valuenow={uploadProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap" aria-live="polite">
                {uploadProgress}%
              </span>
            </div>
          )}
          {fileStatuses.map(fs => (
            <div key={fs.name} className="flex items-center gap-2 text-sm">
              {fs.status === 'success' && <Check size={14} className="text-success shrink-0" />}
              {fs.status === 'error' && (
                <AlertCircle size={14} className="text-destructive shrink-0" />
              )}
              {fs.status === 'uploading' && (
                <RefreshCw size={14} className="text-primary shrink-0 animate-spin" />
              )}
              {fs.status === 'pending' && (
                <Clock size={14} className="text-muted-foreground shrink-0" />
              )}
              <span className="truncate flex-1" title={fs.name}>
                {fs.name}
              </span>
              {fs.status === 'uploading' && (
                <span className="text-muted-foreground text-xs whitespace-nowrap">
                  {fs.progress}%
                </span>
              )}
              {fs.status === 'error' && (
                <span className="text-destructive text-xs truncate max-w-[150px]" title={fs.error}>
                  {fs.error}
                </span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <>
          <Upload className="text-4xl text-primary mb-3 mx-auto" aria-hidden="true" size={40} />
          <p>
            Dateien hier ablegen oder klicken zum Auswählen
            {targetSpaceName && spaces.length > 0 && (
              <span className="text-primary font-medium">
                {' → '}
                {targetSpaceName}
              </span>
            )}
          </p>
          <span className="text-muted-foreground text-sm">
            PDF, DOCX, Markdown, YAML (max. 50MB)
          </span>
        </>
      )}
    </div>
  );
}
