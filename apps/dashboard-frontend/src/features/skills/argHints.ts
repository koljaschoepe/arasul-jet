/**
 * Reine Hilfen für die Argument-Eingabe im Chat (Plan 011, Schritt 14).
 *
 * Nach der Skill-Auswahl steht der Befehl schwarz im Feld, dahinter grau die
 * erwarteten Argumente. Diese Datei rechnet — ohne DOM, ohne Zustand — aus, wie
 * dieser graue Hinweis aussieht und ob der Feldwert überhaupt noch zu einem
 * Skill-Aufruf gehört. So liegt die knifflige Logik an einer direkt testbaren
 * Stelle; die Komponente zeichnet nur.
 */
import type { Skill, SkillArgument } from '@/types/skills';

/** Ein gefülltes Argument: `label` steht im Feld, `value` geht später an den Lauf. */
export interface ArgSlot {
  value: string;
  label: string;
}

/** Argument-Typen, die NICHT frei getippt werden — sie öffnen eine Auswahl. */
export const PICKER_TYPES = new Set(['datei', 'auswahl', 'wissensbasis']);

/** Öffnet dieses Argument eine Auswahl (Datei/Liste/Wissensbasis) statt Freitext? */
export function istPicker(arg: SkillArgument | undefined): boolean {
  return arg != null && PICKER_TYPES.has(arg.typ);
}

/** Der graue Platzhalter eines Arguments: `<name>` für Pflicht, `[name]` für optional. */
export function placeholderFor(arg: SkillArgument): string {
  return arg.pflicht ? `<${arg.name}>` : `[${arg.name}]`;
}

/**
 * Baut den Feldwert aus dem Skill-Namen und den bereits gefüllten Argument-Labels.
 * Immer mit genau EINEM Leerzeichen nach dem Befehl und zwischen den Labels; endet
 * das aktive (letzte) Argument leer, steht am Ende ein Leerzeichen — dort setzt der
 * graue Platzhalter an.
 */
export function buildFieldValue(skillName: string, slots: ArgSlot[], active: number): string {
  const labels = slots.slice(0, active).map(s => s.label);
  const activeLabel = slots[active]?.label ?? '';
  const prefix = `/${skillName} `;
  const committed = labels.join(' ');
  // Nach den festgelegten Labels ein Leerzeichen, dann das aktive Label (evtl. leer).
  return committed ? `${prefix}${committed} ${activeLabel}` : `${prefix}${activeLabel}`;
}

/** Der Präfix vor dem aktiven Argument — alles, was der Nutzer nicht mehr tippt. */
export function activePrefix(skillName: string, slots: ArgSlot[], active: number): string {
  const labels = slots.slice(0, active).map(s => s.label);
  const committed = labels.join(' ');
  return committed ? `/${skillName} ${committed} ` : `/${skillName} `;
}

/**
 * Der graue Hinweis-Text, der HINTER dem bereits Getippten erscheint:
 * der Platzhalter des aktiven (noch leeren) Arguments plus alle folgenden.
 *
 * @param value Der aktuelle Feldwert — entscheidet nur, ob ein führendes
 *   Leerzeichen vor den Hinweis gehört (steht am Feldende schon eins, nicht).
 */
export function ghostSuffix(skill: Skill, slots: ArgSlot[], active: number, value: string): string {
  const args = skill.argumente;
  const teile: string[] = [];
  const aktiv = args[active];
  // Aktives Argument nur dann als Platzhalter zeigen, wenn es noch leer ist.
  if (aktiv && (slots[active]?.label ?? '') === '') {
    teile.push(placeholderFor(aktiv));
  }
  for (let i = active + 1; i < args.length; i++) {
    teile.push(placeholderFor(args[i]!));
  }
  if (teile.length === 0) return '';
  const fuehrend = value.endsWith(' ') || value === '' ? '' : ' ';
  return fuehrend + teile.join(' ');
}

// --- Reine Zustandsübergänge der Argument-Eingabe ---------------------------
//
// Die gesamte knifflige Logik (Tippen ins aktive Argument, Tab weiter, Backspace
// zurück, Picker füllt) steckt hier als reine Funktionen auf `ArgState` — ohne
// React, ohne DOM. Der Hook (useSkillArgs) ruft sie nur auf und hält das
// Ergebnis. So lässt sich jeder Grenzfall direkt prüfen.

/** Der Zustand einer laufenden Argument-Eingabe. */
export interface ArgState {
  skill: Skill;
  /** Ein Eintrag je bereits berührtem Argument (Index = Argument-Position). */
  slots: ArgSlot[];
  /** Welches Argument tippt der Nutzer gerade? */
  active: number;
}

const LEER: ArgSlot = { value: '', label: '' };

/** Startet die Eingabe für einen frisch gewählten Skill (Argument 0 ist aktiv, leer). */
export function beginState(skill: Skill): ArgState {
  return { skill, slots: [{ ...LEER }], active: 0 };
}

