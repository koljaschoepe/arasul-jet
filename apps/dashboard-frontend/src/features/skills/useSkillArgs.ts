/**
 * useSkillArgs — der Zustand der Argument-Eingabe im Composer (Plan 011, Schritt 14).
 *
 * Dünn: Die Logik liegt als reine Übergänge in `argHints.ts`; dieser Hook hält
 * nur den aktuellen Zustand, hält das Eingabefeld (über `onChange`) synchron und
 * merkt sich, für welches Argument gerade eine Auswahl offen ist.
 *
 * Verlassen wird die Eingabe an zwei Stellen: beim Zurücklöschen unter das erste
 * Argument (reconcile) und wenn der Feldwert von AUSSEN zurückgesetzt wird —
 * etwa nachdem der Composer nach dem Senden geleert wurde. Letzteres fängt ein
 * bewusst GESICHERTER Effekt: Er greift nur, wenn der Wert nicht mehr mit dem
 * Skill-Befehl beginnt. Eine Race beim Start (`begin`) gibt es nicht, weil jede
 * Zustandsänderung im selben Ereignis-Handler mit ihrem `onChange` gebündelt
 * wird (React-Batching) — es gibt keinen Zwischen-Render mit alt-neu gemischt.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Skill, SkillArgument } from '@/types/skills';
import {
  advanceState,
  beginState,
  buildFieldValue,
  collectValues,
  fillState,
  ghostSuffix,
  istPicker,
  reconcileState,
  type ArgState,
} from './argHints';

export function useSkillArgs(value: string, onChange: (v: string) => void) {
  const [state, setState] = useState<ArgState | null>(null);
  // Für welches Argument (Index) ist die Auswahl offen? null = keine.
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const begin = useCallback(
    (skill: Skill) => {
      // Skills OHNE Argument betreten die Argument-Eingabe gar nicht erst — sonst
      // bliebe der Arg-Modus für die ganze Nachricht aktiv und finge jedes Tab ab
      // (advance wäre ein Dauer-Nichts). Nur den Befehl ins Feld setzen.
      if (skill.argumente.length === 0) {
        setState(null);
        setPickerFor(null);
        onChange(`/${skill.name} `);
        return;
      }
      const st = beginState(skill);
      setState(st);
      onChange(buildFieldValue(skill.name, st.slots, 0));
      setPickerFor(istPicker(skill.argumente[0]) ? 0 : null);
    },
    [onChange]
  );

  /** Eine Feldänderung verarbeiten. Gibt true zurück, wenn die Eingabe sie behandelt hat. */
  const reconcile = useCallback(
    (newValue: string): boolean => {
      if (!state) return false;
      const r = reconcileState(state, newValue);
      setState(r.state);
      onChange(r.value);
      if (!r.state) setPickerFor(null);
      else if (pickerFor !== r.state.active) {
        // Nach einem Backspace-Rücksprung ggf. den Picker des neuen aktiven
        // Auswahl-Arguments öffnen bzw. einen alten schließen.
        setPickerFor(istPicker(r.state.skill.argumente[r.state.active]) ? r.state.active : null);
      }
      return true;
    },
    [state, onChange, pickerFor]
  );

  /**
   * Tab: zum nächsten Argument springen. Gibt zurück, ob es tatsächlich ein
   * nächstes Argument gab — bei `false` soll der Aufrufer Tab normal (aus dem
   * Feld heraus) wirken lassen, statt es abzufangen.
   */
  const advance = useCallback((): boolean => {
    if (!state) return false;
    const r = advanceState(state);
    if (!r.advanced) return false;
    setState(r.state);
    onChange(r.value);
    setPickerFor(r.openPicker ? r.state.active : null);
    return true;
  }, [state, onChange]);

  /** Ein Picker-Ergebnis übernehmen (Wert für den Lauf, Label fürs Feld). */
  const fill = useCallback(
    (argValue: string, label: string) => {
      if (!state) return;
      const r = fillState(state, argValue, label);
      setState(r.state);
      onChange(r.value);
      setPickerFor(r.openPicker ? r.state.active : null);
    },
    [state, onChange]
  );

  const closePicker = useCallback(() => setPickerFor(null), []);

  // Wird das Feld von außen geleert/geändert (Senden, neuer Chat), passt der Wert
  // nicht mehr zum laufenden Skill-Befehl → Eingabe verlassen. In gültiger
  // Argument-Eingabe beginnt der Wert IMMER mit „/<skill> " (buildFieldValue),
  // der Effekt greift dort also nie.
  useEffect(() => {
    if (state && !value.startsWith(`/${state.skill.name}`)) {
      setState(null);
      setPickerFor(null);
    }
  }, [value, state]);

  const ghost = state ? ghostSuffix(state.skill, state.slots, state.active, value) : '';
  const activeArg: SkillArgument | undefined = state
    ? state.skill.argumente[state.active]
    : undefined;
  const pickerArg: SkillArgument | undefined =
    pickerFor != null && state ? state.skill.argumente[pickerFor] : undefined;
  // Gibt es noch ein weiteres Argument, zu dem Tab springen kann?
  const canAdvance = state != null && state.active < state.skill.argumente.length - 1;

  return {
    argState: state,
    ghost,
    activeArg,
    pickerArg,
    canAdvance,
    begin,
    reconcile,
    advance,
    fill,
    closePicker,
    collect: () => (state ? collectValues(state) : {}),
  };
}
