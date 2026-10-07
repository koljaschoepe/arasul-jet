import type { ReactNode } from 'react';
import type { SeitenleistenGruppe } from '@marken';
import { Bereichsrahmen } from '@/components/Bereichsrahmen';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  SETTINGS_SECTIONS,
  bereichAusAdresse,
  resolveSystemSub,
  type SettingsSectionId,
} from './sections';
import { AppsSettings } from './AppsSettings';
import { PersonenSettings } from './PersonenSettings';
import { LaeufeSettings } from './LaeufeSettings';
import { FirmenordnerSettings } from './FirmenordnerSettings';
import { DatenSettings } from './DatenSettings';
import { GeraetSettings } from './GeraetSettings';
import { SystemSettings } from '../system/SystemSettings';

interface VerwaltungProps {
  /**
   * Der Bereich „Modelle" als Slot: er steht in `features/modelle/`, und
   * zusammengesetzt wird quer nur in der Shell (Regel des Ordners).
   */
  modelle: ReactNode;
}

/**
 * Die Verwaltung (M5): gebaut wie eine App, mit der Seitenleiste aus
 * `@marken` links (Titel „Verwaltung", zwei Gruppen, `Bereichsrahmen`) und dem
 * gewählten Bereich daneben — ohne zweite Reiterstufe und ohne zweite
 * Seitenleiste der Shell. Dieselbe Leiste tragen die Einstellungen und jede App
 * (Karte jet-rahmen-einheitlich, 07.10.2026); bis dahin stand hier eine
 * `Liste dicht` von 176 px, die neben den Apps gequetscht aussah. Bis zur Karte
 * rahmen-aktivitaetsleiste standen die Bereiche in der Sidebar der Shell
 * (`SettingsPanel`) und der gewählte in einem eigenen Store; jetzt gehört der
 * Bereich zur Ansicht und damit zur Adresse
 * (`/workspace/verwaltung/<bereich>`), und jeder ist verlinkbar.
 *
 * Unter 900 px wird die Leiste zu einem Blatt, das ein Knopf über dem Bereich
 * öffnet: eine Spalte Bereiche ließe einer Tabelle sonst nichts.
 */
function Settings({ modelle }: VerwaltungProps) {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  // Alte Adressen (Datenschutz, System → Sicherung) landen im Bereich Daten.
  const { bereich, abschnitt } = bereichAusAdresse(ansicht.bereich, ansicht.abschnitt);
  const waehle = (id: SettingsSectionId) => oeffne({ type: 'verwaltung', bereich: id });

  const renderContent = () => {
    switch (bereich) {
      case 'apps':
        return (
          <ComponentErrorBoundary componentName="Apps">
            <AppsSettings
              appId={ansicht.abschnitt ?? null}
              onOeffnen={id =>
                oeffne({ type: 'verwaltung', bereich: 'apps', ...(id ? { abschnitt: id } : {}) })
              }
            />
          </ComponentErrorBoundary>
        );
      case 'laeufe':
        return (
          <ComponentErrorBoundary componentName="Läufe">
            <LaeufeSettings
              abschnitt={ansicht.abschnitt}
              filter={ansicht.filter}
              onOeffnen={ziel =>
                oeffne({
                  type: 'verwaltung',
                  bereich: 'laeufe',
                  ...(ziel.abschnitt ? { abschnitt: ziel.abschnitt } : {}),
                  ...(ziel.filter ? { filter: ziel.filter } : {}),
                })
              }
            />
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
      case 'daten':
        return (
          <ComponentErrorBoundary componentName="Daten">
            <DatenSettings />
          </ComponentErrorBoundary>
        );
      case 'system':
        return (
          <ComponentErrorBoundary componentName="System">
            {/* Der Schlüssel klappt neu auf, wenn der Abschnitt in der Adresse
                wechselt (Zurück zwischen zwei Abschnitten). */}
            <SystemSettings key={abschnitt ?? ''} initial={resolveSystemSub(abschnitt ?? null)} />
          </ComponentErrorBoundary>
        );
      case 'geraet':
        return (
          <ComponentErrorBoundary componentName="Gerät">
            <GeraetSettings abschnitt={abschnitt} />
          </ComponentErrorBoundary>
        );
      default:
        return (
          <ComponentErrorBoundary componentName="Personen">
            <PersonenSettings />
          </ComponentErrorBoundary>
        );
    }
  };

  const gruppen: SeitenleistenGruppe[] = (['Arbeit', 'Betrieb'] as const).map(titel => ({
    titel,
    eintraege: SETTINGS_SECTIONS.filter(s => s.gruppe === titel).map(section => ({
      kennung: section.id,
      name: section.label,
      symbol: section.icon,
      aktiv: bereich === section.id,
      kennzeichen: `verwaltung-${section.id}`,
      aufKlick: () => waehle(section.id),
    })),
  }));

  return (
    <div className="h-full min-h-0" data-testid="verwaltung">
      <Bereichsrahmen titel="Verwaltung" gruppen={gruppen} kennzeichen="verwaltung-bereiche">
        {renderContent()}
      </Bereichsrahmen>
    </div>
  );
}

export default Settings;
