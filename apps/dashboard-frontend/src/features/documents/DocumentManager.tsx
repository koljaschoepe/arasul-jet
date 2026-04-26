import { useState, useRef, useMemo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import TipTapEditor from '../../components/editor/tiptap/TipTapEditor';
import CreateDocumentDialog from '../../components/editor/CreateDocumentDialog';
import ExcelEditor from '../datentabellen/ExcelEditor';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { getValidToken } from '../../utils/token';

import DocumentStatsHeader from './components/DocumentStatsHeader';
import SpaceTabs from './components/SpaceTabs';
import DocumentPagination from './components/DocumentPagination';
import UploadZone from './components/UploadZone';
import SemanticSearch from './components/SemanticSearch';
import DocumentFilters from './components/DocumentFilters';
import BatchActionToolbar from './components/BatchActionToolbar';
import DocumentList, { type CombinedItem } from './components/DocumentList';
import SpaceModal from './components/SpaceModal';
import DocumentDetailsModal from './components/DocumentDetailsModal';
import useDocumentData from './hooks/useDocumentData';
import useDocumentBatch from './hooks/useDocumentBatch';
import useDocumentActions from './hooks/useDocumentActions';
import useDocumentUpload from './hooks/useDocumentUpload';
import {
  useMoveDocumentMutation,
  useCleanupOrphanedMutation,
  useDeleteTableMutation,
} from './hooks/mutations';

import type { Document, DocumentSpace, DataTable } from '../../types';

const isEditableDoc = (doc: Document) => {
  const editableExtensions = ['.md', '.markdown', '.txt'];
  return editableExtensions.includes(doc.file_extension?.toLowerCase() ?? '');
};

function DocumentManager() {
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mutations: move/cleanup/deleteTable previously inline; now go through hooks
  const moveMutation = useMoveDocumentMutation();
  const cleanupMutation = useCleanupOrphanedMutation();
  const deleteTableMutation = useDeleteTableMutation();

  // Data + filter state (loaders, polling, status-transition toasts)
  const data = useDocumentData();

  // Selection visible to batch hook = currently rendered document IDs
  const visibleDocIds = useMemo(() => data.documents.map(d => d.id), [data.documents]);
  const selectionResetKey = `${data.activeSpaceId}|${data.statusFilter}|${data.categoryFilter}|${data.searchQuery}|${data.currentPage}`;

  const batch = useDocumentBatch({
    visibleDocIds,
    selectionResetKey,
    confirm,
    reloadDocuments: data.reloadDocuments,
    reloadStatistics: data.reloadStatistics,
    reloadSpaces: data.reloadSpaces,
  });

  const actions = useDocumentActions({
    confirm,
    setError: data.setError,
    loadDocuments: data.reloadDocuments,
    loadStatistics: data.reloadStatistics,
  });

  const upload = useDocumentUpload({
    activeSpaceId: data.activeSpaceId,
    uploadSpaceId: data.uploadSpaceId,
    setError: data.setError,
    loadDocuments: data.reloadDocuments,
    loadStatistics: data.reloadStatistics,
    loadSpaces: data.reloadSpaces,
  });

  // Modal & dialog state (lives here because each opens/closes via JSX)
  const [showSpaceModal, setShowSpaceModal] = useState(false);
  const [editingSpace, setEditingSpace] = useState<DocumentSpace | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingDocument, setEditingDocument] = useState<Document | null>(null);
  const [showTableEditor, setShowTableEditor] = useState(false);
  const [editingTable, setEditingTable] = useState<DataTable | null>(null);
  const [showMarkdownCreate, setShowMarkdownCreate] = useState(false);
  const [showSimpleTableCreate, setShowSimpleTableCreate] = useState(false);
  const cleaningUp = cleanupMutation.isPending;

  // Combined list (tables + documents) — server already filters
  const combinedItems: CombinedItem[] = [
    ...data.tables.map(t => ({ ...t, _type: 'table' as const })),
    ...data.documents.map(d => ({ ...d, _type: 'document' as const })),
  ];
  const totalPages = Math.ceil((data.totalDocuments + data.totalTables) / data.itemsPerPage);
  const hasActiveFilter = Boolean(
    data.searchQuery || data.statusFilter || data.categoryFilter || data.activeSpaceId
  );

  // Handlers wired into modals/dialogs
  const handleSpaceSave = () => {
    data.reloadSpaces();
    data.reloadStatistics();
    data.reloadDocuments();
  };

  const handleEditSpace = (space: DocumentSpace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSpace(space);
    setShowSpaceModal(true);
  };

  const handleMoveDocument = (
    docId: string,
    newSpaceId: string | null,
    newSpaceName: string | null
  ) => {
    moveMutation.mutate({ docId, spaceId: newSpaceId, spaceName: newSpaceName });
  };

  const handleCleanup = async () => {
    const confirmed = await confirm({
      title: 'Bereinigung starten?',
      message:
        'Verwaiste Dateien (ohne Datenbankeintrag) werden gelöscht und fehlende Dateien markiert. Soft-gelöschte Dokumente älter als 30 Tage werden endgültig entfernt.',
      confirmText: 'Bereinigen',
      confirmVariant: 'warning',
    });
    if (!confirmed) return;

    cleanupMutation.mutate(undefined, {
      onSuccess: result => {
        const c = result.cleaned;
        if (c.deleted_from_minio + c.marked_failed_in_db + c.purged_soft_deleted === 0) {
          toast.success('Keine verwaisten Dateien gefunden — alles sauber!');
        } else {
          toast.success(
            `Bereinigt: ${c.deleted_from_minio} MinIO-Dateien, ${c.marked_failed_in_db} DB-Einträge, ${c.purged_soft_deleted} alte Löschungen`
          );
        }
      },
      onError: err =>
        toast.error(
          'Bereinigung fehlgeschlagen: ' +
            (err instanceof Error ? err.message : 'Unbekannter Fehler')
        ),
    });
  };

  const handleEditDocument = (doc: Document) => {
    if (isEditableDoc(doc)) {
      setEditingDocument(doc);
      setShowEditor(true);
    }
  };

  const handleEditorClose = () => {
    setShowEditor(false);
    setEditingDocument(null);
  };

  const handleEditorSave = () => {
    data.reloadDocuments();
    data.reloadStatistics();
  };

  const handleMarkdownCreated = (newDoc: Document | null) => {
    setShowMarkdownCreate(false);
    data.reloadDocuments();
    data.reloadStatistics();
    data.reloadSpaces();
    if (newDoc) {
      setEditingDocument(newDoc);
      setShowEditor(true);
    }
  };

  const handleDataTableCreated = (newTable: DataTable | null) => {
    setShowSimpleTableCreate(false);
    data.reloadTables();
    if (newTable?.slug) {
      setEditingTable(newTable);
      setShowTableEditor(true);
    }
  };

  const handleTableEdit = (table: DataTable) => {
    setEditingTable(table);
    setShowTableEditor(true);
  };

  const handleTableEditorClose = () => {
    setShowTableEditor(false);
    setEditingTable(null);
    data.reloadTables();
  };

  const handleDeleteTable = async (table: DataTable) => {
    if (!(await confirm({ message: `Tabelle "${table.name}" wirklich löschen?` }))) return;
    deleteTableMutation.mutate(table.slug, {
      onError: () => data.setError('Fehler beim Löschen der Tabelle'),
    });
  };

  const handleResetFilters = () => {
    data.setSearchQuery('');
    data.setStatusFilter('');
    data.setCategoryFilter('');
    data.setActiveSpaceId(null);
  };

  return (
    <main
      className="document-manager p-6 max-md:p-4 max-w-[1600px] mx-auto"
      role="main"
      aria-label="Dokumentenverwaltung"
    >
      <DocumentStatsHeader
        statistics={data.statistics}
        statsError={data.statsError}
        activeSpaceId={data.activeSpaceId}
        statusFilter={data.statusFilter}
        categoryFilter={data.categoryFilter}
        onReload={data.reloadStatistics}
      />

      <SpaceTabs
        spaces={data.spaces}
        activeSpaceId={data.activeSpaceId}
        statistics={data.statistics}
        spacesError={data.spacesError}
        onSpaceChange={data.selectSpace}
        onEditSpace={handleEditSpace}
        onCreateSpace={() => {
          setEditingSpace(null);
          setShowSpaceModal(true);
        }}
        onReloadSpaces={data.reloadSpaces}
      />

      <UploadZone
        uploading={upload.uploading}
        uploadProgress={upload.uploadProgress}
        fileStatuses={upload.fileStatuses}
        dragActive={upload.dragActive}
        spaces={data.spaces}
        uploadSpaceId={data.uploadSpaceId}
        activeSpaceId={data.activeSpaceId}
        fileInputRef={fileInputRef}
        onFileUpload={upload.handleFileUpload}
        onDrag={upload.handleDrag}
        onDragEnter={upload.handleDragEnter}
        onDragLeave={upload.handleDragLeave}
        onDrop={upload.handleDrop}
      />

      {data.error && (
        <div
          className="dm-error flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-md py-3 px-4 mb-4 text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle aria-hidden="true" size={18} />
          <span>{data.error}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => data.setError(null)}
            aria-label="Fehlermeldung schließen"
            className="ml-auto text-destructive"
          >
            <X aria-hidden="true" size={18} />
          </Button>
        </div>
      )}

      <SemanticSearch
        query={actions.semanticSearch}
        setQuery={actions.setSemanticSearch}
        searching={actions.searching}
        results={actions.searchResults}
        onSearch={actions.handleSemanticSearch}
        onClear={() => actions.setSearchResults(null)}
      />

      <DocumentFilters
        searchQuery={data.searchQuery}
        statusFilter={data.statusFilter}
        categoryFilter={data.categoryFilter}
        categories={data.categories}
        loading={data.loading}
        cleaningUp={cleaningUp}
        onSearchChange={data.setSearchQuery}
        onStatusChange={data.setStatusFilter}
        onCategoryChange={data.setCategoryFilter}
        onReload={data.reloadDocuments}
        onCleanup={handleCleanup}
        onCreateTable={() => setShowSimpleTableCreate(true)}
        onCreateDocument={() => setShowMarkdownCreate(true)}
      />

      <BatchActionToolbar
        selectionCount={batch.selectionCount}
        spaces={data.spaces}
        onDelete={batch.handleBatchDelete}
        onReindex={batch.handleBatchReindex}
        onMove={batch.handleBatchMove}
        onClear={batch.clearSelection}
      />

      <DocumentList
        items={combinedItems}
        spaces={data.spaces}
        loading={data.loading}
        loadingTables={data.loadingTables}
        selectedIds={batch.selectedIds}
        allDocsSelected={batch.allDocsSelected}
        someDocsSelected={batch.someDocsSelected}
        hasActiveFilter={hasActiveFilter}
        searchQuery={data.searchQuery}
        onToggleSelect={batch.toggleSelect}
        onToggleSelectAll={batch.toggleSelectAll}
        onResetFilters={handleResetFilters}
        onUploadClick={() => fileInputRef.current?.click()}
        onCreateDocument={() => setShowMarkdownCreate(true)}
        onMoveDocument={handleMoveDocument}
        onViewDocument={actions.viewDocumentDetails}
        onEditDocument={handleEditDocument}
        onDownloadDocument={actions.handleDownload}
        onDeleteDocument={actions.handleDelete}
        onReindexDocument={actions.handleReindex}
        onToggleFavorite={actions.toggleFavorite}
        onEditTable={handleTableEdit}
        onDeleteTable={handleDeleteTable}
      />

      <DocumentPagination
        currentPage={data.currentPage}
        totalPages={totalPages}
        itemsPerPage={data.itemsPerPage}
        totalEntries={data.totalDocuments + data.totalTables}
        onPageChange={data.setCurrentPage}
        onItemsPerPageChange={data.setItemsPerPage}
      />

      {actions.showDetails && actions.selectedDocument && (
        <DocumentDetailsModal
          document={actions.selectedDocument}
          isOpen={true}
          onClose={() => actions.setShowDetails(false)}
          onEdit={handleEditDocument}
          onDownload={actions.handleDownload}
          onDelete={actions.handleDelete}
          onReindex={actions.handleReindex}
          loadingSimilar={actions.loadingSimilar}
          similarDocuments={actions.similarDocuments}
          isEditable={isEditableDoc}
        />
      )}

      {showEditor && editingDocument && (
        <TipTapEditor
          documentId={editingDocument.id}
          filename={editingDocument.filename}
          onClose={handleEditorClose}
          onSave={handleEditorSave}
          token={getValidToken()}
        />
      )}

      <ComponentErrorBoundary componentName="Space-Modal">
        <SpaceModal
          isOpen={showSpaceModal}
          onClose={() => {
            setShowSpaceModal(false);
            setEditingSpace(null);
          }}
          onSave={handleSpaceSave}
          space={editingSpace}
          mode={editingSpace ? 'edit' : 'create'}
        />
      </ComponentErrorBoundary>

      {showMarkdownCreate && (
        <CreateDocumentDialog
          type="markdown"
          isOpen={showMarkdownCreate}
          onClose={() => setShowMarkdownCreate(false)}
          onCreated={handleMarkdownCreated}
          spaceId={data.activeSpaceId || data.uploadSpaceId}
          spaces={data.spaces}
        />
      )}

      {showSimpleTableCreate && (
        <CreateDocumentDialog
          type="table"
          isOpen={showSimpleTableCreate}
          onClose={() => setShowSimpleTableCreate(false)}
          onCreated={handleDataTableCreated}
          spaceId={data.activeSpaceId || data.uploadSpaceId}
          spaces={data.spaces}
        />
      )}

      {showTableEditor && editingTable && (
        <ExcelEditor
          tableSlug={editingTable.slug}
          tableName={editingTable.name}
          onClose={handleTableEditorClose}
        />
      )}

      {ConfirmDialog}
    </main>
  );
}

export default DocumentManager;
