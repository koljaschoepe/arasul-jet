/**
 * Mitarbeiter: Liste, Startpasswort, Freigabe-Matrix (Phase D3 des Umbaus vom
 * 26.08.2026).
 *
 * Die Wege dahinter stehen seit C1 und C2. Was bis D3 fehlte, war die
 * Oberfläche: ein Administrator legte einen Mitarbeiter mit `curl` an und gab
 * ihm eine App mit einem zweiten `curl` frei. Für Standardsoftware, die in
 * einem Unternehmen steht, ist das kein Weg.
 *
 * WARUM DIE SEITE IN DEN EINSTELLUNGEN LIEGT und nicht als eigener Knopf in der
 * Aktivitätsleiste: die Leiste trägt die Ansichten, mit denen jemand ARBEITET
 * (Apps, Modelle), und darunter das Zahnrad für alles, womit er das GERÄT
 * einrichtet. Menschen anlegen und Apps freigeben gehört zum zweiten. Die
 * Sektionsliste der Einstellungen ist außerdem schon da, schon nur für
 * Administratoren (`nurFuerAdmin('settings')`, D1) und schon tief verlinkbar
 * (`/workspace/settings?tab=benutzer`) — ein eigener Eintrag in der Leiste
 * hätte eine zweite Sidebar-Ansicht gebraucht, ohne dass es dafür etwas zu
 * zeigen gäbe.
 *
 * Die Rolle blendet aus, das Backend entscheidet: jeder Weg auf dieser Seite
 * trägt `requireRole('admin')` und antwortet einem Mitarbeiter mit 403, ob die
 * Seite für ihn sichtbar ist oder nicht.
 */
import { useState } from 'react';
import { KeyRound, ShieldCheck, Trash2, UserPlus, Users, UserX } from 'lucide-react';
import { Kopf } from '@marken';
import { Button } from '@/components/ui/shadcn/button';
import { Section, SectionList } from '@/components/ui/Section';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import useConfirm from '@/hooks/useConfirm';
import { FreigabeMatrix } from './mitarbeiter/FreigabeMatrix';
import { MitarbeiterListe } from './mitarbeiter/MitarbeiterListe';
import { MitarbeiterAnlegenDialog } from './mitarbeiter/MitarbeiterAnlegenDialog';
import { PasswortSetzenDialog } from './mitarbeiter/PasswortSetzenDialog';
import {
  useAktivSetzen,
  useBenutzer,
  useBenutzerAnlegen,
  useBenutzerLoeschen,
  usePasswortSetzen,
  type Benutzer,
} from './mitarbeiter/useMitarbeiter';

