import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  MessageSquare,
  Database,
  Package,
  Download,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/shadcn/scroll-area';
import { useDownloads } from '@/contexts/DownloadContext';
import { PLATFORM_NAME, PLATFORM_SUBTITLE } from '@/config/branding';

// Preload functions for lazy-loaded route chunks (triggered on hover)
const preloadDocuments = () => import('@/features/documents/DocumentManager');
const preloadStore = () => import('@/features/store');
const preloadSettings = () => import('@/features/settings/Settings');

interface DownloadInfo {
  modelId: string;
  modelName?: string;
  progress: number;
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface SidebarInnerProps extends SidebarProps {
  downloadCount: number;
  activeDownloads: DownloadInfo[];
}

export function SidebarWithDownloads({ collapsed, onToggle }: SidebarProps) {
  const { activeDownloadCount, activeDownloadsList } = useDownloads();
  return (
    <SidebarNav
      collapsed={collapsed}
      onToggle={onToggle}
      downloadCount={activeDownloadCount}
      activeDownloads={activeDownloadsList}
    />
  );
}

const SidebarNav = React.memo(function SidebarNav({
  collapsed,
  onToggle,
  downloadCount = 0,
  activeDownloads = [],
}: SidebarInnerProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    const isMatch =
      path === '/'
        ? location.pathname === path
        : location.pathname === path || location.pathname.startsWith(path + '/');
    return isMatch ? 'nav-link active' : 'nav-link';
  };

  const isCurrent = (path: string) => location.pathname === path;

  const sidebarClassName = `sidebar ${collapsed ? 'collapsed' : 'expanded'}`;

  return (
    <aside className={sidebarClassName} aria-label="Hauptnavigation">
      <div className="sidebar-header">
        <h1 className="sidebar-title">{collapsed ? PLATFORM_NAME[0] : PLATFORM_NAME}</h1>
        <p className="sidebar-subtitle">{PLATFORM_SUBTITLE}</p>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="sidebar-nav"
          aria-label={collapsed ? 'Sidebar erweitern' : 'Sidebar minimieren'}
          title={collapsed ? 'Sidebar erweitern (Ctrl+B)' : 'Sidebar minimieren (Ctrl+B)'}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <nav id="sidebar-nav" className="navigation" aria-label="Hauptmenü">
          <ul className="nav-bar" role="menubar">
            <li role="none">
              <Link
                to="/"
                className={isActive('/')}
                role="menuitem"
                aria-current={isCurrent('/') ? 'page' : undefined}
              >
                <Home aria-hidden="true" /> <span>Dashboard</span>
              </Link>
            </li>
            <li role="none">
              <Link
                to="/chat"
                className={isActive('/chat')}
                role="menuitem"
                aria-current={isCurrent('/chat') ? 'page' : undefined}
              >
                <MessageSquare aria-hidden="true" /> <span>Chat</span>
              </Link>
            </li>
            <li role="none">
              <Link
                to="/data"
                className={isActive('/data')}
                role="menuitem"
                aria-current={isCurrent('/data') ? 'page' : undefined}
                onMouseEnter={preloadDocuments}
              >
                <Database aria-hidden="true" /> <span>Data</span>
              </Link>
            </li>
            <li role="none">
              <Link
                to="/store"
                className={`${isActive('/store')} ${downloadCount > 0 ? 'has-downloads' : ''}`}
                role="menuitem"
                aria-current={isCurrent('/store') ? 'page' : undefined}
                aria-label={downloadCount > 0 ? `Store, ${downloadCount} Downloads aktiv` : 'Store'}
                onMouseEnter={preloadStore}
              >
                <Package aria-hidden="true" />
                <span>Store</span>
                {downloadCount > 0 && (
                  <span className="download-badge" aria-hidden="true">
                    <Download className="download-badge-icon" />
                    {!collapsed && downloadCount}
                  </span>
                )}
              </Link>
            </li>
          </ul>
        </nav>
      </ScrollArea>

      {downloadCount > 0 && !collapsed && (
        <section className="sidebar-downloads" aria-label="Aktive Downloads">
          <div className="sidebar-downloads-header">
            <Download className="spin-slow" aria-hidden="true" />
            <span>Downloads</span>
          </div>
          <ul className="sidebar-downloads-list">
            {activeDownloads.slice(0, 3).map(dl => (
              <li key={dl.modelId} className="sidebar-download-item">
                <span className="sidebar-download-name">{dl.modelName || dl.modelId}</span>
                <div
                  className="sidebar-download-progress"
                  role="progressbar"
                  aria-valuenow={dl.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${dl.modelName || dl.modelId} Download`}
                >
                  <div className="sidebar-download-bar" style={{ width: `${dl.progress}%` }} />
                </div>
                <span className="sidebar-download-percent" aria-hidden="true">
                  {dl.progress}%
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sidebar-footer">
        <Link
          to="/settings"
          className={isActive('/settings')}
          aria-current={isCurrent('/settings') ? 'page' : undefined}
          onMouseEnter={preloadSettings}
        >
          <Settings aria-hidden="true" /> <span>Einstellungen</span>
        </Link>
      </div>
    </aside>
  );
});
