import React, { useState } from 'react';
import {
  FiSettings,
  FiUpload,
  FiTool,
  FiLock,
  FiInfo,
  FiChevronRight
} from 'react-icons/fi';
import UpdatePage from './UpdatePage';
import SelfHealingEvents from './SelfHealingEvents';
import PasswordManagement from './PasswordManagement';
import '../settings.css';

function Settings() {
  const [activeSection, setActiveSection] = useState('general');

  const sections = [
    {
      id: 'general',
      label: 'General',
      icon: <FiInfo />,
      description: 'System information and configuration'
    },
    {
      id: 'updates',
      label: 'Updates',
      icon: <FiUpload />,
      description: 'Manage system updates'
    },
    {
      id: 'selfhealing',
      label: 'Self-Healing',
      icon: <FiTool />,
      description: 'View system recovery events'
    },
    {
      id: 'security',
      label: 'Security',
      icon: <FiLock />,
      description: 'Password and access management'
    },
  ];

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return <GeneralSettings />;
      case 'updates':
        return <UpdatePage />;
      case 'selfhealing':
        return <SelfHealingEvents />;
      case 'security':
        return <PasswordManagement />;
      default:
        return <GeneralSettings />;
    }
  };

  return (
    <div className="settings-layout">
      {/* Sidebar Navigation */}
      <div className="settings-sidebar">
        <div className="settings-sidebar-header">
          <FiSettings className="settings-sidebar-icon" />
          <div>
            <h2 className="settings-sidebar-title">Einstellungen</h2>
            <p className="settings-sidebar-subtitle">System-Konfiguration</p>
          </div>
        </div>

        <nav className="settings-nav">
          {sections.map((section) => (
            <button
              key={section.id}
              className={`settings-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => setActiveSection(section.id)}
            >
              <div className="settings-nav-item-content">
                <div className="settings-nav-item-icon">{section.icon}</div>
                <div className="settings-nav-item-text">
                  <span className="settings-nav-item-label">{section.label}</span>
                  <span className="settings-nav-item-description">{section.description}</span>
                </div>
              </div>
              <FiChevronRight className="settings-nav-item-arrow" />
            </button>
          ))}
        </nav>
      </div>

      {/* Main Content Area */}
      <div className="settings-content-area">
        <div className="settings-content-wrapper">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// General Settings Component
function GeneralSettings() {
  const [systemInfo, setSystemInfo] = useState({
    version: '1.0.0',
    hostname: 'arasul-edge',
    jetpack_version: '6.0',
    docker_version: '24.0.7',
    compose_version: '2.21.0'
  });

  return (
    <div className="settings-section">
      <div className="settings-section-header">
        <h1 className="settings-section-title">General</h1>
        <p className="settings-section-description">System information and configuration</p>
      </div>

      <div className="settings-cards">
        {/* System Information */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">System Information</h3>
            <p className="settings-card-description">Basic system details and versions</p>
          </div>
          <div className="settings-card-body">
            <div className="settings-info-grid">
              <div className="settings-info-item">
                <span className="settings-info-label">Platform Version</span>
                <span className="settings-info-value">{systemInfo.version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Hostname</span>
                <span className="settings-info-value">{systemInfo.hostname}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">JetPack Version</span>
                <span className="settings-info-value">{systemInfo.jetpack_version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Docker Version</span>
                <span className="settings-info-value">{systemInfo.docker_version}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">Docker Compose</span>
                <span className="settings-info-value">{systemInfo.compose_version}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Platform Info */}
        <div className="settings-card">
          <div className="settings-card-header">
            <h3 className="settings-card-title">About Arasul Platform</h3>
            <p className="settings-card-description">Edge AI platform for NVIDIA Jetson</p>
          </div>
          <div className="settings-card-body">
            <p className="settings-about-text">
              Arasul ist eine autonome Edge-AI-Plattform, die auf NVIDIA Jetson AGX Orin läuft.
              Die Plattform bietet lokale KI-Funktionen, Multi-Jahres-Betrieb ohne Wartung und
              ein einheitliches Dashboard-Interface.
            </p>
            <div className="settings-about-features">
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>Offline-First Design</strong>
                  <span>Funktioniert ohne Internetverbindung</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>Self-Healing System</strong>
                  <span>Automatische Fehlerkorrektur und Recovery</span>
                </div>
              </div>
              <div className="settings-feature-item">
                <div className="settings-feature-icon"></div>
                <div className="settings-feature-text">
                  <strong>GPU-Accelerated AI</strong>
                  <span>Lokale LLMs und Embedding-Modelle</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
