/**
 * Mein Profil, im Kontomenü der Kopfleiste (M5).
 *
 * Aus demselben Grund wie die Ausweise (`AusweiseDialog`): die Einstellungen
 * sind eine Admin-Seite, das Profil gehört jedem. Bis der neue Rahmen die
 * Einstellungen für alle öffnet, ist das Kontomenü der eine Ort dafür.
 */
import { Dialogform } from '@marken';
import { ProfilFormular } from './ProfilFormular';

export function ProfilDialog({
  offen,
  beiSchliessen,
}: {
  offen: boolean;
  beiSchliessen: () => void;
}) {
  return (
    <Dialogform offen={offen} beiSchliessen={beiSchliessen} titel="Mein Profil" groesse="mittel">
      <ProfilFormular onGespeichert={beiSchliessen} />
    </Dialogform>
  );
}
