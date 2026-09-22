/**
 * Firmenordner: Ordnerbaum, Rechte je Person, letzte Änderungen (Auftrag
 * firmenordner-rechte-im-frontend, 22.09.2026, J33).
 *
 * Die Wege stehen seit PR 765 (Ordner auf zwei Ebenen, Rechte lesen und
 * schreiben, nur vergeben, 409 mit Ausweg) und seit diesem Auftrag die Wurzel
 * (Ebene 0, genau eine, alle lesen, Administratoren schreiben) und das
 * Protokoll je Ordner. Was bis dahin fehlte, war die Oberfläche: ein
 * Administrator legte einen Ordner mit `curl` an und gab ein Recht mit einem
 * zweiten. Für Standardsoftware in einem Unternehmen ist das kein Weg.
 *
 * WARUM IN DEN EINSTELLUNGEN, neben Mitarbeitern und Apps: dieselbe
 * Begründung wie in D3 und D4. Die Aktivitätsleiste trägt die Arbeit, das
 * Zahnrad darunter das Einrichten des Geräts — und wer welchen Ordner sieht,
 * ist Einrichten. Der Mitarbeiter sieht SEINE Ordner im Benutzermenü der
 * Kopfleiste (`features/firmenordner/`), an derselben Stelle wie seine
 * Ausweise.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg dieser Seite
 * trägt `requireRole('admin')`.
 */
import { useState } from 'react';
import { FolderPlus, FolderTree, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Feldgruppe,
  Formularseite,
  Kopf,
  Leerzustand,
} from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import type { ApiError } from '@/hooks/useApi';
import { useApi } from '@/hooks/useApi';
import { useQueryClient } from '@tanstack/react-query';
import { useBenutzer } from './mitarbeiter/useMitarbeiter';
import { AenderungenDialog } from './firmenordner/AenderungenDialog';
import { OrdnerAnlegenDialog } from './firmenordner/OrdnerAnlegenDialog';
import { OrdnerBaum } from './firmenordner/OrdnerBaum';
import { OrdnerEntfernenDialog } from './firmenordner/OrdnerEntfernenDialog';
import { RechteMatrix } from './firmenordner/RechteMatrix';
import {
  ORDNER_KEY,
  RECHTE_KEY,
  useOrdner,
  useOrdnerAnlegen,
  useOrdnerLoeschen,
  type Ordner,
} from './firmenordner/useFirmenordner';