export function MitarbeiterSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();

  const { data: benutzer, isLoading, isError } = useBenutzer();
  const anlegen = useBenutzerAnlegen();
  const passwortSetzen = usePasswortSetzen();
  const aktivSetzen = useAktivSetzen();
  const loeschen = useBenutzerLoeschen();

  const [anlegenOffen, setAnlegenOffen] = useState(false);
  const [passwortFuer, setPasswortFuer] = useState<Benutzer | null>(null);

  const liste = benutzer ?? [];
  // Über `String(...)`: die Kennung kommt als `int8` und damit als Zeichenkette
  // (siehe `useMitarbeiter.ts`). Genau dieser Vergleich hat im Backend zwei
  // Schutzwälle still ausgehebelt.
  const istIchSelbst = (b: Benutzer) => String(b.id) === String(user?.id ?? '');

  const handleAnlegen = (neu: Parameters<typeof anlegen.mutate>[0]) => {
    anlegen.mutate(neu, {
      onSuccess: angelegt => {
        setAnlegenOffen(false);
        toast.success(
          `${angelegt.username} angelegt. Das Startpasswort wird beim ersten Anmelden gewechselt.`
        );
      },
    });
  };

  const handlePasswort = (passwort: string) => {
    if (!passwortFuer) return;
    const name = passwortFuer.username;
    passwortSetzen.mutate(
      { id: passwortFuer.id, password: passwort },
      {
        onSuccess: () => {
          setPasswortFuer(null);
          toast.success(`Startpasswort für ${name} gesetzt. Seine Sitzungen sind beendet.`);
        },
      }
    );
  };

  const handleAktiv = async (b: Benutzer) => {
    if (b.is_active) {
      const ok = await confirm({
        title: `${b.username} stilllegen?`,
        message:
          'Er kommt danach nicht mehr herein. Seine Läufe und Protokolle bleiben stehen, ' +
          'und du kannst ihn jederzeit wieder zulassen.',
        confirmText: 'Stilllegen',
        confirmVariant: 'warning',
      });
      if (!ok) return;
    }
    aktivSetzen.mutate(
      { id: b.id, aktiv: !b.is_active },
      {
        onSuccess: () =>
          toast.success(
            b.is_active ? `${b.username} stillgelegt` : `${b.username} wieder zugelassen`
          ),
      }
    );
  };

  const handleLoeschen = async (b: Benutzer) => {
    const ok = await confirm({
      title: `${b.username} endgültig löschen?`,
      message:
        'Das Konto und die zugehörigen Daten werden gelöscht, und das ist nicht umkehrbar. ' +
        'Wer nur aussperren will, legt ihn besser still.',
      confirmText: 'Endgültig löschen',
    });
    if (!ok) return;
    loeschen.mutate(b.id, {
      onSuccess: () => toast.success(`${b.username} gelöscht`),
    });
  };

  return (
    <div className="animate-in fade-in" data-testid="mitarbeiter-seite">
      {ConfirmDialog}

      <Kopf
        titel="Mitarbeiter"
        symbol={<Users />}
        beschreibung="Wer sich am Gerät anmelden darf, und welche Apps er sieht."
        aktionen={
          <Button onClick={() => setAnlegenOffen(true)} data-testid="mitarbeiter-anlegen-oeffnen">
            <UserPlus className="size-4" aria-hidden="true" />
            Menschen anlegen
          </Button>
        }
      />

      <SectionList>
        <Section
          title="Menschen am Gerät"
          icon={<Users />}
          description="Ein vom Administrator gesetztes Passwort ist ein Startpasswort und wird beim ersten Anmelden gewechselt."
        >
          {isLoading ? (
            <SkeletonText lines={4} />
          ) : isError ? (
            <p className="text-sm text-muted-foreground" data-testid="mitarbeiter-fehler">
              Die Liste ließ sich nicht laden.
            </p>
          ) : (
            <MitarbeiterListe
              liste={liste}
              istIchSelbst={istIchSelbst}
              aktionen={b =>
                /* Für das eigene Konto steht hier nichts: alle drei Wege lehnt
                   das Backend für einen selbst ab (das eigene Passwort
                   wechselt man unter Sicherheit, gelöscht wird man über den
                   Datenschutz). Knöpfe, die sicher scheitern, sind eine
                   Sackgasse. */
                istIchSelbst(b) ? null : (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPasswortFuer(b)}
                      data-testid={`passwort-${b.username}`}
                      title="Startpasswort setzen"
                    >
                      <KeyRound className="size-4" aria-hidden="true" />
                      <span className="sr-only">Passwort setzen</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleAktiv(b)}
                      disabled={aktivSetzen.isPending}
                      data-testid={`aktiv-${b.username}`}
                      title={b.is_active ? 'Stilllegen' : 'Wieder zulassen'}
                    >
                      {b.is_active ? (
                        <UserX className="size-4" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="size-4" aria-hidden="true" />
                      )}
                      <span className="sr-only">
                        {b.is_active ? 'Stilllegen' : 'Wieder zulassen'}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleLoeschen(b)}
                      disabled={loeschen.isPending}
                      data-testid={`loeschen-${b.username}`}
                      title="Löschen"
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden="true" />
                      <span className="sr-only">Löschen</span>
                    </Button>
                  </>
                )
              }
            />
          )}
        </Section>

        <Section
          title="Freigaben"
          icon={<ShieldCheck />}
          description="Ein Häkchen heißt: dieser Mensch sieht diese App. Auch ein Administrator sieht nur, was für ihn freigegeben ist."
        >
          {isLoading ? <SkeletonText lines={3} /> : <FreigabeMatrix benutzer={liste} />}
        </Section>
      </SectionList>

      <MitarbeiterAnlegenDialog
        offen={anlegenOffen}
        laeuft={anlegen.isPending}
        onSchliessen={() => setAnlegenOffen(false)}
        onAnlegen={handleAnlegen}
      />
      <PasswortSetzenDialog
        fuer={passwortFuer}
        laeuft={passwortSetzen.isPending}
        onSchliessen={() => setPasswortFuer(null)}
        onSetzen={handlePasswort}
      />
    </div>
  );
}
