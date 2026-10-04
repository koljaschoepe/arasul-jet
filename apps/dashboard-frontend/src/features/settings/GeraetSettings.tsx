/**
 * Der Bereich Gerät der Verwaltung (M5, Auftrag verwaltung-geraet-und-system):
 * was dieses Gerät ist und trägt, an einer Stelle. Von oben nach unten
 *
 *   Unternehmen      Name und Logo als Text, das Formular erst auf „Bearbeiten"
 *   Aktualisierung   welche Fassung läuft, ein Knopf, vorher wird gesichert
 *   Lizenz           Stufe, Personen genutzt von erlaubt, gültig bis,
 *                    „Einspielen"; Fingerabdruck aufgeklappt
 *   Fernzugriff      ein Schalter mit der Adresse; Technik aufgeklappt
 *   Über Arasul      die Fußzeile
 *
 * Bis zum 04.10.2026 waren das vier Bereiche (Allgemein, Sicherheit, Lizenz,
 * Fernzugriff) und ein Unterbereich von System (Aktualisierungen); ihre
 * Adressen leiten hierher, mit dem Abschnitt (`sections.tsx`), und der
 * Abschnitt aus der Adresse rollt in Sicht.
 */
import { useEffect, useRef } from 'react';
import { HardDrive } from 'lucide-react';
import { Formularseite, Kopf } from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { Unternehmen } from './geraet/Unternehmen';
import { Aktualisierung } from './geraet/Aktualisierung';
import { Lizenz } from './geraet/Lizenz';
import { Fernzugriff } from './geraet/Fernzugriff';
import { UeberArasul } from './geraet/UeberArasul';

export function GeraetSettings({ abschnitt }: { abschnitt?: string }) {
  const seite = useRef<HTMLDivElement>(null);

  // Ein Hinweis der Startseite („Lizenz knapp", „Update bereit") oder ein
  // altes Lesezeichen nennt den Abschnitt; er rollt nach oben in Sicht.
  useEffect(() => {
    if (!abschnitt) return;
    const ziel = seite.current?.querySelector(`[data-abschnitt="${abschnitt}"]`);
    (ziel?.closest('section') ?? ziel)?.scrollIntoView?.({ block: 'start' });
  }, [abschnitt]);

  return (
    <div className="animate-in fade-in flex flex-col gap-8" data-testid="geraet-seite" ref={seite}>
      <Kopf titel="Gerät" symbol={<HardDrive />} />
      <Formularseite>
        <ComponentErrorBoundary componentName="Unternehmen">
          <Unternehmen />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary componentName="Aktualisierung">
          <Aktualisierung />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary componentName="Lizenz">
          <Lizenz />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary componentName="Fernzugriff">
          <Fernzugriff />
        </ComponentErrorBoundary>
      </Formularseite>
      <UeberArasul />
    </div>
  );
}
