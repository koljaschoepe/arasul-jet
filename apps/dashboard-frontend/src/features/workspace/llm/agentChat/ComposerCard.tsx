/**
 * Composer des Agent-Chats: eine abgerundete Karte am Panel-Boden —
 * Kontext-Chips oben, auto-wachsende Textarea in der Mitte, darunter die
 * Toolbar (Anhang · Modell-Dropdown · Senden/Stopp). RAG und Thinking haben
 * bewusst KEINE Schalter mehr; die Orchestrierung läuft automatisch und wird
 * im Verlauf transparent gemacht (Schritte/Quellen).
 */
import { useCallback, useRef } from 'react';
import {
  ArrowUp,
  ChevronDown,
  FolderOpen,
  Image as ImageIcon,
  Paperclip,
  Square,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export interface ComposerModel {
  id: string;
  name: string;
}

/**
 * Anhang-/Kontext-Chip über dem Eingabefeld: Icon + Name + Entfernen-X.
 * Deutlich sichtbar (Border + `bg-muted`), damit hineingezogene Dateien sofort
 * als „liegt an" erkennbar sind. Komfort-Dichte über `text-ui-xs`.
 */
function AttachmentChip({
  icon,
  label,
  onRemove,
  removeLabel,
}: {
  icon: React.ReactNode;
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-ui-xs text-foreground"
      data-testid="composer-chip"
    >
      {icon}
      <span className="truncate">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="ml-0.5 shrink-0 rounded-sm p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

interface ComposerCardProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onCancel: () => void;
  isLoading: boolean;
  disabled?: boolean;
  attachedFile: File | null;
  onRemoveFile: () => void;
  attachedImages: { file: File; base64: string }[];
  onRemoveImage: (index: number) => void;
  onPickFile: (file: File) => void;
  models: ComposerModel[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
}

export default function ComposerCard({
  value,
  onChange,
  onSend,
  onCancel,
  isLoading,
  disabled,
  attachedFile,
  onRemoveFile,
  attachedImages,
  onRemoveImage,
  onPickFile,
  models,
  selectedModel,
  onSelectModel,
}: ComposerCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScope = useWorkspaceStore(s => s.chatScope);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend]
  );

  const canSend =
    !disabled && !isLoading && (value.trim() || attachedFile || attachedImages.length > 0);
  const modelLabel = selectedModel
    ? models.find(m => m.id === selectedModel)?.name?.split(/[\s:]/)[0] ||
      selectedModel.split(':')[0]
    : 'Auto';

  const hasChips = Boolean(chatScope) || Boolean(attachedFile) || attachedImages.length > 0;

  return (
    <div className="rounded-lg border border-border bg-card focus-within:border-primary/40">
      {hasChips && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-2" data-testid="composer-chips">
          {chatScope && (
            <AttachmentChip
              icon={<FolderOpen className="size-3.5 shrink-0 text-muted-foreground" />}
              label={chatScope.label}
              onRemove={() => setChatScope(null)}
              removeLabel="Ordner-Kontext entfernen"
            />
          )}
          {attachedFile && (
            <AttachmentChip
              icon={<Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
              label={attachedFile.name}
              onRemove={onRemoveFile}
              removeLabel="Anhang entfernen"
            />
          )}
          {attachedImages.map((img, i) => (
            <AttachmentChip
              key={`${img.file.name}-${i}`}
              icon={<ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />}
              label={img.file.name}
              onRemove={() => onRemoveImage(i)}
              removeLabel="Bild entfernen"
            />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => {
          onChange(e.target.value);
          autoGrow();
        }}
        onKeyDown={handleKeyDown}
        rows={1}
        placeholder="Nachricht schreiben …"
        disabled={disabled}
        aria-label="Nachricht an die KI"
        className="max-h-40 w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
      />

      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Datei anhängen"
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Paperclip className="size-3.5" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Modell wählen"
              className="flex items-center gap-0.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {modelLabel}
              <ChevronDown className="size-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
            <DropdownMenuItem onClick={() => onSelectModel('')}>
              <span className={cn(!selectedModel && 'font-semibold')}>Auto (Standard)</span>
            </DropdownMenuItem>
            {models.map(m => (
              <DropdownMenuItem key={m.id} onClick={() => onSelectModel(m.id)}>
                <span className={cn(selectedModel === m.id && 'font-semibold')}>{m.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ml-auto">
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              aria-label="Generierung stoppen"
              className="rounded-md bg-accent p-1.5 text-foreground hover:bg-border"
            >
              <Square className="size-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              aria-label="Senden"
              className={cn(
                'rounded-md p-1.5 transition-colors',
                canSend
                  ? 'bg-primary text-primary-foreground hover:opacity-90'
                  : 'bg-accent text-muted-foreground'
              )}
            >
              <ArrowUp className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
