/**
 * Der Eingang fuer eine App OHNE Bau (Phase D7).
 *
 * Eine App auf diesem Geraet ist React-Code. Die kleinste Sorte App -- eine
 * Seite, die ihr eigenes Backend fragt -- soll dafuer aber keinen Bau
 * brauchen: kein `npm install` auf dem Orin, kein Buendler, keine
 * Abhaengigkeit im Wurzel-Lockfile. Sie laedt stattdessen `browser/marken.js`,
 * und darin liegen React, React-DOM und die sechs Bausteine zusammen.
 *
 * WARUM KEIN JSX DARIN. JSX braucht einen Uebersetzer, und im Browser
 * uebersetzt einer nur mit `eval`. Die Content-Security-Policy dieses Geraets
 * verbietet `unsafe-eval` (`config/traefik/dynamic/middlewares.yml`), und das
 * ist eine der Fragen, die die Oberflaechen-Abnahme jedes Mal stellt. Also
 * `h(Karte, {...})` statt `<Karte …/>` -- dieselbe Sache, eine Zeile
 * unbequemer. Wer eine App MIT Bau schreibt (die Vorlage des Kits, E5), nimmt
 * die Quelle ueber den Spiegel und schreibt JSX.
 */
import { createElement, Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';

export * from './index';

/** `React.createElement`, kurz -- der Ersatz fuer JSX. */
export const h = createElement;

export { Fragment, useEffect, useMemo, useRef, useState };

/** Eine App an einen Knoten haengen. Ein Aufruf, mehr braucht es nicht. */
export function rendern(baum: ReactNode, knoten: Element): void {
  createRoot(knoten).render(baum);
}
