import { useState, useEffect, useCallback, useMemo } from 'react';
import { FiMessageSquare, FiPlus, FiSearch, FiX } from 'react-icons/fi';
import { useApi } from '../../hooks/useApi';
import { useChatContext } from '../../contexts/ChatContext';
import { useToast } from '../../contexts/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import { ProjectModal } from '../projects';
import ProjectCard from './ProjectCard';
import RecentChatCard from './RecentChatCard';
import { formatRelativeTime } from './utils';
import './chatlanding.css';

export default function ChatLanding() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { activeJobIds } = useChatContext();

  // Data state
  const [projects, setProjects] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(true);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [expandedProjects, setExpandedProjects] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem('arasul_landing_expanded_projects') || '[]'));
    } catch {
      return new Set();
    }
  });
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [editingProject, setEditingProject] = useState(null);

  // Load projects and recent chats
  const loadData = useCallback(
    async signal => {
      try {
        const [projData, recentData] = await Promise.all([
          api.get('/projects?include=conversations', { signal, showError: false }),
          api.get('/chats/recent', { signal, showError: false }),
        ]);
        setProjects(projData.projects || []);
        setRecentChats(recentData.chats || []);
      } catch (err) {
        if (signal?.aborted) return;
        console.error('Error loading chat landing data:', err);
      } finally {
        setLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    const controller = new AbortController();
    loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: searchQuery.trim() });
        if (selectedFilter) params.append('project_id', selectedFilter);
        const data = await api.get(`/chats/search?${params}`, { showError: false });
        setSearchResults(data.chats || []);
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedFilter, api]);

  // Expand/collapse projects
  const toggleProject = useCallback(projectId => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      localStorage.setItem('arasul_landing_expanded_projects', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Filter chips
  const toggleFilter = useCallback(projectId => {
    setSelectedFilter(prev => (prev === projectId ? null : projectId));
  }, []);

  // Project modal handlers
  const openNewProject = useCallback(() => {
    setModalMode('create');
    setEditingProject(null);
    setShowModal(true);
  }, []);

  const openEditProject = useCallback(project => {
    setModalMode('edit');
    setEditingProject(project);
    setShowModal(true);
  }, []);

  const handleProjectSave = useCallback(
    savedProject => {
      if (!savedProject) {
        // Project was deleted
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

  // Delete project with confirmation
  const handleDeleteProject = useCallback(
    async project => {
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
        // Reload to update chat counts on default project
        loadData();
      } catch (err) {
        console.error('Error deleting project:', err);
        toast.error('Löschen fehlgeschlagen');
      }
    },
    [api, confirm, toast, loadData]
  );

  // Delete chat from landing page
  const handleDeleteChat = useCallback(
    async (chatId, chatTitle) => {
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
        // Update local state
        setProjects(prev =>
          prev.map(p => ({
            ...p,
            conversations: p.conversations?.filter(c => c.id !== chatId),
            conversation_count: Math.max(
              0,
              (p.conversation_count || 0) - (p.conversations?.some(c => c.id === chatId) ? 1 : 0)
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

  // Rename chat from landing page
  const handleRenameChat = useCallback(
    async (chatId, newTitle) => {
      try {
        await api.patch(`/chats/${chatId}`, { title: newTitle });
        // Update local state
        setProjects(prev =>
          prev.map(p => ({
            ...p,
            conversations: p.conversations?.map(c =>
              c.id === chatId ? { ...c, title: newTitle } : c
            ),
          }))
        );
        setRecentChats(prev => prev.map(c => (c.id === chatId ? { ...c, title: newTitle } : c)));
        toast.success('Chat umbenannt');
      } catch (err) {
        console.error('Error renaming chat:', err);
        toast.error('Umbenennen fehlgeschlagen');
      }
    },
    [api, toast]
  );

  // Filtered projects based on selected filter
  const displayedProjects = useMemo(() => {
    if (!selectedFilter) return projects;
    return projects.filter(p => p.id === selectedFilter);
  }, [projects, selectedFilter]);

  // Filtered recent chats
  const displayedRecentChats = useMemo(() => {
    if (!selectedFilter) return recentChats;
    return recentChats.filter(c => c.project_id === selectedFilter);
  }, [recentChats, selectedFilter]);

  if (loading) {
    return (
      <div className="chat-landing">
        <div className="chat-landing-header">
          <h1>
            <FiMessageSquare /> Chat
          </h1>
        </div>
        <div className="chat-landing-skeleton">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  const isSearching = searchQuery.trim().length > 0;

  return (
    <main className="chat-landing">
      <header className="chat-landing-header">
        <h1>
          <FiMessageSquare /> Chat
        </h1>
        <button type="button" className="btn-new-project" onClick={openNewProject}>
          <FiPlus /> Neues Projekt
        </button>
      </header>

      {/* Search and Filter */}
      <div className="chat-landing-search">
        <div className="search-input-wrapper">
          <FiSearch />
          <input
            type="text"
            placeholder="Chats durchsuchen..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Suche leeren"
            >
              <FiX />
            </button>
          )}
        </div>
        {projects.length > 1 && (
          <div className="project-filter-chips">
            {projects.map(p => (
              <button
                key={p.id}
                type="button"
                className={`filter-chip ${selectedFilter === p.id ? 'active' : ''}`}
                style={{ borderColor: selectedFilter === p.id ? p.color : undefined }}
                onClick={() => toggleFilter(p.id)}
              >
                <span className="filter-chip-dot" style={{ background: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {isSearching ? (
        /* Search Results */
        <section className="search-results">
          {searchResults === null ? (
            <div className="chat-landing-skeleton">
              <div className="skeleton-card" />
              <div className="skeleton-card" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="search-results-empty">
              Keine Chats gefunden für &ldquo;{searchQuery}&rdquo;
            </div>
          ) : (
            searchResults.map(chat => (
              <RecentChatCard key={chat.id} chat={chat} hasActiveJob={!!activeJobIds[chat.id]} />
            ))
          )}
        </section>
      ) : (
        <>
          {/* Recent Chats */}
          {displayedRecentChats.length > 0 && (
            <section className="recent-chats-section">
              <h2>Letzte Chats</h2>
              <div className="recent-chats-list">
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

          {/* Projects */}
          <section className="projects-section">
            <h2>Projekte</h2>
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
              <div className="search-results-empty">Keine Projekte gefunden.</div>
            )}
          </section>
        </>
      )}

      {/* Project Create/Edit Modal */}
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
