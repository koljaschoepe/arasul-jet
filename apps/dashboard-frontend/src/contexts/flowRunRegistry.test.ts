/**
 * Flow-Lauf-Registry (Plan 011, Schritt 15) — reine Merge-/Dublettenlogik.
 *
 * Regression (auf dem Jetson gefunden): Die BIGINT-Lauf-ID kommt vom Start-POST
 * als Zahl (10), von der Liste als String ("10"). Ohne Normalisierung zählte der
 * SELBE Lauf doppelt und erschien als zwei Karten mit zwei Abbrechen-Knöpfen.
 */
import { describe, expect, test } from 'vitest';
import { addFlowRun, mergeFlowRuns } from './flowRunRegistry';

describe('addFlowRun', () => {
  test('stellt die neueste ID vorn ein', () => {
    expect(addFlowRun([10], 11)).toEqual([11, 10]);
  });

  test('meldet dieselbe ID nicht doppelt, auch als String nicht (Zahl/String-Falle)', () => {
    expect(addFlowRun([10], 10)).toEqual([10]);
    expect(addFlowRun([10], '10')).toEqual([10]);
  });

  test('gibt bei bekannter ID dieselbe Referenz zurück (kein unnötiger Render)', () => {
    const vorhanden = [10];
    expect(addFlowRun(vorhanden, 10)).toBe(vorhanden);
  });

  test('verwirft eine unbrauchbare ID, statt NaN einzutragen', () => {
    const vorhanden = [10];
    expect(addFlowRun(vorhanden, 'abc')).toBe(vorhanden);
  });
});

describe('mergeFlowRuns', () => {
  test('als Zahl gemeldeter und als String gelisteter Lauf zählt nur einmal', () => {
    // Kern der Regression: register(10) → prev=[10]; Liste liefert "10".
    expect(mergeFlowRuns([10], ['10'])).toEqual([10]);
  });

  test('behält lokal bekannte, noch nicht gelistete Läufe vorn', () => {
    expect(mergeFlowRuns([12], [11, 10])).toEqual([12, 11, 10]);
  });

  test('normalisiert die Server-Liste zu Zahlen', () => {
    expect(mergeFlowRuns([], ['11', '10'])).toEqual([11, 10]);
  });

  test('leere Server-Liste behält die lokal bekannten', () => {
    expect(mergeFlowRuns([9], [])).toEqual([9]);
  });

  test('filtert unbrauchbare Server-IDs heraus', () => {
    expect(mergeFlowRuns([], ['10', 'kaputt', '11'])).toEqual([10, 11]);
  });
});