export function FirmenordnerSettings() {
  const toast = useToast();
  const api = useApi();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useOrdner();
  const { data: benutzer, isLoading: benutzerLaden } = useBenutzer();
  const anlegen = useOrdnerAnlegen();
  const loeschen = useOrdnerLoeschen();

  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [wegwerfen, setWegwerfen] = useState<Ordner | null>(null);
  const [wegwerfenFehler, setWegwerfenFehler] = useState<string | null>(null);
  const [aenderungen, setAenderungen] = useState<Ordner | null>(null);
  const [abgleichLaeuft, setAbgleichLaeuft] = useState(false);

  const ordner = data?.ordner ?? [];
  const zustand = data?.zustand ?? null;
  const wurzel = ordner.find(o => o.art === 'wurzel') ?? null;
  const bereiche = ordner.filter(o => o.ebene === 1 && o.art === 'geteilt');

  const handleAnlegen = (neu: Parameters<typeof anlegen.mutate>[0]) => {
    anlegen.mutate(neu, {
      onSuccess: o => {
        setAnlegenOffen(false);
        toast.success(
          o.raum_id
            ? `„${o.kennung}“ angelegt.`
            : `„${o.kennung}“ angelegt. Der Dateidienst kennt ihn noch nicht; der Abgleich holt das nach.`
        );
      },
    });
  };

  const handleWurzel = () => {
    anlegen.mutate(
      { kennung: 'firma', name: 'Firma', ebene: 0, art: 'wurzel' },
      {
        onSuccess: () =>
          toast.success('Die Wurzel „firma“ steht. Jeder liest sie, Administratoren schreiben.'),
      }
    );
  };

  const handleWegwerfen = (o: Ordner) => {
    setWegwerfenFehler(null);
    loeschen.mutate(
      { id: o.id, kennung: o.kennung },
      {
        onSuccess: () => {
          setWegwerfen(null);
          toast.success(`„${o.kennung}“ ist weg.`);
        },
        onError: err => setWegwerfenFehler((err as ApiError).message),
      }
    );
  };

  const handleAbgleich = async () => {
    setAbgleichLaeuft(true);
    try {
      const res = await api.post<{
        data: { an: boolean; nutzer: number; raeume: number; rechte: number; offen: string[] };
      }>('/firmenordner/abgleich');
      const b = res.data;
      toast.success(
        `Abgleich: ${b.nutzer} Menschen, ${b.raeume} Räume, ${b.rechte} Rechte nachgetragen` +
          (b.offen.length ? `, ${b.offen.length} offen.` : '.')
      );
    } finally {
      setAbgleichLaeuft(false);
      void qc.invalidateQueries({ queryKey: ORDNER_KEY });
      void qc.invalidateQueries({ queryKey: RECHTE_KEY });
    }
  };

  const an = zustand?.an ?? true;

  return (
    <div className="animate-in fade-in" data-testid="firmenordner-seite">
      <Kopf
        titel="Firmenordner"
        symbol={<FolderTree />}
        beschreibung="Die Ordner der Firma auf dem Gerät, und wer darin liest oder schreibt."
        aktionen={
          an && !isError ? (
            <>
              <Button
                variant="outline"
                onClick={() => void handleAbgleich()}
                disabled={abgleichLaeuft}
                data-testid="firmenordner-abgleich"
                title="Nachholen, was der Dateidienst noch nicht weiß"
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Abgleich
              </Button>
              <Button onClick={() => setAnlegenOffen(true)} data-testid="ordner-anlegen-oeffnen">
                <FolderPlus className="size-4" aria-hidden="true" />
                Ordner anlegen
              </Button>
            </>
          ) : null
        }
      />

      {isLoading || benutzerLaden ? (
        <SkeletonText lines={5} />
      ) : isError ? (
        <p className="text-sm text-muted-foreground" data-testid="firmenordner-fehler">
          Die Ordner ließen sich nicht laden.
        </p>
      ) : !an ? (
        <Leerzustand
          symbol={<FolderTree />}
          titel="Auf diesem Gerät läuft kein Firmenordner"
          beschreibung="Er wird mit COMPOSE_PROFILES=firmenordner in der .env eingeschaltet; danach docker compose up -d firmenordner dashboard-backend. Siehe docs/features/FIRMENORDNER.md."
        />
      ) : (
        <Formularseite>
          {zustand && !zustand.erreichbar && (
            <Alert variant="destructive" data-testid="firmenordner-nicht-erreichbar">
              <AlertTitle>Der Dateidienst antwortet nicht</AlertTitle>
              <AlertDescription>
                {zustand.grund ?? 'Er läuft, aber Arasul erreicht ihn gerade nicht.'} Ordner und
                Rechte lassen sich trotzdem anlegen; der Abgleich holt nach, was fehlt.
              </AlertDescription>
            </Alert>
          )}

          {!wurzel && (
            <Alert data-testid="firmenordner-ohne-wurzel">
              <AlertTitle>Noch keine Wurzel</AlertTitle>
              <AlertDescription>
                <span>
                  Die Wurzel ist der eine Ordner über allem: die Regeln, Skills und Agents der
                  Firma. Jeder aktive Mensch liest sie, Administratoren schreiben. Ohne sie legt das
                  CLI der Wurzel nichts oben in den Baum.
                </span>
                <span className="mt-2 block">
                  <Button
                    size="sm"
                    onClick={handleWurzel}
                    disabled={anlegen.isPending}
                    data-testid="wurzel-anlegen"
                  >
                    Wurzel „firma“ anlegen
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          )}

          <Feldgruppe
            titel="Ordner"
            symbol={<FolderTree />}
            beschreibung={
              zustand?.adresse
                ? `Der Dateidienst liegt unter ${zustand.adresse}. Ebene 1 ist ein Bereich, Ebene 2 ein Projekt darin; ein Ordner „am Gerät“ wird nie abgeglichen.`
                : 'Ebene 1 ist ein Bereich, Ebene 2 ein Projekt darin; ein Ordner „am Gerät“ wird nie abgeglichen.'
            }
          >
            {ordner.length === 0 ? (
              <Leerzustand
                symbol={<FolderTree />}
                titel="Noch kein Ordner"
                beschreibung="Legen Sie einen Bereich an. Rechte darauf gelten für alles darunter; wer nur ein Projekt sehen soll, bekommt es einzeln."
              />
            ) : (
              <OrdnerBaum
                ordner={ordner}
                onAenderungen={setAenderungen}
                onWegwerfen={setWegwerfen}
              />
            )}
          </Feldgruppe>

          <Feldgruppe
            titel="Rechte"
            symbol={<ShieldCheck />}
            beschreibung={
              'Je Mensch und Ordner eine Stufe: keine, lesen, schreiben. Ein Recht auf einem Bereich gilt für jedes Projekt darin und wird dort nie weniger. ' +
              (wurzel
                ? `Die Wurzel „${wurzel.kennung}“ liest jeder aktive Mensch, Administratoren schreiben. `
                : '') +
              'Ein Ordner am Gerät hat keine Spalte: ihn liest niemand außer Flows und Apps.'
            }
          >
            <RechteMatrix benutzer={benutzer ?? []} ordner={ordner} />
          </Feldgruppe>
        </Formularseite>
      )}

      <OrdnerAnlegenDialog
        offen={anlegenOffen}
        laeuft={anlegen.isPending}
        bereiche={bereiche}
        onSchliessen={() => setAnlegenOffen(false)}
        onAnlegen={handleAnlegen}
      />
      <OrdnerEntfernenDialog
        fuer={wegwerfen}
        laeuft={loeschen.isPending}
        fehler={wegwerfenFehler}
        onSchliessen={() => {
          setWegwerfen(null);
          setWegwerfenFehler(null);
        }}
        onWegwerfen={handleWegwerfen}
      />
      <AenderungenDialog fuer={aenderungen} onSchliessen={() => setAenderungen(null)} />
    </div>
  );
}
