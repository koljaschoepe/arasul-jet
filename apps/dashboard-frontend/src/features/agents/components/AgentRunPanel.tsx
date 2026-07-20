/**
 * Lauf-Ansicht eines Agenten (Plan 010, Schritt 2): Eingabe → „Ausführen" →
 * das Ergebnis streamt live über SSE herein. Schlank — nur der aktuelle Lauf.
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/shadcn/button';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Label } from '@/components/ui/shadcn/label';
import { runAgentStream, type RunHandle } from '../runAgentStream';
import type { FlowAgent, RunEvent } from '../types';

interface Props {
  agent: FlowAgent;
}

type RunState = 'idle' | 'running' | 'done' | 'error';

export function AgentRunPanel({ agent }: Props) {
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<RunState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const handleRef = useRef<RunHandle | null>(null);

  // Läuft der Agent noch beim Wechsel/Unmount, den Stream abbrechen.
  useEffect(() => {
    return () => handleRef.current?.cancel();
  }, [agent.id]);

  const onEvent = (evt: RunEvent) => {
    switch (evt.type) {
      case 'status':
        setStatus('running');
        break;
      case 'text':
        setOutput(evt.content);
        break;
      case 'done':
        setOutput(evt.result);
        setStatus('done');
        break;
      case 'error':
        setErrorMsg(evt.message);
        setStatus('error');
        break;
    }
  };

  const run = () => {
    setOutput('');
    setErrorMsg('');
    setStatus('running');
    const { handle } = runAgentStream(agent.id, input, onEvent);
    handleRef.current = handle;
  };

  const running = status === 'running';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="agent-input">Eingabe</Label>
        <Textarea
          id="agent-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Was soll der Agent tun?"
          rows={3}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button onClick={run} disabled={running}>
          {running ? 'Läuft…' : 'Ausführen'}
        </Button>
        {running && (
          <Button variant="outline" onClick={() => handleRef.current?.cancel()}>
            Abbrechen
          </Button>
        )}
        {status === 'done' && <span className="text-xs text-muted-foreground">Fertig</span>}
      </div>

      {errorMsg && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      {(output || running) && (
        <div className="flex flex-col gap-1.5">
          <Label>Ergebnis</Label>
          <div className="min-h-16 whitespace-pre-wrap rounded-md border border-border bg-card p-3 text-sm text-foreground">
            {output || (running ? 'Der Agent arbeitet…' : '')}
          </div>
        </div>
      )}
    </div>
  );
}
