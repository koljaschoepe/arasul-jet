import React from 'react';
import { FiInbox } from 'react-icons/fi';

/**
 * EmptyState - Reusable empty state display
 * Uses .empty-state CSS classes from index.css
 *
 * @param {React.ReactNode} icon - Icon component or emoji (default: FiInbox)
 * @param {string} title - Main message title
 * @param {string} description - Optional description text
 * @param {React.ReactNode} action - Optional action button/link
 */
function EmptyState({ icon, title, description, action }) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-state-icon">{icon || <FiInbox />}</div>
      {title && <div className="empty-state-title">{title}</div>}
      {description && <div className="empty-state-description">{description}</div>}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}

export default EmptyState;
