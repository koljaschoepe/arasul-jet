/**
 * „Für Sie" auf der Startseite (M5, 04.10.2026): die Freigaben, die bei mir
 * liegen, je Zeile die App, der Gegenstand und seit wann. Ein Klick öffnet die
 * App beim Vorgang (`?freigabe=<nummer>`, Kontrakt in `docs/features/APP-PAKET.md`).
 * Entschieden wird dort, in der App, mit dem Baustein `Freigabe` der
 * Bibliothek; hier steht ein Posteingang und keine zweite Oberfläche zum
 * Entscheiden — jede Funktion an genau einer Stelle (`frontend.md`).
 *
 * Eine neue Freigabe liegt bei der Standardperson ihrer Stufe, die der
 * Administrator je App setzt; ohne sie bei allen mit Zugang. Jeder mit Zugang
 * kann eine Freigabe übernehmen oder weitergeben. Deshalb steht unter jeder
 * Zeile, bei wem sie liegt, mit „Weitergeben an …", und darunter — zugeklappt —
 * was bei anderen liegt, mit „Übernehmen". Die Zahl am Haus zählt nur die
 * Liste oben (`useOffeneFreigaben`); das Backend filtert, nicht diese Datei.
 *
 * Leer steht dort EINE Zeile („Keine Freigabe liegt bei Ihnen."): wer
 * eingereicht hat und vier Augen braucht, muss wissen, WO Freigaben stehen.
 *
 * WAS HIER NICHT STEHT: eine Historie der entschiedenen Freigaben. Die Liste
 * ist ein Posteingang, kein Archiv.
 */
import { useState } from 'react';
import { ChevronDown, ChevronRight, ClipboardCheck, Send, UserRound } from 'lucide-react';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@marken';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useToast } from '@/contexts/ToastContext';
import {
  useOffeneFreigaben,
  useEingereichteFreigaben,
  useFreigabenBeiAnderen,
  useFreigabeVerlegen,
  type OffeneFreigabe,
} from '@/hooks/useOffeneFreigaben';
import { wartetSeit, oderListe } from './frist';

/** Die Stufe in Worten: die Bezeichnung aus dem Flow, sonst ihr Name. */
function stufeName(f: Pick<OffeneFreigabe, 'stufe' | 'stufe_bezeichnung'>): string | null {
  return f.stufe_bezeichnung || f.stufe || null;
}

/**
 * Was ich eingereicht habe und noch offen ist: eine Zeile je Vorgang, mit dem
 * Kreis, bei dem er liegt (26.09.2026).
 *
 * Bei vier Augen sieht der Einreicher seine Anfrage in der Liste darüber NICHT
 * — richtig, er darf sie nicht entscheiden. Aber bis hierher erfuhr er auch
 * nirgends, dass sie existiert und bei wem sie liegt; aus seiner Sicht war der
 * Vorgang nach dem Absenden verschwunden. Keine Karte, keine Knöpfe: zu tun
 * gibt es hier nichts, nur zu wissen.
 */
