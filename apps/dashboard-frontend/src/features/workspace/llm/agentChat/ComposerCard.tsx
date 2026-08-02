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
  FilePlus2,
  FolderOpen,
  FolderOutput,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Pin,
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
import type { Pin as PinItem } from '../../useWorkspaceContext';
import type { Flow } from '@/types/flows';
import FlowMenu, { buildMenuItems, type FlowMenuItem } from '@/features/flows/FlowMenu';
import ArgumentHints, { COMPOSER_TEXT_CLASSES } from '@/features/flows/ArgumentHints';
import ArgumentPicker from '@/features/flows/ArgumentPicker';
import { useFlowArgs } from '@/features/flows/useFlowArgs';

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
  /** Stop wurde geklickt, der Lauf beendet sich gerade (sichtbares Feedback). */
  stopping?: boolean;
  disabled?: boolean;
  attachedFile: File | null;
  onRemoveFile: () => void;
  attachedImages: { file: File; base64: string }[];
  onRemoveImage: (index: number) => void;
  onPickFile: (file: File) => void;
  /** Datei-Modus: die nächste Antwort wird automatisch als Datei gespeichert. */
  dateiModus?: boolean;
  onToggleDateiModus?: () => void;
  /** Ziel-Ordner fürs Speichern (per Drag & Drop aus dem Ablage-Baum). */
  dateiZiel?: { projectId: string; pfad: string; label: string } | null;
  onClearDateiZiel?: () => void;
  models: ComposerModel[];
  selectedModel: string;
  onSelectModel: (id: string) => void;
  /** Flows fürs Slash-Menü (Plan 011, Schritt 13). */
  flows?: Flow[];
  /** Stift-Symbol an einem Flow geklickt (Bearbeiten-Dialog folgt in Schritt 17). */
  onEditFlow?: (name: string) => void;
  /** Angeheftete Dokumente/Ordner (Plan 012) — als Chips über dem Eingabefeld. */
  pins?: PinItem[];
  /** Anheftung lösen (Plan 012). */
  onRemovePin?: (id: number) => void;
  /** `/flows` gewählt — Übersicht öffnen (Schritt 17). */
  onOpenFlowOverview?: () => void;
  /** `/neuer-flow` gewählt — Anlege-Dialog öffnen (Schritt 17). */
  onCreateFlow?: () => void;
  /**
   * Ein Flow-Befehl wurde abgeschickt (Plan 011, Schritt 15). Statt einer
   * Chat-Nachricht startet der Aufrufer einen Lauf und zeigt die Lauf-Karte.
   * Die Argumente kommen aus der Eingabehilfe (`collect()`), sonst leer.
   */
  onRunFlow?: (flowName: string, args: Record<string, string>) => void;
}

