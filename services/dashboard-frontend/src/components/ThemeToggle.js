import React from 'react';
import { FiSun, FiMoon } from 'react-icons/fi';
import { useTheme } from '../contexts/ThemeContext';
import './ThemeToggle.css';

function ThemeToggle({ compact = false }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      className={`theme-toggle ${compact ? 'theme-toggle-compact' : ''}`}
      onClick={toggleTheme}
      title={isDark ? 'Light Mode aktivieren' : 'Dark Mode aktivieren'}
      aria-label={isDark ? 'Zu Light Mode wechseln' : 'Zu Dark Mode wechseln'}
    >
      <span className="theme-toggle-icon">
        {isDark ? <FiSun /> : <FiMoon />}
      </span>
      {!compact && (
        <span className="theme-toggle-label">
          {isDark ? 'Light' : 'Dark'}
        </span>
      )}
    </button>
  );
}

export default ThemeToggle;
