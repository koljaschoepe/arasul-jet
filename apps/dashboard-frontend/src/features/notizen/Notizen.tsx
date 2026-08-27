/**
 * Der Zettel in der rechten Spalte (Phase D1).
 *
 * Seit Phase B2 stand hier „Noch nichts hier": Agent-Chat und Terminal, die
 * diese Fläche als eine Spalte mit zwei Modi teilten, sind aus der Oberfläche
 * gefallen. Das Zielbild aus Beschluss 10 vom 26.08.2026 sagt: rechts Notizen.
 *
 * EIN FELD, KEIN EDITOR. Kein Formatieren, keine Blätter, kein Suchen — die
 * rechte Spalte ist der Zettel neben der Arbeit. Wer mehr braucht, braucht
 * eine App dafür (und dieses Repo hatte ein Dokumentensystem, das B2 wieder
 * ausgebaut hat).
 *
 * GESPEICHERT WIRD VON SELBST, nach einer Sekunde Ruhe. Ein Speichern-Knopf
 * wäre die zweite Sache, an die jemand denken muss, während er sich etwas
 * notiert; und ein Zettel, dessen Inhalt beim Schließen des Fensters weg ist,
 * ist kein Zettel. Was der Server bestätigt hat, steht unten in der Zeile —
 * ein stilles „gespeichert" ohne Beleg wäre eine Behauptung.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';

interface NotizAntwort {
  inhalt: string;
  geaendert_am: string | null;
}

const NOTIZ_KEY = ['notizen'] as const;

/** So lange wird nach dem letzten Tastendruck gewartet, bevor geschrieben wird. */
const RUHE_MS = 1000;

export function Notizen() {
  const api = useApi();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: NOTIZ_KEY,
    queryFn: async () => {
      const res = await api.get<{ data: NotizAntwort }>('/notizen', { showError: false });
      return res.data;
    },
    staleTime: 60_000,
  });

  // Der Text im Feld ist lokaler Zustand: er gehört dem Tippenden, nicht dem
  // Server. Erst wenn eine Sekunde Ruhe war, geht er hinaus.
  const [text, setText] = useState('');
  const geladen = useRef(false);

  // Genau einmal übernehmen, beim ersten Eintreffen. Ein `useEffect` auf `data`
  // ohne diesen Riegel überschriebe den gerade getippten Text, sobald React
  // Query die Antwort auffrischt.
  useEffect(() => {
    if (geladen.current || data === undefined) return;
    geladen.current = true;
    setText(data.inhalt);
  }, [data]);

  const speichern = useMutation({
    mutationFn: (inhalt: string) =>
      api.put<{ data: NotizAntwort }>('/notizen', { inhalt }, { showError: false }),
    onSuccess: res => {
      qc.setQueryData(NOTIZ_KEY, res.data);
    },
  });

  // Der Zeitgeber hängt am Text, nicht an einem Knopf. Jeder Tastendruck setzt
  // ihn zurück; die letzte Fassung gewinnt.
  const merken = speichern.mutate;
  useEffect(() => {
    if (!geladen.current) return;
    if (data !== undefined && text === data.inhalt) return;
    const id = setTimeout(() => merken(text), RUHE_MS);
    return () => clearTimeout(id);
  }, [text, data, merken]);

  const stand = speichern.isPending
    ? 'wird gespeichert …'
    : speichern.isError
      ? 'nicht gespeichert'
      : data?.geaendert_am
        ? `gespeichert ${new Date(data.geaendert_am).toLocaleTimeString('de-DE', {
            hour: '2-digit',
            minute: '2-digit',
          })}`
        : 'noch nichts notiert';

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="notizen">
      <label htmlFor="notizen-feld" className="sr-only">
        Notizen
      </label>
      <textarea
        id="notizen-feld"
        value={text}
        disabled={isLoading}
        onChange={e => setText(e.target.value)}
        placeholder="Notizen …"
        spellCheck={false}
        className="min-h-0 flex-1 resize-none bg-background px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
      />
      <p
        className="shrink-0 px-3 py-1 text-ui-xs text-muted-foreground"
        aria-live="polite"
        data-testid="notizen-stand"
      >
        {stand}
      </p>
    </div>
  );
}
