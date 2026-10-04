/**
 * Der Papierkorb eines Hauptordners oder Bereichs (Auftrag
 * papierkorb-und-adresse-des-firmenordners, 27.09.2026, J34).
 *
 * WAS EINMAL VERSEHENTLICH IN EINEN ORDNER GING, NIMMT DER ADMINISTRATOR
 * SELBST WIEDER HERAUS. Im Firmenordner ist er nur Bearbeiter und darf den
 * Papierkorb nicht leeren; am 27.09.2026 lagen dort Kopien von Schlüsseln aus
 * einer Probe, und nur das Konto des Geräts kam an sie heran. Jetzt tut es
 * das Gerät für ihn (`/api/firmenordner/ordner/:id/papierkorb`), und jeder
 * Handgriff steht im Protokoll.
 *
 * Drei Handgriffe: zurückholen (an die alte Stelle, ohne etwas zu
 * überschreiben), einen Eintrag endgültig entfernen, den ganzen Papierkorb
 * leeren. Die beiden endgültigen fragen vorher nach (`Bestaetigung`), denn
 * danach bringt ihn nur noch die Sicherung zurück.
 */
import { useState } from 'react';
import { FileText, Folder, RotateCcw, Trash2 } from 'lucide-react';
import { Alert, AlertDescription, Bestaetigung, Button, Dialogform, Leerzustand } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { formatBytes, formatDate, formatZahl } from '@/utils/formatting';
import {
  usePapierkorb,
  usePapierkorbHandgriff,
  type Ordner,
  type PapierkorbEintrag,
} from './useFirmenordner';
import { ordnerWeg } from './ordnerWeg';
import { fehlertext } from '@/utils/fehlertext';

interface Props {
  fuer: Ordner | null;
  onSchliessen: () => void;
}

/** „1 Eintrag" oder „12 Einträge". */
function eintraegeWort(n: number): string {
  return n === 1 ? '1 Eintrag' : `${formatZahl(n)} Einträge`;
}

