/**
 * useSkillArgs Tests (Plan 011, Schritt 14).
 *
 * Prüft die zwei Stellen, an denen der Hook eigene Entscheidungen trifft:
 * (1) `begin` setzt Zustand UND Feldwert konsistent — der Wrapper verdrahtet
 *     `onChange` an ein echtes `useState`, bildet also die kontrollierte Schleife
 *     nach und belegt so die „race-free"-Zusage (der gesicherte Effekt darf den
 *     frisch gesetzten Zustand NICHT verwerfen).
 * (2) ein Skill OHNE Argumente betritt die Argument-Eingabe gar nicht erst.
 */
import { useState } from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import type { Skill } from '@/types/skills';
import { useSkillArgs } from './useSkillArgs';

const mitArg: Skill = {
  name: 'recherche',
  beschreibung: '',
  argumente: [{ name: 'thema', typ: 'freitext', beschreibung: '', pflicht: true }],
};
const ohneArg: Skill = { name: 'ping', beschreibung: '', argumente: [] };

/** Kontrollierte Schleife: onChange schreibt in denselben value, den der Hook liest. */
function useHarness() {
  const [value, setValue] = useState('/');
  const args = useSkillArgs(value, setValue);
  return { value, ...args };
}

describe('useSkillArgs', () => {
  test('begin setzt Zustand und Feldwert konsistent (kein Verwerfen durch den Effekt)', () => {
    const { result } = renderHook(useHarness);
    act(() => result.current.begin(mitArg));
    expect(result.current.value).toBe('/recherche ');
    expect(result.current.argState?.skill.name).toBe('recherche');
    expect(result.current.canAdvance).toBe(false); // nur ein Argument
  });

  test('ein Skill ohne Argumente betritt die Argument-Eingabe NICHT', () => {
    const { result } = renderHook(useHarness);
    act(() => result.current.begin(ohneArg));
    expect(result.current.value).toBe('/ping ');
    expect(result.current.argState).toBeNull(); // kein Arg-Modus
    expect(result.current.pickerArg).toBeUndefined();
  });
});
