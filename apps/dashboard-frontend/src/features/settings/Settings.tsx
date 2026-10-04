import type { ReactNode } from 'react';
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
  bereichAusAdresse,
  resolveSystemSub,
  type SettingsSectionId,
} from './sections';
import { AppsSettings } from './AppsSettings';
import { PersonenSettings } from './PersonenSettings';
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
        <div className="min-w-0 max-w-225 p-6 max-md:p-4">{renderContent()}</div>
      </div>
    </div>
  );
}

export default Settings;