export default function ComposerCard({
  value,
  onChange,
  onSend,
  onCancel,
  isLoading,
  stopping = false,
  disabled,
  attachedFile,
  onRemoveFile,
  attachedImages,
  onRemoveImage,
  onPickFile,
  dateiModus = false,
  onToggleDateiModus,
  dateiZiel = null,
  onClearDateiZiel,
  models,
  selectedModel,
  onSelectModel,
  pins = [],
  onRemovePin,
  flows = [],
  onEditFlow,
  onOpenFlowOverview,
  onCreateFlow,
  onRunFlow,
}: ComposerCardProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScope = useWorkspaceStore(s => s.chatScope);
  const setChatScope = useWorkspaceStore(s => s.setChatScope);
  const [menuDismissed, setMenuDismissed] = useState(false);
  // Welcher Eintrag ist per Pfeiltasten aktiv? Wird bei jedem neuen Filter (unten)
  // auf 0 zurückgesetzt, damit Enter immer den obersten Treffer nimmt.
  const [activeIndex, setActiveIndex] = useState(0);

  // Argument-Eingabe (Schritt 14): grauer Hinweis + Tab-Sprung + Picker. Der Hook
  // hält den Zustand und synchronisiert das Feld über onChange.
  const args = useFlowArgs(value, onChange);
  // Overlay/Picker nur zeigen, wenn der Feldwert wirklich noch zum Flow-Befehl
  // gehört — doppelter Boden gegen einen kurz veralteten Zustand.
  const inArgs = args.argState != null && value.startsWith(`/${args.argState.flow.name}`);

  // Slash-Menü: sichtbar, solange der Text nur „/<teilname>" ist (kein Leerzeichen)
  // und nicht per Escape geschlossen wurde. Auswahl setzt bei einem Flow „/<name> "
  // und schließt; feste Befehle (/flows, /neuer-flow) lösen ihre Aktion aus.
  const slashMatch = value.match(/^\/([^\s/]*)$/);
  const menuQuery = slashMatch ? slashMatch[1] || '' : null;
  const menuItems = useMemo(
    () => (menuQuery !== null ? buildMenuItems(menuQuery, flows) : []),
    [menuQuery, flows]
  );
  // Kein Menü bei Anhang: ein Flow-Aufruf nimmt keine Uploads (wie @).
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
    (item: FlowMenuItem) => {
      // NICHT dismissen: Die Auswahl ändert den Feldwert selbst so, dass das Menü
      // zu ist (Flow → „…name " mit Leerzeichen, Befehl → leer). Ein
      // dismissed=true bliebe hier hängen, weil der programmatische onChange nicht
      // durch den Textarea-onChange läuft, der die Sperre wieder löst — ein
      // späteres „/" öffnete das Menü dann nie wieder. Deshalb aktiv freigeben.
      setMenuDismissed(false);
      if (item.kind === 'flow') {
        // Die Argument-Eingabe übernimmt: sie setzt „/<name> " ins Feld und zeigt
        // die grauen Argument-Hinweise; ist das erste Argument eine Auswahl,
        // öffnet sie gleich den Picker.
        args.begin(item.flow);
        textareaRef.current?.focus();
        return;
      }
      // Feste Befehle: das Slash-Fragment aus dem Feld nehmen und die Aktion
      // auslösen (Übersicht bzw. Anlege-Dialog kommen in Schritt 17).
      onChange('');
      if (item.name === 'flows') onOpenFlowOverview?.();
      else onCreateFlow?.();
    },
    [onChange, onOpenFlowOverview, onCreateFlow, args.begin]
  );

  // Abschicken: Beginnt der Text mit einem bekannten Flow-Befehl, wird ein
  // LAUF gestartet (Schritt 15) statt einer Chat-Nachricht — mit den Argumenten
  // aus der Eingabehilfe. Ein Anhang schlägt das aus (ein Flow nimmt keine
  // Uploads). Sonst normal senden.
  const submit = useCallback(() => {
    const m = value.match(/^\/([^\s/]+)/);
    const flow = m ? flows.find(s => s.name === m[1]) : undefined;
    if (flow && m && onRunFlow && !attachedFile && attachedImages.length === 0) {
      if (inArgs && args.argState?.flow.name === flow.name) {
        onRunFlow(flow.name, args.collect());
        return;
      }
      // Ohne aktive Eingabehilfe (von Hand getippt, eingefügt, nach Bearbeitung):
      // den Text hinter dem Befehl nicht verwerfen, sondern dem ersten
      // Freitext-Argument zuordnen — bevorzugt einem Pflicht-Argument. So
      // funktioniert „/wissen Was ist …?" auch ohne den Weg übers Slash-Menü.
      const rest = value.slice(m[0].length).trim();
      const freitext =
        flow.argumente.find(a => a.typ === 'freitext' && a.pflicht) ??
        flow.argumente.find(a => a.typ === 'freitext');
      const collected: Record<string, string> = {};
      if (rest && freitext) collected[freitext.name] = rest;
      onRunFlow(flow.name, collected);
      return;
    }
    onSend();
  }, [value, flows, onRunFlow, onSend, inArgs, args, attachedFile, attachedImages]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  // Höhe folgt IMMER dem Wert — auch wenn er programmatisch geleert wird
  // (Absenden setzt value=''; ohne diesen Effekt bliebe die Textarea auf der
  // Höhe der letzten langen Nachricht stehen — live beobachtet 2026-07-28).
  useEffect(() => {
    autoGrow();
  }, [value, autoGrow]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Argument-Eingabe (Schritt 14): Tab springt zum nächsten Argument — aber
      // NUR, wenn es eins gibt (`canAdvance`) und kein Picker offen ist (der hat
      // dann selbst den Fokus). Am letzten Argument bleibt Tab normal und führt
      // aus dem Feld heraus.
      if (inArgs && !args.pickerArg && args.canAdvance && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        args.advance();
        return;
      }
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
        if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
          e.preventDefault();
          // Bei offenem Menü übernehmen Enter UND Tab den aktiven Eintrag
          // (statt „/rec" wörtlich zu senden bzw. den Fokus aus dem Feld zu
          // werfen — Tab-Vervollständigung wie in jeder Kommandopalette).
          const item = menuItems[activeIndex];
          if (item) pickItem(item);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submit();
      }
    },
    [
      submit,
      showMenu,
      menuItems,
      activeIndex,
      pickItem,
      inArgs,
      args.pickerArg,
      args.canAdvance,
      args.advance,
    ]
  );

  const canSend =
    !disabled && !isLoading && (value.trim() || attachedFile || attachedImages.length > 0);
  const modelLabel = selectedModel
    ? models.find(m => m.id === selectedModel)?.name?.split(/[\s:]/)[0] ||
      selectedModel.split(':')[0]
    : 'Auto';

  const hasChips =
    Boolean(chatScope) ||
    Boolean(dateiZiel) ||
    pins.length > 0 ||
    Boolean(attachedFile) ||
    attachedImages.length > 0;

  return (
    <div className="relative rounded-lg border border-border bg-card focus-within:border-primary/40">
      {/* Slash-Menü der Flows (Plan 011, Schritt 13) */}
      {showMenu && (
        <FlowMenu
          items={menuItems}
          activeIndex={activeIndex}
          onPick={pickItem}
          onEdit={name => {
            setMenuDismissed(true);
            onEditFlow?.(name);
          }}
          onHover={setActiveIndex}
        />
      )}
      {/* Argument-Auswahl (Datei/Liste/Wissensbasis) — Plan 011, Schritt 14 */}
      {inArgs && args.pickerArg && (
        <ArgumentPicker
          arg={args.pickerArg}
          onPick={(v, label) => {
            args.fill(v, label);
            textareaRef.current?.focus();
          }}
          onClose={() => {
            args.closePicker();
            textareaRef.current?.focus();
          }}
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
          {/* Datei-Ziel: dorthin speichert der Datei-Modus die Antwort. */}
          {dateiZiel && (
            <AttachmentChip
              icon={<FolderOutput className="size-3.5 shrink-0 text-muted-foreground" />}
              label={`Speichern in: ${dateiZiel.label}`}
              onRemove={() => onClearDateiZiel?.()}
              removeLabel="Datei-Ziel entfernen"
            />
          )}
          {/* Angeheftete Dokumente/Ordner (Plan 012): immer im Kontext. */}
          {pins.map(pin => (
            <AttachmentChip
              key={pin.id}
              icon={<Pin className="size-3.5 shrink-0 text-muted-foreground" />}
              label={pin.label ?? (pin.kind === 'folder' ? 'Ordner' : 'Dokument')}
              onRemove={() => onRemovePin?.(pin.id)}
              removeLabel="Anheftung entfernen"
            />
          ))}
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

      <div className="relative">
        {/* Grauer Argument-Hinweis, deckungsgleich hinter dem Getippten (Schritt 14) */}
        {inArgs && <ArgumentHints value={value} ghost={args.ghost} />}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={e => {
            const v = e.target.value;
            // In der Argument-Eingabe übernimmt der Hook die Änderung (grauer
            // Hinweis, Picker-Schutz, Backspace-Rücksprung).
            if (args.reconcile(v)) {
              autoGrow();
              return;
            }
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
          // Typografie/Abstände aus der geteilten Konstante, damit der graue
          // Overlay-Hinweis exakt deckungsgleich sitzt.
          className={`relative max-h-40 w-full resize-none bg-transparent text-foreground placeholder:text-muted-foreground focus:outline-none ${COMPOSER_TEXT_CLASSES}`}
        />
      </div>

      <div className="flex items-center gap-1 px-1.5 pb-1.5">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          // Deckungsgleich mit der Backend-Whitelist (documentAnalysis.js) —
          // sonst wählt der Nutzer eine Datei, die der Upload dann ablehnt.
          accept=".pdf,.docx,.txt,.md,.markdown,.yaml,.yml,.csv,.json,.html,.htm,.xml,.log,.png,.jpg,.jpeg,.tiff,.tif,.bmp,.webp,.gif"
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

        {/* Datei-Modus: Antwort wird automatisch in der Projektablage gespeichert. */}
        <button
          type="button"
          onClick={() => onToggleDateiModus?.()}
          disabled={disabled}
          aria-label="Antwort als Datei speichern"
          aria-pressed={dateiModus}
          title={
            dateiModus
              ? 'Datei-Modus an — die Antwort wird als Datei gespeichert'
              : 'Antwort als Datei in der Projektablage speichern'
          }
          data-testid="composer-datei-modus"
          className={cn(
            'rounded p-1 hover:bg-accent hover:text-foreground',
            dateiModus ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
          )}
        >
          <FilePlus2 className="size-3.5" />
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
              disabled={stopping}
              aria-label={stopping ? 'Wird gestoppt' : 'Generierung stoppen'}
              title={stopping ? 'Wird gestoppt …' : 'Generierung stoppen'}
              className={cn(
                'rounded-md bg-accent p-1.5 text-foreground hover:bg-border',
                stopping && 'cursor-wait opacity-60'
              )}
            >
              {stopping ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
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