export function PapierkorbDialog({ fuer, onSchliessen }: Props) {
  const toast = useToast();
  const { data, isLoading, isError } = usePapierkorb(fuer ? fuer.id : null);
  const handgriff = usePapierkorbHandgriff();
  const [fehler, setFehler] = useState<string | null>(null);
  const [leerenFragen, setLeerenFragen] = useState(false);
  const [entfernenFragen, setEntfernenFragen] = useState<PapierkorbEintrag | null>(null);
  const liste = data ?? [];

  const schliessen = () => {
    setFehler(null);
    setLeerenFragen(false);
    setEntfernenFragen(null);
    onSchliessen();
  };

  const tu = (
    was: 'leeren' | 'entfernen' | 'wiederherstellen',
    eintrag: PapierkorbEintrag | null,
    erfolg: string
  ) => {
    if (!fuer) return;
    setFehler(null);
    handgriff.mutate(
      { ordnerId: fuer.id, was, eintrag: eintrag?.id },
      {
        onSuccess: () => {
          setLeerenFragen(false);
          setEntfernenFragen(null);
          toast.success(erfolg);
        },
        onError: err => {
          setLeerenFragen(false);
          setEntfernenFragen(null);
          setFehler(fehlertext(err));
        },
      }
    );
  };

  const weg = fuer ? ordnerWeg(fuer) : '';

  return (
    <>
      <Dialogform
        offen={fuer !== null}
        beiSchliessen={schliessen}
        titel={fuer ? `Papierkorb von „${fuer.name}“` : 'Papierkorb'}
        groesse="mittel"
        fuss={
          <div className="flex w-full flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={schliessen}>
              Schließen
            </Button>
            <Button
              variant="destructive"
              onClick={() => setLeerenFragen(true)}
              disabled={liste.length === 0 || handgriff.isPending}
              data-testid="papierkorb-leeren"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Papierkorb leeren
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4" data-testid="papierkorb">
          <p className="text-sm text-muted-foreground">
            Was Mitarbeiter in diesem Ordner gelöscht haben. Zurückholen legt einen Eintrag an seine
            alte Stelle; endgültig entfernen nimmt ihn vom Gerät.
          </p>
          {fehler && (
            <Alert variant="destructive" data-testid="papierkorb-fehler">
              <AlertDescription>{fehler}</AlertDescription>
            </Alert>
          )}
          {isLoading ? (
            <SkeletonText lines={4} />
          ) : isError ? (
            <p className="text-sm text-muted-foreground" data-testid="papierkorb-lesefehler">
              Der Papierkorb ließ sich gerade nicht lesen. Versuchen Sie es in einer Minute noch
              einmal.
            </p>
          ) : liste.length === 0 ? (
            <Leerzustand
              symbol={<Trash2 />}
              titel="Der Papierkorb ist leer"
              beschreibung="Was ein Mitarbeiter hier löscht, liegt danach in dieser Liste, bis Sie es entfernen."
            />
          ) : (
            <>
              <p className="text-sm text-foreground" data-testid="papierkorb-anzahl">
                {eintraegeWort(liste.length)} im Papierkorb.
              </p>
              <ul className="rounded-md border border-border">
                {liste.map(e => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                    data-testid="papierkorb-eintrag"
                  >
                    {e.ordner ? (
                      <Folder
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    ) : (
                      <FileText
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex min-w-0 flex-1 basis-48 flex-col">
                      <span className="truncate text-sm font-medium text-foreground" title={e.ort}>
                        {e.name}
                        {e.ordner && <span className="sr-only"> (Ordner)</span>}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {e.ort.includes('/')
                          ? `lag in ${e.ort.slice(0, e.ort.lastIndexOf('/'))} · `
                          : ''}
                        gelöscht {formatDate(e.geloescht_am)}
                        {e.groesse !== null ? ` · ${formatBytes(e.groesse)}` : ''}
                      </span>
                    </span>
                    <span className="ml-auto inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={handgriff.isPending}
                        onClick={() =>
                          tu('wiederherstellen', e, `„${e.name}“ liegt wieder an seiner Stelle.`)
                        }
                        data-testid={`papierkorb-zurueck-${e.id}`}
                        title="An die alte Stelle zurückholen"
                      >
                        <RotateCcw className="size-4" aria-hidden="true" />
                        <span className="sr-only">Zurückholen</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={handgriff.isPending}
                        onClick={() => setEntfernenFragen(e)}
                        data-testid={`papierkorb-entfernen-${e.id}`}
                        title="Endgültig entfernen"
                      >
                        <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                        <span className="sr-only">Endgültig entfernen</span>
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Dialogform>

      <Bestaetigung
        offen={leerenFragen}
        beiSchliessen={() => setLeerenFragen(false)}
        beiBestaetigen={() =>
          tu('leeren', null, `Der Papierkorb von „${fuer?.name ?? weg}“ ist leer.`)
        }
        titel="Papierkorb leeren?"
        frage={`${eintraegeWort(liste.length)} verschwinden endgültig vom Gerät. Zurück kommen sie nur aus einer Sicherung, die älter ist als jetzt.`}
        jaText="Endgültig leeren"
        art="gefahr"
        laeuft={handgriff.isPending}
      />
      <Bestaetigung
        offen={entfernenFragen !== null}
        beiSchliessen={() => setEntfernenFragen(null)}
        beiBestaetigen={() => {
          if (entfernenFragen) {
            tu('entfernen', entfernenFragen, `„${entfernenFragen.name}“ ist endgültig entfernt.`);
          }
        }}
        titel="Endgültig entfernen?"
        frage={
          entfernenFragen
            ? `„${entfernenFragen.name}“ verschwindet endgültig vom Gerät. Zurück kommt es nur aus einer Sicherung.`
            : undefined
        }
        jaText="Endgültig entfernen"
        art="gefahr"
        laeuft={handgriff.isPending}
      />
    </>
  );
}
