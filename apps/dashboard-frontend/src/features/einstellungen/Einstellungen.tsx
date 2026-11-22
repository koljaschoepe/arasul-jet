/**
 * Die Einstellungen: für alle gleich und nur persönlich (M5).
 *
 * Gebaut wie die Verwaltung (Karte jet-rahmen-einheitlich, 07.10.2026): links
 * die Seitenleiste mit dem Titel „Einstellungen", je Bereich eine Seite —
 * Profil, Passwort, Angemeldete Rechner, Erscheinungsbild. Bis dahin standen
 * die vier untereinander, und das Erscheinungsbild ganz unten fand niemand.
 * Alles Gerätebezogene steht in der Verwaltung (`features/settings/`), und
 * keine Funktion steht an beiden Orten.
 *
 * „Abmelden" steht nicht hier, sondern im Konto unten in der Leiste, am Handy
 * unter „Mehr" (Karte glas-rahmen-und-leiste): eine Stelle je Funktion.
 */
import { Layers, LogOut, Monitor, Moon, Palette, Sun } from '@marken/symbole';
import { useState } from 'react';
import {
  Button,
  Feldgruppe,
  Kopf,
  Label,
  Leerzustand,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Werkzeug,
  type SeitenleistenGruppe,
} from '@marken';
import { Bereichsrahmen } from '@/components/Bereichsrahmen';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/hooks/useApi';
import useConfirm from '@/hooks/useConfirm';
import { useTheme, type ThemeWahl } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatting';
import PasswordManagement from './PasswordManagement';
import { ProfilFormular } from './ProfilFormular';
import { RechnerVerbinden } from './RechnerVerbinden';
import { useAusweise, useAusweisWiderrufen } from './useAusweise';
import { BEREICHE, type BereichId } from './bereiche';

const THEME_WAHLEN: ReadonlyArray<{
  wert: ThemeWahl;
  label: string;
  satz: string;
  icon: typeof Sun;
}> = [
  { wert: 'system', label: 'System', satz: 'Folgt Ihrem Rechner', icon: Monitor },
  { wert: 'light', label: 'Hell', satz: 'Helle Flächen, dunkle Schrift', icon: Sun },
  { wert: 'dark', label: 'Dunkel', satz: 'Dunkle Flächen, ruhig am Abend', icon: Moon },
];

/**
 * Erscheinungsbild (J51, Rest der dritten Karte: die Seite wirkte karg). Zwei
 * Gruppen wie in der Verwaltung: das Farbschema als drei Karten zum Antippen,
 * darunter das Glas mit einem Satz, was der Schalter tut.
 */
function Erscheinungsbild() {
  const { wahl, setTheme, transparenzReduziert, setTransparenzReduziert } = useTheme();
  return (
    <>
      <Kopf
        titel="Erscheinungsbild"
        beschreibung="Hell oder dunkel, und wie viel Glas Sie sehen. Gilt für Sie auf jedem Rechner."
      />
      <div className="flex flex-col gap-6">
        <Feldgruppe
          titel="Farbschema"
          symbol={<Palette />}
          beschreibung="Die Apps im Rahmen folgen Ihrer Wahl."
        >
          <RadioGroup
            value={wahl}
            onValueChange={wert => {
              // `setTheme` meldet einen Fehler über `useApi` selbst.
              void setTheme(wert as ThemeWahl).catch(() => {});
            }}
            aria-label="Farbschema"
            className="grid grid-cols-1 gap-2 sm:max-w-[600px] sm:grid-cols-3"
            data-testid="erscheinungsbild"
          >
            {THEME_WAHLEN.map(({ wert, label, satz, icon: Icon }) => (
              <Label
                key={wert}
                htmlFor={`theme-${wert}`}
                data-gewaehlt={wahl === wert}
                className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-border bg-card p-3 transition-colors duration-120 ease-out hover:bg-accent data-[gewaehlt=true]:border-primary data-[gewaehlt=true]:bg-primary/14 motion-reduce:transition-none dark:data-[gewaehlt=true]:bg-primary/28"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/14 text-primary dark:bg-primary/28 dark:text-foreground">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">{label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{satz}</span>
                </span>
                <RadioGroupItem value={wert} id={`theme-${wert}`} className="mt-0.5" />
              </Label>
            ))}
          </RadioGroup>
        </Feldgruppe>
        {/* Glas auf Menüs und Meldungen wird deckend. Was das System wünscht
            (weniger Transparenz, mehr Kontrast), gilt ohnehin. */}
        <Feldgruppe
          titel="Glas"
          symbol={<Layers />}
          beschreibung="Leiste, Menüs und Meldungen sind leicht durchscheinend. Reduziert werden sie deckend und ruhiger."
          className="border-b-0"
        >
          <div className="flex items-center gap-3">
            <Switch
              id="transparenz-reduzieren"
              checked={transparenzReduziert}
              onCheckedChange={wert => {
                void setTransparenzReduziert(wert === true).catch(() => {});
              }}
              data-testid="transparenz-reduzieren"
            />
            <Label
              htmlFor="transparenz-reduzieren"
              className="cursor-pointer text-sm font-medium text-foreground"
            >
              Transparenz reduzieren
            </Label>
          </div>
        </Feldgruppe>
      </div>
    </>
  );
}

