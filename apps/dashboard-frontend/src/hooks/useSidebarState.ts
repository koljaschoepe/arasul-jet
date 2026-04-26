import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'arasul_sidebar_collapsed';

interface UseSidebarStateResult {
  collapsed: boolean;
  toggle: () => void;
}

/**
 * Manages sidebar collapsed state with localStorage persistence and Cmd/Ctrl+B
 * keyboard shortcut. Also syncs body class so overlay components (e.g. markdown
 * editor) can react to layout changes.
 */
export function useSidebarState(): UseSidebarStateResult {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : false;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    document.body.classList.remove('sidebar-expanded', 'sidebar-collapsed');
    document.body.classList.add(collapsed ? 'sidebar-collapsed' : 'sidebar-expanded');
  }, [collapsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return { collapsed, toggle };
}
