import { useState, useCallback, useMemo } from 'react';
import { MessageSquare, Plus, Search, X, FolderOpen } from 'lucide-react';
import { useApi } from '../../hooks/useApi';
import { useFetchData } from '../../hooks/useFetchData';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import { useChatContext } from '../../contexts/ChatContext';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { ProjectModal } from '../projects';
import ProjectCard from './ProjectCard';
import RecentChatCard from './RecentChatCard';
import EmptyState from '../../components/ui/EmptyState';
import { Button } from '@/components/ui/shadcn/button';
import { formatRelativeTime } from './utils';
import { cn } from '@/lib/utils';
import './chat.css';

export default function ChatLanding() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { activeJobIds } = useChatContext();

  const fetcher = useCallback(
    async (signal: AbortSignal) => {
      const [projData, recentData] = await Promise.all([
        api.get('/projects?include=conversations', { signal, showError: false }),
        api.get('/chats/recent', { signal, showError: false }),
      ]);
      return {
        projects: (projData as any).projects || [],
        recentChats: (recentData as any).chats || [],
      };
    },
    [api]
  );

  const {
    data: { projects, recentChats },
    setData,
    loading,
    refetch: loadData,
  } = useFetchData(fetcher, {
    initialData: { projects: [] as any[], recentChats: [] as any[] },
    errorMessage: 'Error loading chat landing data',
  });

  // Helpers to update projects/recentChats individually
  const setProjects = useCallback(
    (updater: (prev: any[]) => any[]) =>
      setData(prev => ({ ...prev, projects: updater(prev.projects) })),
    [setData]
  );
  const setRecentChats = useCallback(
    (updater: (prev: any[]) => any[]) =>
      setData(prev => ({ ...prev, recentChats: updater(prev.recentChats) })),
    [setData]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<number | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('arasul_landing_expanded_projects') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingProject, setEditingProject] = useState<any>(null);

  const chatSearcher = useCallback(
    async (q: string, signal: AbortSignal) => {
      const params = new URLSearchParams({ q });
      if (selectedFilter) params.append('project_id', String(selectedFilter));
      const data = await api.get<{ chats: any[] }>(`/chats/search?${params}`, {
        signal,
        showError: false,
      });
      return data.chats || [];
    },
    [api, selectedFilter]
  );

  const { results: searchResults, searching: searchLoading } = useDebouncedSearch<any[] | null>(
    searchQuery,
    chatSearcher,
    { initialResults: null, deps: [selectedFilter] }
  );

  const toggleProject = useCallback((projectId: number) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      localStorage.setItem('arasul_landing_expanded_projects', JSON.stringify([...next]));
      return next;
    });
  }, []);

  const toggleFilter = useCallback((projectId: number) => {
    setSelectedFilter(prev => (prev === projectId ? null : projectId));
  }, []);

  const openNewProject = useCallback(() => {
    setModalMode('create');
    setEditingProject(null);
    setShowModal(true);
  }, []);

  const openEditProject = useCallback((project: any) => {
    setModalMode('edit');
    setEditingProject(project);
    setShowModal(true);
  }, []);

  const handleProjectSave = useCallback(
    (savedProject: any) => {
      if (!savedProject) {
        setProjects(prev => prev.filter(p => p.id !== editingProject?.id));
      } else if (modalMode === 'create') {
        setProjects(prev => [
          ...prev,
          { ...savedProject, conversations: [], conversation_count: 0 },
        ]);
      } else {
        setProjects(prev =>
          prev.map(p => (p.id === savedProject.id ? { ...p, ...savedProject } : p))
        );
      }
      setShowModal(false);
    },
    [modalMode, editingProject]
  );

  const handleDeleteProject = useCallback(
    async (project: any) => {
      const chatCount = project.conversation_count || project.conversations?.length || 0;
      const ok = await confirm({
        title: `Projekt "${project.name}" löschen?`,
        message:
          chatCount > 0
            ? `${chatCount} Chat${chatCount !== 1 ? 's' : ''} werden zum Projekt "Allgemein" verschoben.`
            : 'Das leere Projekt wird gelöscht.',
        confirmText: 'Löschen',
      });
      if (!ok) return;
      try {
        await api.del(`/projects/${project.id}`);
        setProjects(prev => prev.filter(p => p.id !== project.id));
        toast.success('Projekt gelöscht');
        loadData();
      } catch (err) {
        console.error('Error deleting project:', err);
        toast.error('Löschen fehlgeschlagen');
      }
    },
    [api, confirm, toast, loadData]
  );

  const handleDeleteChat = useCallback(
    async (chatId: number, chatTitle: string) => {
      const hasActiveJob = !!activeJobIds[chatId];
      const ok = await confirm({
        title: `Chat "${chatTitle || 'Neuer Chat'}" löschen?`,
        message: hasActiveJob
          ? 'Dieser Chat hat eine aktive Verarbeitung. Wirklich löschen?'
          : 'Diese Aktion kann nicht rückgängig gemacht werden.',
        confirmText: 'Löschen',
      });
      if (!ok) return;
      try {
        await api.del(`/chats/${chatId}`);
        setProjects(prev =>
          prev.map(p => ({
            ...p,
            conversations: p.conversations?.filter((c: any) => c.id !== chatId),
            conversation_count: Math.max(
              0,
              (p.conversation_count || 0) -
                (p.conversations?.some((c: any) => c.id === chatId) ? 1 : 0)
            ),
          }))
        );
        setRecentChats(prev => prev.filter(c => c.id !== chatId));
        toast.success('Chat gelöscht');
      } catch (err) {
        console.error('Error deleting chat:', err);
        toast.error('Löschen fehlgeschlagen');
      }
    },
    [api, confirm, toast, activeJobIds]
  );

  const handleRenameChat = useCallback(
    async (chatId: number, newTitle: string) => {
      // Save original titles for rollback
      const origProjects = projects.map(p => ({
        id: p.id,
        conversations: p.conversations?.map((c: any) => ({ id: c.id, title: c.title })),
      }));
      const origRecentChats = recentChats.map(c => ({ id: c.id, title: c.title }));

      // Optimistic update
      setProjects(prev =>
        prev.map(p => ({
          ...p,
          conversations: p.conversations?.map((c: any) =>
            c.id === chatId ? { ...c, title: newTitle } : c
          ),
        }))
      );
      setRecentChats(prev => prev.map(c => (c.id === chatId ? { ...c, title: newTitle } : c)));

      try {
        await api.patch(`/chats/${chatId}`, { title: newTitle });
        toast.success('Chat umbenannt');
      } catch (err) {
        console.error('Error renaming chat:', err);
        // Rollback to original titles
        setProjects(prev =>
          prev.map(p => {
            const orig = origProjects.find(op => op.id === p.id);
            if (!orig) return p;
            return {
              ...p,
              conversations: p.conversations?.map((c: any) => {
                const origConv = orig.conversations?.find((oc: any) => oc.id === c.id);
                return origConv ? { ...c, title: origConv.title } : c;
              }),
            };
          })
        );
        setRecentChats(prev =>
          prev.map(c => {
            const orig = origRecentChats.find(oc => oc.id === c.id);
            return orig ? { ...c, title: orig.title } : c;
          })
        );
        toast.error('Umbenennen fehlgeschlagen');
      }
    },
    [api, toast, projects, recentChats]
  );

  const displayedProjects = useMemo(() => {
    if (!selectedFilter) return projects;
    return projects.filter(p => p.id === selectedFilter);
  }, [projects, selectedFilter]);

  const displayedRecentChats = useMemo(() => {
    if (!selectedFilter) return recentChats;
    return recentChats.filter(c => c.project_id === selectedFilter);
  }, [recentChats, selectedFilter]);

  if (loading) {
    return (
      <div className="chat-landing p-[clamp(1rem,2vw,2rem)] max-w-[1200px] mx-auto">
        <div className="chat-landing-header flex items-center justify-between mb-6 gap-4">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] m-0">
            <MessageSquare className="text-[var(--primary-color)]" /> Chat
          </h1>
        </div>
        <div className="chat-landing-skeleton flex flex-col gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="skeleton-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 h-[52px] animate-[skeleton-pulse_1.5s_ease-in-out_infinite]"
            />
          ))}
        </div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <main className="chat-landing p-[clamp(1rem,2vw,2rem)] max-w-[1200px] mx-auto">
      <header className="chat-landing-header flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)] m-0">
          <MessageSquare className="text-[var(--primary-color)]" /> Chat
        </h1>
        <button
          type="button"
          className="btn-new-project inline-flex items-center gap-1 py-2 px-4 bg-[var(--primary-color)] text-white border-none rounded-lg text-sm font-semibold cursor-pointer transition-all duration-150 hover:-translate-y-px hover:shadow-md hover:opacity-90 active:scale-[0.97]"
          onClick={openNewProject}
        >
          <Plus className="w-4 h-4" /> Neues Projekt
        </button>
      </header>

      <div className="chat-landing-search mb-6">
        <div className="search-input-wrapper flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-color)] rounded-xl py-2.5 px-4 shadow-[inset_0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-150 focus-within:border-[var(--primary-color)] focus-within:shadow-[0_0_0_3px_var(--primary-alpha-15)]">
          <Search className="text-[var(--text-muted)] shrink-0 w-4 h-4" />
          <input
            className="flex-1 bg-transparent border-none text-[var(--text-primary)] text-sm outline-none placeholder:text-[var(--text-muted)]"
            type="text"
            placeholder="Chats durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Chats durchsuchen"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn bg-transparent border-none text-[var(--text-muted)] cursor-pointer p-1 rounded-md flex items-center transition-colors duration-150 hover:text-[var(--text-primary)]"
              onClick={() => setSearchQuery('')}
              aria-label="Suche leeren"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {projects.length > 1 && (
          <div className="project-filter-chips flex flex-wrap gap-1 mt-2">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  'filter-chip inline-flex items-center gap-1.5 py-1 px-3 border border-[var(--border-color)] rounded-full bg-transparent text-[var(--text-muted)] text-xs cursor-pointer transition-all duration-150 hover:border-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--primary-alpha-5)]',
                  selectedFilter === p.id &&
                    'active bg-[var(--primary-alpha-15)] text-[var(--text-primary)] border-[var(--primary-alpha-30)] font-semibold'
                )}
                style={{ borderColor: selectedFilter === p.id ? p.color : undefined }}
                onClick={() => toggleFilter(p.id)}
                aria-pressed={selectedFilter === p.id}
              >
                <span
                  className="filter-chip-dot w-2 h-2 rounded-full shrink-0"
                  style={{ background: p.color }}
                />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isSearching ? (
        <section className="search-results flex flex-col gap-1">
          {searchLoading || searchResults === null ? (
            <div className="chat-landing-skeleton flex flex-col gap-4">
              <div className="skeleton-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 h-[52px] animate-[skeleton-pulse_1.5s_ease-in-out_infinite]" />
              <div className="skeleton-card bg-[var(--bg-card)] border border-[var(--border-subtle)] rounded-xl p-4 h-[52px] animate-[skeleton-pulse_1.5s_ease-in-out_infinite]" />
            </div>
          ) : searchResults.length === 0 ? (
            <EmptyState
              icon={<Search />}
              title={`Keine Chats gefunden für \u201e${searchQuery}\u201c`}
              description="Versuche andere Suchbegriffe oder passe den Projektfilter an."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedFilter(null);
                  }}
                >
                  Filter zurücksetzen
                </Button>
              }
            />
          ) : (
            searchResults.map(chat => (
              <RecentChatCard key={chat.id} chat={chat} hasActiveJob={!!activeJobIds[chat.id]} />
            ))
          )}
        </section>
      ) : (
        <>
          {displayedRecentChats.length > 0 && (
            <section className="recent-chats-section mb-8">
              <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide m-0 mb-4">
                Letzte Chats
              </h2>
              <div className="recent-chats-list grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2">
                {displayedRecentChats.slice(0, 6).map(chat => (
                  <RecentChatCard
                    key={chat.id}
                    chat={chat}
                    hasActiveJob={!!activeJobIds[chat.id]}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="projects-section mb-8">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide m-0 mb-4">
              Projekte
            </h2>
            {displayedProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                activeJobIds={activeJobIds}
                expanded={expandedProjects.has(p.id)}
                onToggle={toggleProject}
                onEdit={openEditProject}
                onDelete={handleDeleteProject}
                onDeleteChat={handleDeleteChat}
                onRenameChat={handleRenameChat}
              />
            ))}
            {displayedProjects.length === 0 && (
              <EmptyState
                icon={<FolderOpen />}
                title="Noch keine Projekte"
                description="Erstelle dein erstes Projekt, um Chats thematisch zu organisieren."
                action={
                  <Button size="sm" onClick={openNewProject}>
                    <Plus className="w-4 h-4 mr-1" /> Neues Projekt erstellen
                  </Button>
                }
              />
            )}
          </section>
        </>
      )}

      <ProjectModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSave={handleProjectSave}
        project={editingProject}
        mode={modalMode}
      />
      {ConfirmDialog}
    </main>
  );
}
