/**
 * Der Eingang der Bibliothek zur Laufzeit: alles, was `@marken` ausgibt,
 * als ES-Modul unter der festen Adresse des Geraets (`/marken/<haupt>/marken.js`).
 *
 * Anders als `src/browser.ts` (das Buendel, das eine App als Kopie neben sich
 * legt) traegt dieser Eingang ALLE drei Saetze: Bausteine, Primitive und
 * Muster. Das geht, weil das Geraet das Stylesheet dazu fertig uebersetzt
 * ausliefert (`marken.css` daneben, aus `laufzeit/marken.css`): die Klassen,
 * die die Primitive brauchen, sind darin schon erzeugt. Eine App braucht
 * dafuer weder Tailwind noch einen Bau.
 *
 * React liegt NICHT in dieser Datei, sondern in einem gemeinsamen Teil, den
 * auch `react.js`, `react-dom.js` und `jsx-runtime.js` daneben ausgeben. Eine
 * App mit eigenem Bau bindet React deshalb von hier und nicht aus ihrem
 * `node_modules`: zweimal React in einem Baum bricht jeden Hook.
 */
import { createElement, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';

export * from '../src/index';

/** `React.createElement`, kurz: der Ersatz fuer JSX in einer App ohne Bau. */
export const h = createElement;

export { Fragment, useCallback, useEffect, useMemo, useRef, useState };

/** Eine App an einen Knoten haengen. */
export function rendern(baum: ReactNode, knoten: Element): void {
  createRoot(knoten).render(baum);
}
