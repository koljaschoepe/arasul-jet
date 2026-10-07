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
 * Am Handy ist die Leiste ein Blatt, und dort steht „Abmelden" als letzter
 * Eintrag: die Fußzeile mit dem Kontomenü gibt es unter 900 px nicht.
 */
import { Lock, LogOut, Monitor, Moon, Palette, Sun, User } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Kopf,
  Label,
  Leerzustand,
  RadioGroup,
  RadioGroupItem,
  useSchmalesFenster,
  type SeitenleistenGruppe,
} from '@marken';
import { Bereichsrahmen } from '@/components/Bereichsrahmen';
import { useAuth } from '@/contexts/AuthContext';
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

const THEME_WAHLEN: ReadonlyArray<{ wert: ThemeWahl; label: string; icon: typeof Sun }> = [
  { wert: 'system', label: 'System', icon: Monitor },
  { wert: 'light', label: 'Hell', icon: Sun },
  { wert: 'dark', label: 'Dunkel', icon: Moon },
];

function Erscheinungsbild() {
  const { wahl, setTheme } = useTheme();
  return (
    <>
      <Kopf titel="Erscheinungsbild" symbol={<Palette />} />
      <RadioGroup
        value={wahl}
        onValueChange={wert => {
          // `setTheme` meldet einen Fehler über `useApi` selbst.
          void setTheme(wert as ThemeWahl).catch(() => {});
        }}
        aria-label="Erscheinungsbild"
        className="items-start justify-items-start"
        data-testid="erscheinungsbild"
      >
        {THEME_WAHLEN.map(({ wert, label, icon: Icon }) => (
          <div key={wert} className="flex items-center gap-3">
            <RadioGroupItem value={wert} id={`theme-${wert}`} />
            <Label
              htmlFor={`theme-${wert}`}
              className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground"
            >
              <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {label}
            </Label>
          </div>
        ))}
      </RadioGroup>
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
        symbol={<Monitor />}
        aktionen={
          liste.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void ueberallAbmelden()}
              disabled={ueberall}
              data-testid="ueberall-abmelden"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Überall abmelden
            </Button>
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

/** Die Bereiche der Einstellungen, in dieser Reihenfolge (`frontend.md`). */
const BEREICHE = [
  { id: 'profil', name: 'Profil', symbol: <User />, gruppe: 'Konto' },
  { id: 'passwort', name: 'Passwort', symbol: <Lock />, gruppe: 'Konto' },
  { id: 'rechner', name: 'Angemeldete Rechner', symbol: <Monitor />, gruppe: 'Konto' },
  { id: 'erscheinungsbild', name: 'Erscheinungsbild', symbol: <Palette />, gruppe: 'Darstellung' },
] as const;

type BereichId = (typeof BEREICHE)[number]['id'];

function bereichAus(wert: string | undefined): BereichId {
  return BEREICHE.find(b => b.id === wert)?.id ?? 'profil';
}

function Bereich({ id }: { id: BereichId }) {
  switch (id) {
    case 'passwort':
      return (
        <ComponentErrorBoundary componentName="Passwort">
          <Kopf titel="Passwort" symbol={<Lock />} />
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
          <Kopf titel="Profil" symbol={<User />} />
          <ProfilFormular />
        </ComponentErrorBoundary>
      );
  }
}

export default function Einstellungen() {
  const ansicht = useWorkspaceStore(s => s.ansicht);
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const { logout } = useAuth();
  const schmal = useSchmalesFenster();
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
  // Am Handy gibt es keine Fußzeile und damit kein Kontomenü: „Abmelden" ist
  // dort der letzte Eintrag dieser Leiste (`frontend.md`, Rahmen).
  if (schmal) {
    gruppen.push({
      eintraege: [
        {
          kennung: 'abmelden',
          name: 'Abmelden',
          symbol: <LogOut />,
          kennzeichen: 'workspace-abmelden',
          aufKlick: () => void logout(),
        },
      ],
    });
  }

  return (
    <div className="h-full min-h-0" data-testid="einstellungen">
      <Bereichsrahmen titel="Einstellungen" gruppen={gruppen} kennzeichen="einstellungen-bereiche">
        <Bereich id={bereich} />
      </Bereichsrahmen>
    </div>
  );
}
