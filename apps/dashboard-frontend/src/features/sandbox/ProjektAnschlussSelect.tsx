/**
 * ProjektAnschlussSelect — Auswahl „Projektablage anschließen" für Sandboxes.
 *
 * Wählt eines der Wissensraum-Projekte (GET /projects); dessen Ablage-Ordner
 * wird beim Container-Start rw als /workspace/projekt gemountet. „Kein
 * Projekt" trennt den Anschluss.
 */
import { useQuery } from '@tanstack/react-query';
import { FolderGit2 } from 'lucide-react';
import { Label } from '@/components/ui/shadcn/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { useApi } from '@/hooks/useApi';

interface ProjektRow {
  id: string;
  name: string;
}

const KEIN_PROJEKT = '__keins__';

export function ProjektAnschlussSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (projektId: string | null) => void;
}) {
  const api = useApi();
  const { data } = useQuery({
    queryKey: ['projects'],
    queryFn: () => api.get<{ data: ProjektRow[] }>('/projects', { showError: false }),
    staleTime: 30_000,
  });
  const projekte = data?.data ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="flex items-center gap-1.5">
        <FolderGit2 className="size-3.5 text-muted-foreground" />
        Projektablage anschließen{' '}
        <span className="font-normal text-muted-foreground text-xs">optional</span>
      </Label>
      <Select
        value={value ?? KEIN_PROJEKT}
        onValueChange={v => onChange(v === KEIN_PROJEKT ? null : v)}
      >
        <SelectTrigger data-testid="sandbox-projekt-select" className="w-full">
          <SelectValue placeholder="Kein Projekt" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEIN_PROJEKT}>Kein Projekt</SelectItem>
          {projekte.map(p => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-[11px] text-muted-foreground">
        Der Ordner des Projekts liegt dann unter <code>/workspace/projekt</code> — Dateien, die dort
        entstehen, erscheinen sofort im Explorer unter „Projektablage&ldquo;. Greift beim nächsten
        Container-Start.
      </p>
    </div>
  );
}
