import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useSettingsStore } from '@/stores/settingsStore';
import { resolveTab, resolveSystemSub } from './sections';
import { GeneralSettings } from './GeneralSettings';
import { AppsSettings } from './AppsSettings';
import { PersonenSettings } from './PersonenSettings';
import { FirmenordnerSettings } from './FirmenordnerSettings';
import { SprachmodellSettings } from './SprachmodellSettings';
import { SecuritySettings } from './SecuritySettings';
import { RemoteAccessSettings } from './RemoteAccessSettings';
import { PrivacySettings } from './PrivacySettings';
import { SystemSettings } from '../system/SystemSettings';
import { LizenzSettings } from './LizenzSettings';
import { VerbindungenSettings } from './VerbindungenSettings';

/**
 * Verwaltung-Mitte-Tab (B4, seit M5 „Verwaltung"; die persönlichen
 * Einstellungen stehen in `features/einstellungen/`). Die Sektionsauswahl lebt jetzt in der linken
 * Sidebar (SettingsPanel, wie die Flows); dieser Tab zeigt NUR noch die aktive
 * Sektion — keine zweite Spalte / kein „Tab im Tab" mehr. Die aktive Sektion
 * steht im settingsStore, den beide Seiten teilen.
 */
function Settings() {
  const [searchParams] = useSearchParams();
  const activeSection = useSettingsStore(s => s.activeSection);
  const setActiveSection = useSettingsStore(s => s.setActiveSection);
  const [isDirty, setIsDirty] = useState(false);

  // Alt-Deep-Link (/settings?tab=…) einmalig in den Store übernehmen, damit
  // Lesezeichen weiter direkt auf der richtigen Sektion landen.
  useEffect(() => {
    const param = searchParams.get('tab');
    if (param) setActiveSection(resolveTab(param));
  }, []);

  const renderContent = () => {
    switch (activeSection) {
      case 'general':
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings />
          </ComponentErrorBoundary>
        );
      case 'apps':
        return (
          <ComponentErrorBoundary componentName="Apps">
            <AppsSettings />
          </ComponentErrorBoundary>
        );
      case 'benutzer':
        return (
          <ComponentErrorBoundary componentName="Personen">
            <PersonenSettings />
          </ComponentErrorBoundary>
        );
      case 'firmenordner':
        return (
          <ComponentErrorBoundary componentName="Firmenordner">
            <FirmenordnerSettings />
          </ComponentErrorBoundary>
        );
      case 'ki':
        return (
          <ComponentErrorBoundary componentName="Sprachmodell">
            <SprachmodellSettings onDirtyChange={setIsDirty} />
          </ComponentErrorBoundary>
        );
      case 'security':
        return (
          <ComponentErrorBoundary componentName="Sicherheit">
            <SecuritySettings />
          </ComponentErrorBoundary>
        );
      case 'privacy':
        return (
          <ComponentErrorBoundary componentName="Datenschutz">
            <PrivacySettings />
          </ComponentErrorBoundary>
        );
      case 'system':
        return (
          <ComponentErrorBoundary componentName="System">
            <SystemSettings initial={resolveSystemSub(searchParams.get('tab'))} />
          </ComponentErrorBoundary>
        );
      case 'lizenz':
        return (
          <ComponentErrorBoundary componentName="Lizenz">
            <LizenzSettings />
          </ComponentErrorBoundary>
        );
      case 'verbindungen':
        return (
          <ComponentErrorBoundary componentName="Verbindungen">
            <VerbindungenSettings />
          </ComponentErrorBoundary>
        );
      case 'remote-access':
        return (
          <ComponentErrorBoundary componentName="Fernzugriff">
            <RemoteAccessSettings />
          </ComponentErrorBoundary>
        );
      default:
        return (
          <ComponentErrorBoundary componentName="Allgemein">
            <GeneralSettings />
          </ComponentErrorBoundary>
        );
    }
  };

  return (
    <div className="flex h-full flex-col animate-in fade-in">
      {/*
        Kein Kopf mit Logo und „Einstellungen" mehr (M5): oben steht gleich der
        Name des Bereichs, als einziges h1, aus dem Kopf des Bereichs. Die
        persönlichen Einstellungen stehen in `features/einstellungen/`; das
        hier ist der Übergangseintrag „Verwaltung" für alles Gerätebezogene.
      */}
      {isDirty && (
        <div className="flex shrink-0 justify-end px-6 pt-3 max-md:px-4">
          <span className="rounded-full bg-muted-foreground/15 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            Ungespeicherte Änderungen
          </span>
        </div>
      )}
      {/*
        EIN GEWOEHNLICHER ROLLBEREICH und keine `ScrollArea` mehr (Phase D4,
        Fund der D3-Abnahme am Orin).

        Bei 1440 px mit offener Notizspalte war die Einstellungsseite in der
        Mitte abgeschnitten -- die Namensspalte der Mitarbeiter-Tabelle war
        nicht zu sehen und auch nicht zu erreichen. Der Grund steckt in Radix'
        `ScrollArea`: ihr Ansichtsfenster legt um den Inhalt ein Element mit
        `display: table`, und dessen Breite richtet sich nach dem INHALT. Eine
        Tabelle, die breiter ist als die Spalte, macht damit den ganzen
        Rollbereich breiter, statt in sich zu rollen -- waagerecht rollen
        laesst er sich zwar, aber ohne sichtbaren Balken (Radix rendert je
        Richtung eine eigene Leiste, und hier stand nur die senkrechte).

        Ein `div` mit `overflow-y-auto` und `min-w-0` kann schrumpfen. Was
        darin breiter ist als die Spalte -- Tabellen, die Freigabe-Matrix, die
        Log-Ausgabe der App-Ansicht -- rollt in seinem EIGENEN `overflow-x-auto`
        und damit dort, wo es hingehoert: „die Mitte scrollt waagerecht
        innerhalb".
      */}
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="min-w-0 max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Settings;
