/**
 * Die Einstellungen: für alle gleich und nur persönlich (M5).
 *
 * Vier Abschnitte, in dieser Reihenfolge: Profil, Passwort, Angemeldete
 * Rechner, Erscheinungsbild. Alles Gerätebezogene steht in der Verwaltung
 * (`features/settings/`), und keine Funktion steht an beiden Orten.
 *
 * Kein Kopf mit Logo: oben steht gleich der Name des ersten Abschnitts.
 */
import { LogOut, Monitor, Moon, Palette, Sun, User } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Feldgruppe,
  Formularseite,
  Label,
  Leerzustand,
  RadioGroup,
  RadioGroupItem,
} from '@marken';
import { ComponentErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/hooks/useApi';
import useConfirm from '@/hooks/useConfirm';
import { useTheme, type ThemeWahl } from '@/hooks/useTheme';
import { formatDate } from '@/utils/formatting';
import PasswordManagement from './PasswordManagement';
import { ProfilFormular } from './ProfilFormular';
import { useAusweise, useAusweisWiderrufen } from './useAusweise';

const THEME_WAHLEN: ReadonlyArray<{ wert: ThemeWahl; label: string; icon: typeof Sun }> = [
  { wert: 'system', label: 'System', icon: Monitor },
  { wert: 'light', label: 'Hell', icon: Sun },
  { wert: 'dark', label: 'Dunkel', icon: Moon },
];

function Erscheinungsbild() {
  const { wahl, setTheme } = useTheme();
  return (
    <Feldgruppe titel="Erscheinungsbild" symbol={<Palette />}>
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
    </Feldgruppe>
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
    <Feldgruppe
      titel="Angemeldete Rechner"
      symbol={<Monitor />}
      aktion={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void ueberallAbmelden()}
          disabled={ueberall}
          data-testid="ueberall-abmelden"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Überall abmelden
        </Button>
      }
    >
      {ConfirmDialog}
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
    </Feldgruppe>
  );
}

export default function Einstellungen() {
  return (
    <div className="max-w-225 p-6 animate-in fade-in max-md:p-4" data-testid="einstellungen">
      <Formularseite>
        <Feldgruppe titel="Profil" symbol={<User />}>
          <ComponentErrorBoundary componentName="Profil">
            <ProfilFormular />
          </ComponentErrorBoundary>
        </Feldgruppe>
        <ComponentErrorBoundary componentName="Passwort">
          <PasswordManagement />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary componentName="Angemeldete Rechner">
          <AngemeldeteRechner />
        </ComponentErrorBoundary>
        <ComponentErrorBoundary componentName="Erscheinungsbild">
          <Erscheinungsbild />
        </ComponentErrorBoundary>
      </Formularseite>
    </div>
  );
}
