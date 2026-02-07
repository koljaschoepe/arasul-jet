/**
 * Store Component
 * Unified store for AI models, apps and extensions
 * Combines the former ModelStore and AppStore into a single interface
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import {
  FiPackage,
  FiSearch,
  FiX,
  FiCpu,
  FiGrid,
  FiHome
} from 'react-icons/fi';
import { useDownloads } from '../../contexts/DownloadContext';
import StoreHome from './StoreHome';
import StoreModels from './StoreModels';
import StoreApps from './StoreApps';
import { API_BASE } from '../../config/api';
import './Store.css';

function Store() {
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ models: [], apps: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [systemInfo, setSystemInfo] = useState({ availableRamGB: 64, availableDiskGB: 100 });

  // Get auth headers
  const getAuthHeaders = () => {
    const token = localStorage.getItem('arasul_token');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  // Load system info for RAM-based recommendations
  useEffect(() => {
    const loadSystemInfo = async () => {
      try {
        const response = await fetch(`${API_BASE}/store/info`, {
          headers: getAuthHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setSystemInfo(data);
        }
      } catch (err) {
        console.error('Failed to load system info:', err);
      }
    };
    loadSystemInfo();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ models: [], apps: [] });
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_BASE}/store/search?q=${encodeURIComponent(searchQuery)}`,
          { headers: getAuthHeaders() }
        );
        if (response.ok) {
          const data = await response.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Determine active tab from URL
  const activeTab = useMemo(() => {
    if (location.pathname === '/store' || location.pathname === '/store/') return 'home';
    if (location.pathname.startsWith('/store/models')) return 'models';
    if (location.pathname.startsWith('/store/apps')) return 'apps';
    return 'home';
  }, [location.pathname]);

  // Clear search when navigating
  const handleTabClick = () => {
    if (searchQuery) {
      setSearchQuery('');
    }
  };

  return (
    <div className="store">
      {/* Header */}
      <div className="store-header">
        <div className="store-header-top">
          <div className="store-title">
            <FiPackage />
            <h1>Store</h1>
          </div>

          {/* Global Search */}
          <div className="store-search">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Modelle und Apps durchsuchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Store durchsuchen"
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Suche leeren"
              >
                <FiX />
              </button>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="store-tabs" role="tablist">
          <NavLink
            to="/store"
            end
            className={({ isActive }) => `store-tab ${isActive ? 'active' : ''}`}
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'home'}
          >
            <FiHome />
            <span>Start</span>
          </NavLink>
          <NavLink
            to="/store/models"
            className={({ isActive }) => `store-tab ${isActive ? 'active' : ''}`}
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'models'}
          >
            <FiCpu />
            <span>Modelle</span>
          </NavLink>
          <NavLink
            to="/store/apps"
            className={({ isActive }) => `store-tab ${isActive ? 'active' : ''}`}
            onClick={handleTabClick}
            role="tab"
            aria-selected={activeTab === 'apps'}
          >
            <FiGrid />
            <span>Apps</span>
          </NavLink>
        </nav>
      </div>

      {/* Search Results Overlay */}
      {searchQuery && (
        <div className="store-search-results">
          {isSearching ? (
            <div className="search-loading">Suche...</div>
          ) : (
            <>
              {searchResults.models.length > 0 && (
                <div className="search-section">
                  <h3><FiCpu /> Modelle ({searchResults.models.length})</h3>
                  <div className="search-items">
                    {searchResults.models.slice(0, 5).map(model => (
                      <NavLink
                        key={model.id}
                        to={`/store/models?highlight=${model.id}`}
                        className="search-item"
                        onClick={() => setSearchQuery('')}
                      >
                        <span className="search-item-name">{model.name}</span>
                        <span className="search-item-meta">{model.category}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
              {searchResults.apps.length > 0 && (
                <div className="search-section">
                  <h3><FiGrid /> Apps ({searchResults.apps.length})</h3>
                  <div className="search-items">
                    {searchResults.apps.slice(0, 5).map(app => (
                      <NavLink
                        key={app.id}
                        to={`/store/apps?highlight=${app.id}`}
                        className="search-item"
                        onClick={() => setSearchQuery('')}
                      >
                        <span className="search-item-name">{app.name}</span>
                        <span className="search-item-meta">{app.category}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              )}
              {searchResults.models.length === 0 && searchResults.apps.length === 0 && (
                <div className="search-empty">
                  Keine Ergebnisse für "{searchQuery}"
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div className="store-content">
        <Routes>
          <Route index element={<StoreHome systemInfo={systemInfo} />} />
          <Route path="models" element={<StoreModels />} />
          <Route path="apps" element={<StoreApps />} />
          <Route path="*" element={<Navigate to="/store" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default Store;
