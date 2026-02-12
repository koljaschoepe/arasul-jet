import React, { useState, useCallback, memo } from 'react';
import { FiPlus, FiChevronRight, FiEdit2, FiDownload, FiTrash2 } from 'react-icons/fi';

/**
 * ChatTabsBar - Horizontal tab bar for managing chat conversations.
 * Includes new chat button, tab selection, rename, export, delete actions,
 * and job indicators for streaming/queued chats.
 */
const ChatTabsBar = memo(function ChatTabsBar({
  chats,
  currentChatId,
  activeJobIds,
  globalQueue,
  editingChatId,
  editingTitle,
  tabsContainerRef,
  onCreateNewChat,
  onSelectChat,
  onStartEditingTitle,
  onEditingTitleChange,
  onTitleKeyDown,
  onSaveTitle,
  onExportChat,
  onDeleteChat,
}) {
  const [hoveredChatId, setHoveredChatId] = useState(null);

  // WAI-ARIA tabs pattern: arrow key navigation between tabs
  const handleTabKeyDown = useCallback(
    (e, chatIndex) => {
      let nextIndex;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextIndex = (chatIndex + 1) % chats.length;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nextIndex = (chatIndex - 1 + chats.length) % chats.length;
      } else if (e.key === 'Home') {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === 'End') {
        e.preventDefault();
        nextIndex = chats.length - 1;
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectChat(chats[chatIndex].id);
        return;
      } else {
        return;
      }
      onSelectChat(chats[nextIndex].id);
      // Focus the newly selected tab
      const tabsEl = tabsContainerRef?.current;
      if (tabsEl) {
        const tabs = tabsEl.querySelectorAll('[role="tab"]');
        tabs[nextIndex]?.focus();
      }
    },
    [chats, onSelectChat, tabsContainerRef]
  );

  return (
    <div className="chat-tabs-bar" role="tablist" aria-label="Chat-Unterhaltungen">
      <button
        className="new-chat-tab-btn"
        onClick={onCreateNewChat}
        title="Neuer Chat (Ctrl+T)"
        aria-label="Neuen Chat erstellen"
      >
        <FiPlus aria-hidden="true" />
      </button>

      <div className="chat-tabs" ref={tabsContainerRef}>
        {chats.map((chat, chatIndex) => (
          <div
            key={chat.id}
            role="tab"
            tabIndex={currentChatId === chat.id ? 0 : -1}
            aria-selected={currentChatId === chat.id}
            aria-controls={`chat-panel-${chat.id}`}
            aria-label={chat.title}
            className={`chat-tab ${currentChatId === chat.id ? 'active' : ''} ${activeJobIds[chat.id] ? 'has-active-job' : ''}`}
            onClick={() => onSelectChat(chat.id)}
            onKeyDown={e => handleTabKeyDown(e, chatIndex)}
            onMouseEnter={() => setHoveredChatId(chat.id)}
            onMouseLeave={() => setHoveredChatId(null)}
          >
            {/* Job indicator for streaming/queued chats */}
            {activeJobIds[chat.id] ? (
              (() => {
                const jobId = activeJobIds[chat.id];
                const isProcessing = globalQueue.processing?.id === jobId;
                const queueJob = globalQueue.queue?.find(q => q.id === jobId);
                const queuePosition = queueJob?.queue_position;

                return (
                  <span
                    className="job-indicator"
                    title={
                      isProcessing
                        ? 'Wird verarbeitet...'
                        : queuePosition > 1
                          ? `Position ${queuePosition} in der Warteschlange`
                          : 'Wartet...'
                    }
                  >
                    <span className={`pulse-dot ${isProcessing ? 'active' : 'queued'}`}></span>
                    {!isProcessing && queuePosition > 1 && (
                      <span className="queue-position">#{queuePosition}</span>
                    )}
                  </span>
                );
              })()
            ) : (
              <FiChevronRight className="tab-icon" />
            )}
            {editingChatId === chat.id ? (
              <input
                type="text"
                value={editingTitle}
                onChange={e => onEditingTitleChange(e.target.value)}
                onKeyDown={e => onTitleKeyDown(e, chat.id)}
                onBlur={() => onSaveTitle(chat.id)}
                autoFocus
                className="tab-title-input"
                aria-label="Chat-Titel bearbeiten"
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span className="tab-title">{chat.title}</span>
            )}
            {/* Show actions on hover or if active */}
            {(hoveredChatId === chat.id || currentChatId === chat.id) &&
              editingChatId !== chat.id && (
                <div className="tab-actions" role="group" aria-label={`Aktionen für ${chat.title}`}>
                  <button
                    className="tab-action-btn"
                    onClick={e => onStartEditingTitle(e, chat)}
                    aria-label={`Chat "${chat.title}" umbenennen`}
                  >
                    <FiEdit2 aria-hidden="true" />
                  </button>
                  <button
                    className="tab-action-btn export"
                    onClick={e => onExportChat(e, chat.id, 'markdown')}
                    aria-label={`Chat "${chat.title}" als Markdown exportieren`}
                  >
                    <FiDownload aria-hidden="true" />
                  </button>
                  {chats.length > 1 && (
                    <button
                      className="tab-action-btn delete"
                      onClick={e => onDeleteChat(e, chat.id)}
                      aria-label={`Chat "${chat.title}" löschen`}
                    >
                      <FiTrash2 aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
          </div>
        ))}
      </div>
    </div>
  );
});

export default ChatTabsBar;