/**
 * Die Rechner, an denen ein Ausweis dieser Person liegt. „Abmelden" widerruft
 * ihn. Erzeugt wird hier nichts: der Ausweis für das CLI entsteht nie im
 * Browser.
 */
function AngemeldeteRechner() {
  const api = useApi();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const { data, isLoading, isError } = useAusweise();
  const widerrufen = useAusweisWiderrufen();
  const [ueberall, setUeberall] = useState(false);
  const liste = data ?? [];

  const abmelden = async (id: number, name: string) => {
    const ok = await confirm({
      title: `„${name}“ abmelden?`,
      message: 'Der Rechner kommt danach nicht mehr an Ihre Apps.',
      confirmText: 'Abmelden',
      cancelText: 'Abbrechen',
      confirmVariant: 'warning',
    });
    if (!ok) return;
    widerrufen.mutate(id, { onSuccess: () => toast.success(`„${name}“ ist abgemeldet.`) });
  };

  const ueberallAbmelden = async () => {
    const ok = await confirm({
      title: 'Überall abmelden',
      message: 'Alle Sitzungen auf allen Geräten werden beendet, auch diese.',
      confirmText: 'Überall abmelden',
      cancelText: 'Abbrechen',
      confirmVariant: 'warning',
    });
    if (!ok) return;
    setUeberall(true);
    try {
      await api.post('/auth/logout-all', null, { showError: false });
    } catch {
      toast.error('Die anderen Sitzungen ließen sich nicht beenden. Sie werden hier abgemeldet.');
    } finally {
      window.location.href = '/';
    }
  };

  return (
    <>
      <Kopf
        titel="Angemeldete Rechner"
        beschreibung="Wo Ihr Konto gerade angemeldet ist. Ein fremder Rechner lässt sich hier abmelden."
        werkzeuge={
          liste.length > 0 ? (
            <Werkzeug
              symbol={<LogOut />}
              beschriftung="Überall abmelden"
              onClick={() => void ueberallAbmelden()}
              disabled={ueberall}
              data-testid="ueberall-abmelden"
            />
          ) : undefined
        }
      />
      {ConfirmDialog}
      <RechnerVerbinden />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Wird geladen …</p>
      ) : isError ? (
        <p className="text-sm text-muted-foreground" data-testid="rechner-fehler">
          Die Liste ließ sich nicht laden.
        </p>
      ) : liste.length === 0 ? (
        <Leerzustand titel="Kein Rechner angemeldet" />
      ) : (
        <ul className="rounded-md border border-border" data-testid="rechner-liste">
          {liste.map(a => (
            <li
              key={a.id}
              data-testid={`rechner-${a.id}`}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
            >
              <span className="text-sm font-medium text-foreground">{a.name}</span>
              <span className="text-xs text-muted-foreground">
                {a.zuletzt_benutzt_am
                  ? `zuletzt ${formatDate(a.zuletzt_benutzt_am)}`
                  : 'noch nie benutzt'}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                disabled={widerrufen.isPending}
                onClick={() => void abmelden(a.id, a.name)}
                data-testid={`rechner-abmelden-${a.id}`}
              >
                abmelden
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function bereichAus(wert: string | undefined): BereichId {
  return BEREICHE.find(b => b.id === wert)?.id ?? 'profil';
}

function Bereich({ id }: { id: BereichId }) {
  switch (id) {
    case 'passwort':
      return (
        <ComponentErrorBoundary componentName="Passwort">
          <Kopf
            titel="Passwort"
            beschreibung="Ein neues Passwort gilt sofort, andere Rechner melden sich danach neu an."
          />
          <PasswordManagement />
        </ComponentErrorBoundary>
      );
    case 'rechner':
      return (
        <ComponentErrorBoundary componentName="Angemeldete Rechner">
          <AngemeldeteRechner />
        </ComponentErrorBoundary>
      );
    case 'erscheinungsbild':
      return (
        <ComponentErrorBoundary componentName="Erscheinungsbild">
          <Erscheinungsbild />
        </ComponentErrorBoundary>
      );
    default:
      return (
        <ComponentErrorBoundary componentName="Profil">
          <Kopf titel="Profil" beschreibung="Ihr Name und Ihre Adresse auf diesem Gerät." />
          <ProfilFormular />
        </ComponentErrorBoundary>
      );
  }
}

export default function Einstellungen() {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const bereich = bereichAus(ansicht.bereich);

  const gruppen: SeitenleistenGruppe[] = (['Konto', 'Darstellung'] as const).map(titel => ({
    titel,
    eintraege: BEREICHE.filter(b => b.gruppe === titel).map(b => ({
      kennung: b.id,
      name: b.name,
      symbol: b.symbol,
      aktiv: bereich === b.id,
      kennzeichen: `einstellungen-${b.id}`,
      aufKlick: () => oeffne({ type: 'settings', bereich: b.id }),
    })),
  }));
  return (
    <div className="h-full min-h-0" data-testid="einstellungen">
      <Bereichsrahmen
        titel="Einstellungen"
        gruppen={gruppen}
        kennzeichen="einstellungen-bereiche"
        bereich={bereich}
      >
        <Bereich id={bereich} />
      </Bereichsrahmen>
    </div>
  );
}
