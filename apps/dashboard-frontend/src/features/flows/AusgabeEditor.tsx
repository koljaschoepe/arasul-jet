/**
 * AusgabeEditor — die Sektion „Was kommt am Ende heraus?" des Flow-Editors
 * (Flows-Umbau 2026-08-02).
 *
 * Hier stellt der Nutzer in Alltagssprache ein, WAS der Flow produziert:
 * Format (nur Antwort / Markdown / PDF / Word), eine hochladbare Stilvorlage,
 * die Länge (Stufen + optionale Wortzahl), Sprache, Tonalität, eine optionale
 * Gliederung und das Dateiname-Muster. Das Backend setzt daraus die
 * Schreib-Anweisungen ans Modell um und erzeugt nach dem Lauf die Datei.
 */
import { useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, FileType, Loader2, MessageSquareText, Upload } from 'lucide-react';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useToast } from '@/contexts/ToastContext';
import type {
  FlowAusgabe,
  FlowAusgabeFormat,
  FlowLaengeStufe,
  FlowTonalitaet,
  FlowVorlage,
} from '@/types/flows';

const FORMATE: { wert: FlowAusgabeFormat; label: string; hinweis: string }[] = [
  { wert: 'keins', label: 'Nur Antwort', hinweis: 'Text im Chat, keine Datei' },
  { wert: 'pdf', label: 'PDF-Dokument', hinweis: 'fertiger Bericht zum Weitergeben' },
  { wert: 'docx', label: 'Word-Dokument', hinweis: 'zum Weiterbearbeiten' },
  { wert: 'markdown', label: 'Markdown-Datei', hinweis: 'für technische Weiterverwendung' },
];

const STUFEN: { wert: FlowLaengeStufe; label: string }[] = [
  { wert: 'kurz', label: 'Kurz (½–1 Seite)' },
  { wert: 'mittel', label: 'Mittel (2–4 Seiten)' },
  { wert: 'ausfuehrlich', label: 'Ausführlich (5+ Seiten)' },
];

const TONALITAETEN: { wert: FlowTonalitaet; label: string }[] = [
  { wert: 'formell', label: 'Formell' },
  { wert: 'neutral', label: 'Neutral' },
  { wert: 'locker', label: 'Locker' },
];

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-2 text-[13px] shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

