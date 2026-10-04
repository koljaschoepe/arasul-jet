/**
 * Der Bereich Daten der Verwaltung (M5, Karte verwaltung-daten): was mit den
 * Daten des Geräts geschieht, an einer Stelle. Von oben nach unten die
 * Sicherung (SSD, letzte Sicherung, jetzt sichern, Stände, zurückholen), die
 * Auskunft und der Export nach DSGVO je Person, und abgesetzt darunter
 * Person löschen und Werksreset — als einzige Stelle rot, beides bestätigt
 * durch Eintippen (der Name der Person, der Gerätename).
 *
 * Sicherung (bis dahin unter System), Datenschutz und Werksreset waren drei
 * Bereiche an drei Stellen; ihre Adressen leiten hierher (`sections.tsx`).
 * Rot ist im Ruhezustand NUR der abgesetzte Teil; eine Warnung der Sicherung
 * erscheint nur, wenn etwas nicht stimmt.
 */
import { Database, RotateCcw, ShieldAlert } from 'lucide-react';
import { Feldgruppe, Formularseite, Kopf } from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Sicherung } from '../system/sicherung/Sicherung';
import { Auskunft } from './daten/Auskunft';
import { PersonLoeschen } from './daten/PersonLoeschen';
import { Werksreset } from './daten/Werksreset';

export function DatenSettings() {
  return (
    <div className="animate-in fade-in flex flex-col gap-8" data-testid="daten-seite">
      <Kopf
        titel="Daten"
        symbol={<Database />}
        beschreibung="Sicherung, Auskunft und Export, Löschen und Zurücksetzen."
      />

      <ComponentErrorBoundary componentName="Sicherung">
        <Sicherung />
      </ComponentErrorBoundary>

      <div className="border-t border-border pt-8">
        <ComponentErrorBoundary componentName="Auskunft">
          <Auskunft />
        </ComponentErrorBoundary>
      </div>

      <section
        className="flex flex-col gap-8 rounded-md border border-destructive/40 p-4"
        aria-labelledby="daten-gefahr-titel"
        data-testid="daten-gefahr"
      >
        <header className="flex flex-col gap-1">
          <h2
            id="daten-gefahr-titel"
            className="flex items-center gap-2 text-sm font-medium text-destructive"
          >
            <ShieldAlert className="size-4" aria-hidden="true" />
            Löschen und Zurücksetzen
          </h2>
          <p className="text-sm text-muted-foreground">
            Das lässt sich nicht rückgängig machen. Was hier verschwindet, ist nur noch in einer
            Sicherung vorhanden.
          </p>
        </header>
        <Formularseite>
          <ComponentErrorBoundary componentName="Person löschen">
            <PersonLoeschen />
          </ComponentErrorBoundary>
          <Feldgruppe
            titel="Werksreset"
            symbol={<RotateCcw className="text-destructive" />}
            beschreibung="Setzt das Gerät zurück, entweder nur die Inhalte oder bis zum Auslieferungszustand. Es gibt kein Rückgängig."
          >
            <ComponentErrorBoundary componentName="Werksreset">
              <Werksreset />
            </ComponentErrorBoundary>
          </Feldgruppe>
        </Formularseite>
      </section>
    </div>
  );
}