/** Das gerade aktive Argument (oder undefined, wenn der Skill keine (mehr) hat). */
export function activeArgOf(state: ArgState): SkillArgument | undefined {
  return state.skill.argumente[state.active];
}

/**
 * Verarbeitet eine Textänderung im Feld. Gibt den neuen Zustand (oder null, wenn
 * die Eingabe verlassen wurde) und den zu setzenden Feldwert zurück.
 */
export function reconcileState(
  state: ArgState,
  newValue: string
): { state: ArgState | null; value: string } {
  const { skill, slots, active } = state;
  const aktiv = skill.argumente[active];
  const prefix = activePrefix(skill.name, slots, active);

  if (newValue.startsWith(prefix)) {
    // Tail-Bearbeitung: nur das aktive Argument ändert sich.
    const rest = newValue.slice(prefix.length);
    if (istPicker(aktiv)) {
      // In ein Auswahl-Argument wird nicht frei getippt — der Picker füllt es.
      // Getippten Text verwerfen und das Feld auf dem Präfix halten.
      return { state, value: buildFieldValue(skill.name, slots, active) };
    }
    const neue = slots.slice();
    neue[active] = { value: rest, label: rest };
    return { state: { skill, slots: neue, active }, value: newValue };
  }

  // Ab hier beginnt der Wert NICHT mit dem Präfix. Zwei Fälle sauber trennen —
  // sonst würde jede Bearbeitung eines bereits festgelegten Arguments (oder ein
  // Einfügen über die Grenze) fälschlich als Rücksprung gewertet und ginge
  // verloren:
  //   a) Der Wert ist ein ANFANG des Präfixes → der Nutzer hat vom Ende her ins
  //      Präfix zurückgelöscht (Backspace über die Grenze) → ein Argument zurück.
  //   b) Sonst wurde mitten im Festgelegten geändert → NICHT übernehmen, das Feld
  //      auf den erwarteten Wert zurücksetzen, Zustand unangetastet lassen.
  if (!prefix.startsWith(newValue)) {
    return { state, value: buildFieldValue(skill.name, slots, active) };
  }

  // Fall a) — Rücksprung. Bewusst „auf das volle Label zurückschnappen": Löscht
  // eine Auswahl-Löschung mehr als nur das Grenz-Leerzeichen weg, springt sie
  // trotzdem sauber ein Argument zurück und stellt dessen festgelegtes Label
  // vollständig wieder her, statt einen halben Rest zu behalten. Kein Datenverlust.
  if (active > 0) {
    const newActive = active - 1;
    const neue = slots.slice(0, active); // das aktuelle (leere) Slot fällt weg
    // Ein zurück-gepopptes Auswahl-Argument wird geleert, damit sein Picker
    // wieder aufgeht; ein Freitext behält seinen Text zum Weitertippen.
    if (istPicker(skill.argumente[newActive])) neue[newActive] = { ...LEER };
    return {
      state: { skill, slots: neue, active: newActive },
      value: buildFieldValue(skill.name, neue, newActive),
    };
  }

  // Unter Argument 0 zurückgelöscht → die Argument-Eingabe ganz verlassen.
  return { state: null, value: newValue };
}

/**
 * Springt zum nächsten Argument (Tab). `openPicker` sagt, ob das neue Argument
 * eine Auswahl öffnet.
 */
export function advanceState(state: ArgState): {
  state: ArgState;
  value: string;
  openPicker: boolean;
  /** Gab es überhaupt ein nächstes Argument? Wenn nicht, darf Tab normal (aus dem Feld) wirken. */
  advanced: boolean;
} {
  const { skill, slots, active } = state;
  const newActive = active + 1;
  if (newActive >= skill.argumente.length) {
    // Kein weiteres Argument — Feld unverändert lassen.
    return {
      state,
      value: buildFieldValue(skill.name, slots, active),
      openPicker: false,
      advanced: false,
    };
  }
  const neue = slots.slice();
  while (neue.length <= newActive) neue.push({ ...LEER });
  neue[newActive] = { ...LEER };
  return {
    state: { skill, slots: neue, active: newActive },
    value: buildFieldValue(skill.name, neue, newActive),
    openPicker: istPicker(skill.argumente[newActive]),
    advanced: true,
  };
}

/** Füllt das aktive Argument mit einem Picker-Ergebnis und springt weiter. */
export function fillState(
  state: ArgState,
  value: string,
  label: string
): { state: ArgState; value: string; openPicker: boolean } {
  const neue = state.slots.slice();
  while (neue.length <= state.active) neue.push({ ...LEER });
  neue[state.active] = { value, label };
  return advanceState({ ...state, slots: neue });
}

/** Sammelt die Argumentwerte als `{ name: wert }` für den späteren Lauf (Schritt 15). */
export function collectValues(state: ArgState): Record<string, string> {
  const out: Record<string, string> = {};
  state.skill.argumente.forEach((arg, i) => {
    const slot = state.slots[i];
    if (slot && slot.value !== '') out[arg.name] = slot.value;
  });
  return out;
}