export default function AusgabeEditor({
  value,
  onChange,
}: {
  value: FlowAusgabe;
  onChange: (next: FlowAusgabe) => void;
}) {
  const api = useApi();
  const toast = useToast();
  const qc = useQueryClient();
  const dateiRef = useRef<HTMLInputElement>(null);

  const istDokument = value.format !== 'keins';

  const { data: vorlagenRes } = useQuery({
    queryKey: ['flow-vorlagen'],
    queryFn: () => api.get<{ data: FlowVorlage[] }>('/flows/vorlagen', { showError: false }),
    enabled: istDokument,
    staleTime: 30_000,
  });
  const vorlagen = vorlagenRes?.data ?? [];

  const hochladen = useMutation({
    mutationFn: (datei: File) => {
      const form = new FormData();
      form.append('datei', datei);
      return api.post<{ data: { name: string } }>('/flows/vorlagen', form);
    },
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['flow-vorlagen'] });
      onChange({ ...value, vorlage: res.data.name });
      toast.success(`Vorlage „${res.data.name}" hochgeladen`);
    },
  });

  const patch = (teil: Partial<FlowAusgabe>) => onChange({ ...value, ...teil });

  return (
    <div className="flex flex-col gap-4" data-testid="ausgabe-editor">
      {/* Format */}
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {FORMATE.map(f => {
          const aktiv = value.format === f.wert;
          const Icon =
            f.wert === 'keins' ? MessageSquareText : f.wert === 'markdown' ? FileType : FileText;
          return (
            <button
              key={f.wert}
              type="button"
              onClick={() => patch({ format: f.wert })}
              aria-pressed={aktiv}
              data-testid={`ausgabe-format-${f.wert}`}
              className={cn(
                'flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors',
                aktiv ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-accent/50'
              )}
            >
              <span className="flex items-center gap-1.5 text-ui-xs font-medium text-foreground">
                <Icon className="size-3.5 text-muted-foreground" /> {f.label}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">{f.hinweis}</span>
            </button>
          );
        })}
      </div>

      {istDokument && (
        <>
          {/* Vorlage */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ausgabe-vorlage">Stilvorlage (optional)</Label>
            <div className="flex items-center gap-2">
              <select
                id="ausgabe-vorlage"
                value={value.vorlage ?? ''}
                onChange={e => patch({ vorlage: e.target.value || undefined })}
                className={selectClass}
                data-testid="ausgabe-vorlage"
              >
                <option value="">Keine Vorlage, neutrales Layout</option>
                {vorlagen.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
                {/* Eine im Flow gesetzte, aber inzwischen gelöschte Vorlage bleibt wählbar sichtbar. */}
                {value.vorlage && !vorlagen.some(v => v.name === value.vorlage) && (
                  <option value={value.vorlage}>{value.vorlage} (fehlt)</option>
                )}
              </select>
              <input
                ref={dateiRef}
                type="file"
                accept=".docx,.pdf,.md,.txt,.html"
                className="hidden"
                aria-label="Vorlage hochladen"
                onChange={e => {
                  const datei = e.target.files?.[0];
                  if (datei) hochladen.mutate(datei);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={hochladen.isPending}
                onClick={() => dateiRef.current?.click()}
              >
                {hochladen.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Hochladen
              </Button>
            </div>
            <p className="text-ui-xs text-muted-foreground">
              Eine eigene Datei (Word, PDF, Markdown, Text) als Vorbild: der Flow übernimmt Aufbau,
              Abschnitte und Tonfall, nicht den Inhalt.
            </p>
          </div>

          {/* Dateiname */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ausgabe-dateiname">Dateiname (optional)</Label>
            <Input
              id="ausgabe-dateiname"
              value={value.dateiname ?? ''}
              onChange={e => patch({ dateiname: e.target.value || undefined })}
              placeholder={'z. B. angebot-{{kunde}}-{{datum}}'}
              className="font-mono text-[13px]"
              data-testid="ausgabe-dateiname"
            />
            <p className="text-ui-xs text-muted-foreground">
              {
                'Platzhalter: {{argumentname}} und {{datum}}. Ohne Angabe: flowname-datum. Die Endung kommt vom Format.'
              }
            </p>
          </div>
        </>
      )}

      {/* Länge + Wortzahl */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ausgabe-laenge">Länge</Label>
          <select
            id="ausgabe-laenge"
            value={value.laenge?.stufe ?? ''}
            onChange={e => {
              const stufe = e.target.value as FlowLaengeStufe | '';
              patch({
                laenge: stufe ? { stufe, wortzahl: value.laenge?.wortzahl } : undefined,
              });
            }}
            className={selectClass}
            data-testid="ausgabe-laenge"
          >
            <option value="">Ohne Vorgabe</option>
            {STUFEN.map(s => (
              <option key={s.wert} value={s.wert}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ausgabe-wortzahl">Genaue Wortzahl (optional)</Label>
          <Input
            id="ausgabe-wortzahl"
            type="number"
            min={50}
            value={value.laenge?.wortzahl ?? ''}
            onChange={e => {
              const n = Number(e.target.value);
              patch({
                laenge:
                  n > 0
                    ? { stufe: value.laenge?.stufe ?? 'mittel', wortzahl: n }
                    : value.laenge?.stufe
                      ? { stufe: value.laenge.stufe }
                      : undefined,
              });
            }}
            placeholder="überstimmt die Stufe"
            className="text-[13px]"
            data-testid="ausgabe-wortzahl"
          />
        </div>
      </div>

      {/* Sprache + Tonalität */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ausgabe-sprache">Sprache</Label>
          <Input
            id="ausgabe-sprache"
            value={value.sprache ?? ''}
            onChange={e => patch({ sprache: e.target.value || undefined })}
            placeholder="wie die Eingabe (z. B. Deutsch)"
            list="ausgabe-sprachen"
            className="text-[13px]"
            data-testid="ausgabe-sprache"
          />
          <datalist id="ausgabe-sprachen">
            <option value="Deutsch" />
            <option value="Englisch" />
          </datalist>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ausgabe-ton">Tonalität</Label>
          <select
            id="ausgabe-ton"
            value={value.tonalitaet ?? ''}
            onChange={e =>
              patch({ tonalitaet: (e.target.value || undefined) as FlowTonalitaet | undefined })
            }
            className={selectClass}
            data-testid="ausgabe-ton"
          >
            <option value="">Ohne Vorgabe</option>
            {TONALITAETEN.map(t => (
              <option key={t.wert} value={t.wert}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Gliederung */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ausgabe-gliederung">Gliederung (optional, ein Abschnitt je Zeile)</Label>
        <Textarea
          id="ausgabe-gliederung"
          value={(value.gliederung ?? []).join('\n')}
          onChange={e => {
            const zeilen = e.target.value.split('\n');
            patch({ gliederung: zeilen.length === 1 && !zeilen[0] ? undefined : zeilen });
          }}
          placeholder={'Zusammenfassung\nAusgangslage\nErgebnisse\nNächste Schritte'}
          rows={3}
          className="resize-y text-[13px]"
          data-testid="ausgabe-gliederung"
        />
        <p className="text-ui-xs text-muted-foreground">
          Das Dokument hält sich an diese Abschnitte, in dieser Reihenfolge.
        </p>
      </div>
    </div>
  );
}
