import { useApi } from '../../hooks/useApi';

/**
 * useChatActions - Chat CRUD operations, title editing, and export
 */
export default function useChatActions({
  chats,
  setChats,
  currentChatId,
  setCurrentChatId,
  setMessages,
  setInput,
  setError,
  setLoadingChats,
  editingTitle,
  setEditingChatId,
  setEditingTitle,
}) {
  const api = useApi();

  const createNewChat = async () => {
    try {
      setLoadingChats(true);
      const responseData = await api.post('/chats', { title: 'New Chat' }, { showError: false });
      const newChat = responseData.chat;

      setChats(prevChats => [...prevChats, newChat]);
      setCurrentChatId(newChat.id);
      setMessages([]);
      setInput('');
      setError(null);
    } catch (err) {
      console.error('Error creating chat:', err);
      setError('Fehler beim Erstellen des Chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const selectChat = chatId => {
    setCurrentChatId(chatId);
  };

  const deleteChat = async (e, chatId) => {
    e.stopPropagation();
    if (chats.length <= 1) return;

    try {
      await api.del(`/chats/${chatId}`, { showError: false });
      const updatedChats = chats.filter(c => c.id !== chatId);
      setChats(updatedChats);
      if (currentChatId === chatId) {
        setCurrentChatId(updatedChats[0]?.id || null);
      }
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  const startEditingTitle = (e, chat) => {
    e.stopPropagation();
    setEditingChatId(chat.id);
    setEditingTitle(chat.title);
  };

  const saveTitle = async chatId => {
    if (!editingTitle.trim()) {
      cancelEditingTitle();
      return;
    }
    try {
      await api.patch(`/chats/${chatId}`, { title: editingTitle }, { showError: false });
      setChats(prevChats =>
        prevChats.map(c => (c.id === chatId ? { ...c, title: editingTitle } : c))
      );
      setEditingChatId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('Error updating title:', err);
    }
  };

  const cancelEditingTitle = () => {
    setEditingChatId(null);
    setEditingTitle('');
  };

  const handleTitleKeyDown = (e, chatId) => {
    if (e.key === 'Enter') {
      saveTitle(chatId);
    } else if (e.key === 'Escape') {
      cancelEditingTitle();
    }
  };

  const exportChat = async (e, chatId, format = 'json') => {
    e.stopPropagation();
    try {
      const response = await api.get(`/chats/${chatId}/export?format=${format}`, {
        raw: true,
        showError: false,
      });

      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `chat-${chatId}.${format === 'json' ? 'json' : 'md'}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
        if (filenameMatch) filename = filenameMatch[1];
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error exporting chat:', err);
      setError('Export fehlgeschlagen');
    }
  };

  return {
    createNewChat,
    selectChat,
    deleteChat,
    startEditingTitle,
    saveTitle,
    cancelEditingTitle,
    handleTitleKeyDown,
    exportChat,
  };
}
