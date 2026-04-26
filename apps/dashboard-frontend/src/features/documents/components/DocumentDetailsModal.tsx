import {
  File,
  Trash2,
  Download,
  RefreshCw,
  AlertCircle,
  Folder,
  Tag,
  Cpu,
  Link,
  Pencil,
} from 'lucide-react';
import { StatusBadge, CategoryBadge } from './Badges';
import Modal from '../../../components/ui/Modal';
import { formatFileSize } from '../../../utils/formatting';
import { Button } from '@/components/ui/shadcn/button';
import type { Document } from '../../../types';
import type { SimilarDocument } from '../hooks/useDocumentActions';

interface DocumentDetailsModalProps {
  document: Document;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (doc: Document) => void;
  onDownload: (id: string, filename: string) => void;
  onDelete: (id: string, filename: string) => void;
  onReindex: (id: string) => void;
  loadingSimilar: boolean;
  similarDocuments: SimilarDocument[];
  isEditable: (doc: Document) => boolean;
}

function DocumentDetailsModal({
  document: doc,
  isOpen,
  onClose,
  onEdit,
  onDownload,
  onDelete,
  onReindex,
  loadingSimilar,
  similarDocuments,
  isEditable,
}: DocumentDetailsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={doc.title || doc.filename}
      size="medium"
      footer={
        <div className="flex items-center gap-3" role="group" aria-label="Aktionen">
          {isEditable(doc) && (
            <Button
              onClick={() => {
                onClose();
                onEdit(doc);
              }}
              aria-label="Dokument bearbeiten"
            >
              <Pencil aria-hidden="true" size={16} /> Bearbeiten
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => onDownload(doc.id, doc.filename)}
            aria-label="Dokument herunterladen"
          >
            <Download aria-hidden="true" size={16} /> Download
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              onDelete(doc.id, doc.filename);
              onClose();
            }}
            aria-label="Dokument löschen"
          >
            <Trash2 aria-hidden="true" size={16} /> Löschen
          </Button>
        </div>
      }
    >
      {/* Basic Info */}
      <div className="mb-6 last:mb-0">
        <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
          Informationen
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Dateiname</span>
            <span className="text-foreground text-sm">{doc.filename}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Gr&ouml;&szlig;e</span>
            <span className="text-foreground text-sm">{formatFileSize(doc.file_size)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Typ</span>
            <span className="text-foreground text-sm">{doc.file_extension}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Status</span>
            <StatusBadge status={doc.status} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Seiten</span>
            <span className="text-foreground text-sm">{doc.page_count || '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">W&ouml;rter</span>
            <span className="text-foreground text-sm">
              {doc.word_count?.toLocaleString() || '-'}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Chunks</span>
            <span className="text-foreground text-sm">{doc.chunk_count || '-'}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Sprache</span>
            <span className="text-foreground text-sm">
              {doc.language === 'de' ? 'Deutsch' : 'Englisch'}
            </span>
          </div>
        </div>
      </div>

      {/* AI Summary */}
      {doc.summary && (
        <div className="mb-6 last:mb-0">
          <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
            <Cpu aria-hidden="true" size={16} /> KI-Zusammenfassung
          </h4>
          <p className="text-muted-foreground leading-relaxed text-sm m-0 bg-[var(--bg-code)] p-4 rounded-md border-l-[3px] border-l-primary">
            {doc.summary}
          </p>
        </div>
      )}

      {/* Topics */}
      {doc.key_topics && doc.key_topics.length > 0 && (
        <div className="mb-6 last:mb-0">
          <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
            <Tag aria-hidden="true" size={16} /> Themen
          </h4>
          <div className="flex flex-wrap gap-2" aria-label="Dokumenten-Themen">
            {doc.key_topics.map((topic: string, idx: number) => (
              <span key={idx} className="bg-primary/10 text-primary py-1 px-2.5 rounded-xs text-sm">
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Category with confidence */}
      {doc.category_name && (
        <div className="mb-6 last:mb-0">
          <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
            <Folder aria-hidden="true" size={16} /> Kategorie
          </h4>
          <div className="flex items-center gap-3">
            <CategoryBadge name={doc.category_name} color={doc.category_color} />
            {doc.category_confidence && (
              <span
                className="text-muted-foreground text-sm"
                aria-label={`Konfidenz: ${(doc.category_confidence * 100).toFixed(0)} Prozent`}
              >
                ({(doc.category_confidence * 100).toFixed(0)}% Konfidenz)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Similar Documents */}
      {doc.status === 'indexed' && (
        <div className="mb-6 last:mb-0">
          <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
            <Link aria-hidden="true" size={16} /> Ähnliche Dokumente
          </h4>
          {loadingSimilar ? (
            <div
              className="flex items-center gap-3 text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              <RefreshCw className="animate-spin" aria-hidden="true" size={16} />
              <span>Suche ähnliche Dokumente...</span>
            </div>
          ) : similarDocuments.length === 0 ? (
            <p className="text-muted-foreground italic">Keine ähnlichen Dokumente gefunden</p>
          ) : (
            <div className="flex flex-col gap-2" aria-label="Ähnliche Dokumente">
              {similarDocuments.map((sim, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 py-2 px-3 bg-[var(--bg-code)] rounded-sm"
                >
                  <File aria-hidden="true" size={16} />
                  <span className="flex-1 text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                    {sim.title || sim.filename}
                  </span>
                  <span
                    className="bg-primary/10 text-primary py-0.5 px-2 rounded-xs text-xs"
                    aria-label={`Ähnlichkeit: ${(sim.similarity_score * 100).toFixed(0)} Prozent`}
                  >
                    {(sim.similarity_score * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error message if failed */}
      {doc.status === 'failed' && doc.processing_error && (
        <div
          className="mb-6 last:mb-0 bg-destructive/5 p-4 rounded-md border border-destructive/20"
          role="alert"
        >
          <h4 className="flex items-center gap-2 text-muted-foreground text-sm uppercase tracking-wide m-0 mb-3">
            <AlertCircle aria-hidden="true" size={16} /> Fehler
          </h4>
          <p className="text-destructive m-0 mb-4 text-sm">{doc.processing_error}</p>
          <button
            type="button"
            className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-destructive py-2 px-4 rounded-sm cursor-pointer text-sm transition-all hover:bg-destructive/20"
            onClick={() => {
              onReindex(doc.id);
              onClose();
            }}
            aria-label="Indexierung erneut versuchen"
          >
            <RefreshCw aria-hidden="true" size={16} /> Erneut versuchen
          </button>
        </div>
      )}
    </Modal>
  );
}

export default DocumentDetailsModal;
