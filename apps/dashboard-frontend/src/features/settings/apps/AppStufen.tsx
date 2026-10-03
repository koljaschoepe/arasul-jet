/**
 * Die Freigabestufen einer App und wer in jeder zuerst gefragt wird (M5).
 *
 * Die Stufen nennt der Entwickler im Kopf seiner Flows (`stufen`, Kontrakt 8),
 * die Person nie: die setzt der Administrator hier, je App und Stufe, an genau
 * dieser einen Stelle (frontend.md, Verwaltung, Apps). Jede neue Freigabe der
 * Stufe liegt zuerst bei ihr; jeder mit Zugang kann sie übernehmen oder
 * weitergeben.
 *
 * OHNE STANDARDPERSON liegt eine neue Freigabe bei allen mit Zugang, und das
 * steht als Hinweis da — bei zwanzig Menschen fühlt sich sonst niemand gemeint.
 * Zur Wahl stehen nur Menschen mit Zugang; wer ihn verliert, fällt als
 * Standardperson aus, und der Hinweis sagt es.
 */
import { Meldung, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@marken';
import { SkeletonText } from '@/components/ui/Skeleton';
import { useToast } from '@/contexts/ToastContext';
import { useAppStufen, useStufePersonSetzen, type AppStufe } from './useAppVerwaltung';

const NIEMAND = '__niemand__';

export function AppStufen({ appId }: { appId: string }) {
  const toast = useToast();
  const { data, isLoading, isError } = useAppStufen(appId);
  const setzen = useStufePersonSetzen(appId);

  if (isLoading) return <SkeletonText lines={2} />;
  if (isError || !data) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="stufen-fehler">
        Die Stufen ließen sich nicht laden.
      </p>
    );
  }
  if (data.stufen.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="stufen-leer">
        Kein Flow dieser App nennt eine Freigabestufe.
      </p>
    );
  }

  const waehle = (s: AppStufe, wert: string) => {
    const benutzerId = wert === NIEMAND ? null : Number(wert);
    const name = s.bezeichnung || s.stufe;
    setzen.mutate(
      { stufe: s.stufe, benutzerId },
      {
        onSuccess: () => {
          const wer = data.personen.find(p => p.id === benutzerId)?.username;
          toast.success(
            wer
              ? `Neue Freigaben der Stufe ${name} liegen zuerst bei ${wer}.`
              : `Neue Freigaben der Stufe ${name} liegen bei allen mit Zugang.`
          );
        },
      }
    );
  };

  return (
    <ul className="flex flex-col rounded-md border border-border" data-testid="stufen-liste">
      {data.stufen.map(s => (
        <li
          key={s.stufe}
          className="flex flex-col gap-2 border-b border-border p-ui-3 last:border-b-0"
          data-testid={`stufe-${s.stufe}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {s.bezeichnung || s.stufe}
                {s.bezeichnung && (
                  <span className="ml-2 font-mono text-ui-xs text-muted-foreground">{s.stufe}</span>
                )}
              </span>
              <span className="block text-ui-xs text-muted-foreground">
                {s.flows.length === 1 ? 'Flow' : 'Flows'} {s.flows.join(', ')}
              </span>
            </span>
            <Select
              value={s.person && s.gilt ? String(s.person.id) : NIEMAND}
              disabled={setzen.isPending}
              onValueChange={wert => waehle(s, wert)}
            >
              <SelectTrigger
                size="sm"
                className="w-48"
                aria-label={`Standardperson der Stufe ${s.bezeichnung || s.stufe}`}
                data-testid={`stufe-${s.stufe}-person`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NIEMAND} data-testid={`stufe-${s.stufe}-niemand`}>
                  alle mit Zugang
                </SelectItem>
                {data.personen.map(p => (
                  <SelectItem
                    key={p.id}
                    value={String(p.id)}
                    data-testid={`stufe-${s.stufe}-${p.username}`}
                  >
                    {p.username}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {s.hinweis && (
            <Meldung art="warnung" kennzeichen={`stufe-${s.stufe}-hinweis`}>
              {s.hinweis}
            </Meldung>
          )}
        </li>
      ))}
    </ul>
  );
}
