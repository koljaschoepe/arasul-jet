import { useEffect, useState, type ReactNode } from 'react';
import {
  Liste,
  ListenEintrag,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useSchmalesFenster,
} from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  SETTINGS_SECTIONS,
  resolveTab,
  resolveSystemSub,
  type SettingsSectionId,
} from './sections';
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

interface VerwaltungProps {
  /**
   * Der Bereich „Modelle" als Slot: er steht in `features/modelle/`, und
   * zusammengesetzt wird quer nur in der Shell (Regel des Ordners).
   */
  modelle: ReactNode;
}

/**
 * Die Verwaltung (M5): gebaut wie eine App, mit einer eigenen schmalen Leiste
 * der Bereiche links und dem gewählten Bereich daneben — ohne zweite
 * Reiterstufe und ohne zweite Seitenleiste der Shell. Bis zur Karte
 * rahmen-aktivitaetsleiste standen die Bereiche in der Sidebar der Shell
 * (`SettingsPanel`) und der gewählte in einem eigenen Store; jetzt gehört der
 * Bereich zur Ansicht und damit zur Adresse
 * (`/workspace/verwaltung/<bereich>`), und jeder ist verlinkbar.
 *
 * Unter 900 px wird die Leiste zu einer Auswahl über dem Bereich: 48 px
 * Aktivitätsleiste und eine Spalte Bereiche ließen einer Tabelle sonst nichts.
 */
function Settings({ modelle }: VerwaltungProps) {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const schmal = useSchmalesFenster();
  const [isDirty, setIsDirty] = useState(false);
  const bereich = resolveTab(ansicht.bereich ?? null);
  const waehle = (id: SettingsSectionId) => oeffne({ type: 'verwaltung', bereich: id });
  // „Ungespeicherte Änderungen" gehört zu dem Bereich, der sie hat.
  useEffect(() => setIsDirty(false), [bereich]);

  const renderContent = () => {
    switch (bereich) {
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
      case 'modelle':
        return <ComponentErrorBoundary componentName="Modelle">{modelle}</ComponentErrorBoundary>;
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
            {/* Der Schlüssel klappt neu auf, wenn der Abschnitt in der Adresse
                wechselt (Zurück zwischen zwei Abschnitten). */}
            <SystemSettings
              key={ansicht.abschnitt ?? ''}
              initial={resolveSystemSub(ansicht.abschnitt ?? null)}
            />
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
    <div className="flex h-full min-h-0" data-testid="verwaltung">
      {!schmal && (
        <nav
          aria-label="Bereiche der Verwaltung"
          className="w-44 shrink-0 overflow-y-auto border-r border-border p-1"
          data-testid="verwaltung-bereiche"
        >
          <Liste dicht>
            {SETTINGS_SECTIONS.map(section => (
              <ListenEintrag
                key={section.id}
                titel={section.label}
                symbol={section.icon}
                aktiv={bereich === section.id}
                kennzeichen={`verwaltung-${section.id}`}
                onKlick={() => waehle(section.id)}
              />
            ))}
          </Liste>
        </nav>
      )}
      {/*
        EIN GEWOEHNLICHER ROLLBEREICH und keine `ScrollArea` (Phase D4, Fund
        der D3-Abnahme am Orin): Radix' Ansichtsfenster legt um den Inhalt ein
        Element mit `display: table`, und eine Tabelle, die breiter ist als die
        Spalte, macht damit den ganzen Rollbereich breiter, statt in sich zu
        rollen. Ein `div` mit `overflow-y-auto` und `min-w-0` kann schrumpfen;
        was darin breiter ist, rollt in seinem EIGENEN `overflow-x-auto`.
      */}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto animate-in fade-in">
        {schmal && (
          <div className="px-4 pt-4">
            <Select value={bereich} onValueChange={wert => waehle(wert as SettingsSectionId)}>
              <SelectTrigger aria-label="Bereich" data-testid="verwaltung-bereich-wahl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SETTINGS_SECTIONS.map(section => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {isDirty && (
          <div className="flex justify-end px-6 pt-3 max-md:px-4">
            <span className="rounded-full bg-muted-foreground/15 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Ungespeicherte Änderungen
            </span>
          </div>
        )}
        <div className="min-w-0 max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Settings;
