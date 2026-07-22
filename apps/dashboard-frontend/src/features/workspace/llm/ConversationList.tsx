/**
 * ConversationList — vergangene Unterhaltungen wiederfinden (Plan 011, Schritt 20).
 *
 * Der Verlauf-Knopf im Chat-Kopf öffnet diese Liste: ein Suchfeld, die Treffer
 * (oder die letzten Chats, solange nicht gesucht wird) und je Zeile das
 * Umbenennen. So findet man Wochen später zum Skill-Lauf von damals zurück.
 *
 * Suche und Umbenennen nutzen die vorhandenen Endpunkte (`GET /chats/search`,
 * `PATCH /chats/:id`); der Auto-Titel aus der ersten Nachricht kommt vom Server.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { History, Pencil, Check, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/shadcn/popover';
import { Input } from '@/components/ui/shadcn/input';
import { useApi } from '@/hooks/useApi';

interface ChatRow {
  id: number;
  title?: string;
  updated_at?: string;
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.round(h / 24)} Tg`;
}

interface ConversationListProps {
  /** Wird mit der gewählten Chat-ID aufgerufen. */
  onSelect: (id: number) => void;
}

export default function ConversationList({ onSelect }: ConversationListProps) {
  const api = useApi();
  const qc = useQueryClient();
  const [offen, setOffen] = useState(false);
  const [suche, setSuche] = useState('');
  const [entprellt, setEntprellt] = useState('');
  const [umbenennen, setUmbenennen] = useState<number | null>(null);
  const [entwurf, setEntwurf] = useState('');
  const eingabeRef = useRef<HTMLInputElement>(null);

  // Sucheingabe entprellen — nicht jeder Tastendruck fragt den Server.
  useEffect(() => {
    const t = setTimeout(() => setEntprellt(suche.trim()), 250);
    return () => clearTimeout(t);
  }, [suche]);

  // Leere Suche → die letzten Chats; sonst die Titel-Suche.
  const liste = useQuery({
    queryKey: ['chats', 'liste', entprellt],
    enabled: offen,
    staleTime: 10_000,
    queryFn: async () => {
      const pfad = entprellt ? `/chats/search?q=${encodeURIComponent(entprellt)}` : '/chats/recent';
      const d = await api.get<{ chats?: ChatRow[] } | ChatRow[]>(pfad, { showError: false });
      // Robust gegen unerwartete Formen: nur ein echtes Array durchlassen.
      const roh = Array.isArray(d) ? d : d?.chats;
      return Array.isArray(roh) ? roh : [];
    },
  });

  const chats = liste.data ?? [];

  const waehlen = (id: number) => {
    setOffen(false);
    onSelect(id);
  };

  const starteUmbenennen = (c: ChatRow) => {
    setUmbenennen(c.id);
    setEntwurf(c.title || '');
    // Nach dem Render fokussieren.
    setTimeout(() => eingabeRef.current?.select(), 0);
  };

  const speichereTitel = async (id: number) => {
    const titel = entwurf.trim();
    setUmbenennen(null);
    if (!titel) return;
    await api.patch(`/chats/${id}`, { title: titel });
    // Liste und Kopf-Titel des offenen Chats auffrischen.
    qc.invalidateQueries({ queryKey: ['chats'] });
    liste.refetch();
  };

  return (
    <Popover open={offen} onOpenChange={setOffen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Chat-Verlauf"
          title="Chat-Verlauf"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <History className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <Input
          value={suche}
          onChange={e => setSuche(e.target.value)}
          placeholder="Unterhaltungen durchsuchen …"
          aria-label="Unterhaltungen durchsuchen"
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-72 overflow-y-auto">
          {liste.isLoading && <p className="px-1 py-2 text-xs text-muted-foreground">Lädt …</p>}
          {!liste.isLoading && chats.length === 0 && (
            <p className="px-1 py-2 text-xs text-muted-foreground">
              {entprellt ? 'Keine Treffer' : 'Keine früheren Chats'}
            </p>
          )}
          {chats.map(c =>
            umbenennen === c.id ? (
              <div key={c.id} className="flex items-center gap-1 px-1 py-1">
                <Input
                  ref={eingabeRef}
                  value={entwurf}
                  onChange={e => setEntwurf(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') speichereTitel(c.id);
                    if (e.key === 'Escape') setUmbenennen(null);
                  }}
                  aria-label="Neuer Titel"
                  className="h-7 flex-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => speichereTitel(c.id)}
                  aria-label="Titel speichern"
                  className="rounded p-1 text-muted-foreground hover:text-success"
                >
                  <Check className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setUmbenennen(null)}
                  aria-label="Umbenennen abbrechen"
                  className="rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div
                key={c.id}
                className="group flex items-center gap-1 rounded px-1 py-1 hover:bg-accent"
              >
                <button
                  type="button"
                  onClick={() => waehlen(c.id)}
                  className="min-w-0 flex-1 truncate text-left text-xs text-foreground"
                >
                  {c.title || `Chat ${c.id}`}
                </button>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {relativeTime(c.updated_at)}
                </span>
                <button
                  type="button"
                  onClick={() => starteUmbenennen(c)}
                  aria-label="Chat umbenennen"
                  title="Umbenennen"
                  className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            )
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
