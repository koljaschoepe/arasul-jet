/**
 * Was der Administrator mit einem Lauf tun kann: abbrechen, solange er läuft
 * oder wartet (auch einen aus Zeitplan oder Ereignis, M5), und die Übergabe
 * wiederholen, wenn die App den Empfang nicht bestätigt hat.
 */
import { useState } from 'react';
import { Bestaetigung, Button } from '@marken';
import { useToast } from '@/contexts/ToastContext';
import { fehlertext } from '@/utils/fehlertext';
import { ErneutKnopf } from '../apps/LaufAnsicht';
import type { AppLauf } from '../apps/useAppVerwaltung';
import { useLaufAbbrechen } from './useLaeufe';

export function LaufAktionen({ lauf }: { lauf: AppLauf }) {
  const toast = useToast();
  const abbrechen = useLaufAbbrechen();
  const [frage, setFrage] = useState(false);
  const abbrechbar = lauf.status === 'laeuft' || lauf.status === 'wartend';

  return (
    <>
      {abbrechbar && (
        <Button
          variant="outline"
          size="sm"
          data-testid={`lauf-abbrechen-${lauf.id}`}
          onClick={() => setFrage(true)}
        >
          Abbrechen
        </Button>
      )}
      {lauf.status === 'nicht_uebergeben' && lauf.app_id && (
        <ErneutKnopf appId={lauf.app_id} runId={lauf.id} />
      )}
      <Bestaetigung
        offen={frage}
        beiSchliessen={() => setFrage(false)}
        titel={`Lauf ${lauf.id} abbrechen?`}
        frage="Der Lauf hört vor seinem nächsten Schritt auf. Was er schon getan hat, bleibt stehen."
        jaText="Lauf abbrechen"
        neinText="Weiterlaufen lassen"
        laeuft={abbrechen.isPending}
        beiBestaetigen={() =>
          abbrechen.mutate(lauf.id, {
            onSuccess: () => {
              setFrage(false);
              toast.success(`Lauf ${lauf.id} ist abgebrochen.`);
            },
            onError: fehler => {
              setFrage(false);
              toast.error(fehlertext(fehler));
            },
          })
        }
      />
    </>
  );
}