function Eingereicht() {
  const { data } = useEingereichteFreigaben();
  if (!data || data.length === 0) return null;
  return (
    <ul className="mt-2 flex flex-col gap-1" data-testid="eingereichte-freigaben">
      {data.map(e => (
        <li
          key={e.id}
          className="flex items-start gap-2 text-ui-sm text-muted-foreground"
          data-testid={`eingereicht-${e.id}`}
        >
          <Send className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Ihr Vorgang <span className="font-medium text-foreground">„{e.titel}“</span> (
            {e.app_name || e.app_id}) {wartetSeit(e.angefragt_am)}
            {e.liegt_bei
              ? ` bei ${e.liegt_bei}.`
              : e.kreis.length > 0
                ? ` auf ${oderListe(e.kreis)}.`
                : '; niemand kann ihn entscheiden.'}
            {e.ohne_einreicher && ' Vier-Augen-Prinzip: Sie entscheiden nicht mit.'}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Unter jeder Karte: bei wem sie liegt, und an wen sie weitergehen kann (M5).
 *
 * Weitergeben geht nur an jemanden aus dem Kreis — das Backend prüft es, und
 * die Auswahl zeigt auch nur diese. Ohne Standardperson liegt die Freigabe bei
 * allen mit Zugang; der Administrator liest dazu, wo er das ändert.
 */
function Zustaendigkeit({
  f,
  ich,
  istAdmin,
}: {
  f: OffeneFreigabe;
  ich: string;
  istAdmin: boolean;
}) {
  const verlegen = useFreigabeVerlegen();
  const toast = useToast();
  const andere = (f.kreis ?? []).filter(k => k !== ich);
  const stufe = stufeName(f);

  const weitergeben = (an: string) => {
    verlegen.mutate(
      { id: f.id, an },
      { onSuccess: () => toast.success(`„${f.titel}" liegt jetzt bei ${an}.`) }
    );
  };

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 px-ui-3 pb-ui-2 text-ui-xs text-muted-foreground empty:hidden"
      data-testid={`freigabe-${f.id}-zustaendig`}
    >
      <span className="flex items-center gap-1">
        <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
        {f.liegt_bei ? 'Liegt bei Ihnen.' : 'Liegt bei allen mit Zugang.'}
      </span>
      {!f.liegt_bei && istAdmin && (
        <span data-testid={`freigabe-${f.id}-hinweis`}>
          Keine Standardperson{stufe ? ` für die Stufe ${stufe}` : ''}: setzen unter Verwaltung,
          Apps, {f.app_name || f.app_id}.
        </span>
      )}
      {andere.length > 0 && (
        <Select value="" disabled={verlegen.isPending} onValueChange={weitergeben}>
          <SelectTrigger
            size="sm"
            className="h-7 w-auto gap-1 text-ui-xs"
            aria-label={`${f.titel} weitergeben`}
            data-testid={`freigabe-${f.id}-weitergeben`}
          >
            <SelectValue placeholder="Weitergeben an …" />
          </SelectTrigger>
          <SelectContent>
            {andere.map(k => (
              <SelectItem key={k} value={k} data-testid={`freigabe-${f.id}-an-${k}`}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

/**
 * Was bei anderen liegt und ich übernehmen kann (M5). Zugeklappt: die Seite
 * heißt „Für Sie", und dies ist nicht für mich, solange ich es nicht nehme.
 */
function BeiAnderen() {
  const { data } = useFreigabenBeiAnderen();
  const verlegen = useFreigabeVerlegen();
  const toast = useToast();
  const [offen, setOffen] = useState(false);
  if (!data || data.length === 0) return null;

  const uebernehmen = (f: OffeneFreigabe) => {
    verlegen.mutate(
      { id: f.id },
      { onSuccess: () => toast.success(`„${f.titel}" liegt jetzt bei Ihnen.`) }
    );
  };

  return (
    <div className="mt-3" data-testid="freigaben-bei-anderen">
      <button
        type="button"
        onClick={() => setOffen(o => !o)}
        aria-expanded={offen}
        className="flex items-center gap-1 text-ui-sm text-muted-foreground hover:text-foreground"
        data-testid="freigaben-bei-anderen-schalter"
      >
        {offen ? (
          <ChevronDown className="size-4" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-4" aria-hidden="true" />
        )}
        {data.length === 1
          ? '1 Freigabe liegt bei anderen'
          : `${data.length} Freigaben liegen bei anderen`}
      </button>
      {offen && (
        <ul className="mt-2 flex flex-col rounded-md border border-border">
          {data.map(f => {
            const stufe = stufeName(f);
            return (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border p-ui-3 last:border-b-0"
                data-testid={`bei-anderen-${f.id}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-ui-sm font-medium text-foreground">{f.titel}</span>
                  <span className="block text-ui-xs text-muted-foreground">
                    {f.app_name || f.app_id}
                    {stufe ? ` · Stufe ${stufe}` : ''} · liegt bei {f.liegt_bei} ·{' '}
                    {wartetSeit(f.angefragt_am)}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={verlegen.isPending}
                  onClick={() => uebernehmen(f)}
                  data-testid={`bei-anderen-${f.id}-uebernehmen`}
                >
                  Übernehmen
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Eine Zeile: App, Gegenstand, seit wann. Der Klick öffnet die App beim
 * Vorgang; „Weitergeben" und der Hinweis stehen darunter.
 */
function Zeile({ f, ich, istAdmin }: { f: OffeneFreigabe; ich: string; istAdmin: boolean }) {
  const oeffne = useWorkspaceStore(s => s.oeffne);
  const app = `${f.stand === 'test' ? '(Test) ' : ''}${f.app_name || f.app_id}`;
  const stufe = stufeName(f);
  return (
    <li className="border-b border-border last:border-b-0" data-testid={`freigabe-${f.id}`}>
      <button
        type="button"
        onClick={() =>
          oeffne({
            type: 'app',
            appId: f.app_id,
            stand: f.stand,
            vorgang: f.id,
            title: f.app_name || f.app_id,
          })
        }
        className="flex w-full flex-wrap items-baseline gap-x-3 gap-y-0.5 p-ui-3 text-left transition-colors duration-[120ms] hover:bg-primary/12 motion-reduce:transition-none"
        data-testid={`freigabe-${f.id}-oeffnen`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-ui-sm font-medium text-foreground">{f.titel}</span>
          <span className="block text-ui-xs text-muted-foreground">
            {app}
            {stufe ? ` · Stufe ${stufe}` : ''}
          </span>
        </span>
        <span className="text-ui-xs text-muted-foreground">
          {wartetSeit(f.liegt_seit ?? f.angefragt_am)}
        </span>
      </button>
      <Zustaendigkeit f={f} ich={ich} istAdmin={istAdmin} />
    </li>
  );
}

export function OffeneFreigaben() {
  const { data, isLoading, isError } = useOffeneFreigaben();
  const { user } = useAuth();
  const ich = user?.username ?? '';
  const istAdmin = user?.role === 'admin';

  // Beim ersten Laden bleibt der Platz leer statt ein Skelett zu zeigen: in
  // aller Regel ist die Liste leer, und ein Skelett, das zu einer Zeile
  // zusammenfällt, stiftet nur Unruhe. Nach einem Fehler steht ebenfalls
  // nichts da — „keine Freigabe" wäre dann eine Behauptung, keine Auskunft.
  if (isLoading || isError || !data) return null;

  if (data.length === 0) {
    return (
      <section className="mb-6" data-testid="offene-freigaben" data-leer="true">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Für Sie</h2>
        <p className="flex items-center gap-2 text-ui-sm text-muted-foreground">
          <ClipboardCheck className="size-4 shrink-0" aria-hidden="true" />
          Keine Freigabe liegt bei Ihnen.
        </p>
        <BeiAnderen />
        <Eingereicht />
      </section>
    );
  }

  return (
    <section className="mb-6" data-testid="offene-freigaben">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        Für Sie
        <span className="font-normal text-muted-foreground" data-testid="fuer-sie-zahl">
          {data.length === 1 ? '1 Freigabe' : `${data.length} Freigaben`}
        </span>
      </h2>
      <ul className="flex flex-col rounded-md border border-border" data-testid="fuer-sie">
        {data.map(f => (
          <Zeile key={f.id} f={f} ich={ich} istAdmin={istAdmin} />
        ))}
      </ul>
      <BeiAnderen />
      <Eingereicht />
    </section>
  );
}
