/**
 * Composer des Agent-Chats: eine abgerundete Karte am Panel-Boden —
 * Kontext-Chips oben, auto-wachsende Textarea in der Mitte, darunter die
 * Toolbar (Anhang · Modell-Dropdown · Senden/Stopp). RAG und Thinking haben
 * bewusst KEINE Schalter mehr; die Orchestrierung läuft automatisch und wird
 * im Verlauf transparent gemacht (Schritte/Quellen).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { Skill } from '@/types/skills';
import SkillMenu, { buildMenuItems, type SkillMenuItem } from '@/features/skills/SkillMenu';

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
  /** Skills fürs Slash-Menü (Plan 011, Schritt 13). */
  skills?: Skill[];
  /** Stift-Symbol an einem Skill geklickt (Bearbeiten-Dialog folgt in Schritt 17). */
  onEditSkill?: (name: string) => void;
  /** `/skills` gewählt — Übersicht öffnen (Schritt 17). */
  onOpenSkillOverview?: () => void;
  /** `/neuer-skill` gewählt — Anlege-Dialog öffnen (Schritt 17). */
  onCreateSkill?: () => void;
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
  skills = [],
  onEditSkill,
  onOpenSkillOverview,
  onCreateSkill,
}: ComposerCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScope = useWorkspaceStore(s => s.chatScope);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const [menuDismissed, setMenuDismissed] = useState(false);
  // Welcher Eintrag ist per Pfeiltasten aktiv? Wird bei jedem neuen Filter (unten)
  // auf 0 zurückgesetzt, damit Enter immer den obersten Treffer nimmt.
  const [activeIndex, setActiveIndex] = useState(0);

  // Slash-Menü: sichtbar, solange der Text nur „/<teilname>" ist (kein Leerzeichen)
  // und nicht per Escape geschlossen wurde. Auswahl setzt bei einem Skill „/<name> "
  // und schließt; feste Befehle (/skills, /neuer-skill) lösen ihre Aktion aus.
  const slashMatch = value.match(/^\/([^\s/]*)$/);
  const menuQuery = slashMatch ? slashMatch[1] || '' : null;
  const menuItems = useMemo(
    () => (menuQuery !== null ? buildMenuItems(menuQuery, skills) : []),
    [menuQuery, skills]
  );
  // Kein Menü bei Anhang: ein Skill-Aufruf nimmt keine Uploads (wie @).
  const showMenu =
    menuQuery !== null &&
    !menuDismissed &&
    menuItems.length > 0 &&
    !attachedFile &&
    attachedImages.length === 0;

  // Bei jedem neuen Filtertext die Auswahl auf den obersten Treffer zurücksetzen.
  useEffect(() => {
    setActiveIndex(0);
  }, [menuQuery]);

  const pickItem = useCallback(
    (item: SkillMenuItem) => {
      // NICHT dismissen: Die Auswahl ändert den Feldwert selbst so, dass das Menü
      // zu ist (Skill → „…name " mit Leerzeichen, Befehl → leer). Ein
      // dismissed=true bliebe hier hängen, weil der programmatische onChange nicht
      // durch den Textarea-onChange läuft, der die Sperre wieder löst — ein
      // späteres „/" öffnete das Menü dann nie wieder. Deshalb aktiv freigeben.
      setMenuDismissed(false);
      if (item.kind === 'skill') {
        // Der Skill wandert als Befehl ins Feld; die grauen Argument-Hinweise
        // folgen in Schritt 14, danach tippt der Nutzer die Argumente und sendet.
        onChange(`/${item.name} `);
        textareaRef.current?.focus();
        return;
      }
      // Feste Befehle: das Slash-Fragment aus dem Feld nehmen und die Aktion
      // auslösen (Übersicht bzw. Anlege-Dialog kommen in Schritt 17).
      onChange('');
      if (item.name === 'skills') onOpenSkillOverview?.();
      else onCreateSkill?.();
    },
    [onChange, onOpenSkillOverview, onCreateSkill]
  );

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (showMenu) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActiveIndex(i => (i + 1) % menuItems.length);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActiveIndex(i => (i - 1 + menuItems.length) % menuItems.length);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMenuDismissed(true);
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          // Bei offenem Menü übernimmt Enter den aktiven Eintrag (statt „/rec"
          // wörtlich zu senden).
          const item = menuItems[activeIndex];
          if (item) pickItem(item);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend, showMenu, menuItems, activeIndex, pickItem]
  );

  const canSend =
    !disabled && !isLoading && (value.trim() || attachedFile || attachedImages.length > 0);
  const modelLabel = selectedModel
    ? models.find(m => m.id === selectedModel)?.name?.split(/[\s:]/)[0] ||
      selectedModel.split(':')[0]
    : 'Auto';

  const hasChips = Boolean(chatScope) || Boolean(attachedFile) || attachedImages.length > 0;

  return (
    <div className="relative rounded-lg border border-border bg-card focus-within:border-primary/40">
      {/* Slash-Menü der Skills (Plan 011, Schritt 13) */}
      {showMenu && (
        <SkillMenu
          items={menuItems}
          activeIndex={activeIndex}
          onPick={pickItem}
          onEdit={name => {
            setMenuDismissed(true);
            onEditSkill?.(name);
          }}
          onHover={setActiveIndex}
        />
      )}
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
          const v = e.target.value;
          // Verlässt der Text den „/<teilname>"-Modus, die Escape-Sperre lösen,
          // damit ein späteres „/" das Menü wieder öffnet.
          if (!/^\/[^\s/]*$/.test(v)) setMenuDismissed(false);
          onChange(v);
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
