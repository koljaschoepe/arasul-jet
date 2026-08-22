/**
 * Die Rückfrage eines laufenden Flows (Plan 023 I3).
 *
 * Die Form folgt derselben Regel wie überall in Arasul: bis zu vier
 * Empfehlungen, die erste ist die Empfehlung, dazu **immer** ein Freitextfeld.
 * Das Freitextfeld ist nicht das Kleingedruckte, sondern der Grund, warum die
 * Optionen Vorschläge heißen dürfen.
 *
 * Der Lauf wartet, während diese Karte steht. Deshalb sagt sie das auch: ohne
 * den Satz sieht ein stehengebliebener Fortschritt wie ein Fehler aus.
 */
import { useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { cn } from '@/lib/utils';

export interface RueckfrageKarteProps {
  frage: string;
  optionen: string[];
  /** Schickt die Antwort. Wirft bei Fehlern; die Karte zeigt sie an. */
  onAntwort: (antwort: string) => Promise<void>;
}

export function RueckfrageKarte({ frage, optionen, onAntwort }: RueckfrageKarteProps) {
  const [frei, setFrei] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const schicken = async (antwort: string) => {
    const text = antwort.trim();
    if (!text || laeuft) return;
    setLaeuft(true);
    setFehler(null);
    try {
      await onAntwort(text);
      setFrei('');
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Antwort kam nicht an');
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3"
      data-testid="flow-rueckfrage"
    >
      <div className="flex items-start gap-2">
        <MessageCircleQuestion
          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{frage}</p>
          <p className="text-ui-xs text-muted-foreground">Der Flow wartet auf deine Antwort.</p>
        </div>
      </div>

      {optionen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {optionen.map((o, i) => (
            <Button
              key={o}
              type="button"
              size="sm"
              variant={i === 0 ? 'default' : 'outline'}
              disabled={laeuft}
              data-testid={`flow-option-${i}`}
              onClick={() => void schicken(o)}
              className={cn('h-7', i === 0 && 'font-medium')}
            >
              {o}
              {i === 0 && <span className="ml-1.5 text-ui-xs opacity-80">empfohlen</span>}
            </Button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2"
        onSubmit={e => {
          e.preventDefault();
          void schicken(frei);
        }}
      >
        <Input
          value={frei}
          onChange={e => setFrei(e.target.value)}
          placeholder={optionen.length > 0 ? 'Oder eigene Antwort …' : 'Deine Antwort …'}
          disabled={laeuft}
          maxLength={2000}
          aria-label="Eigene Antwort"
          data-testid="flow-antwort-frei"
          className="h-8"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={laeuft || !frei.trim()}
          className="h-8 shrink-0"
          data-testid="flow-antwort-senden"
        >
          <Send className="h-3.5 w-3.5" aria-hidden="true" />
          Senden
        </Button>
      </form>

      {fehler && (
        <p className="text-ui-xs text-destructive" role="alert">
          {fehler}
        </p>
      )}
    </div>
  );
}

export default RueckfrageKarte;
