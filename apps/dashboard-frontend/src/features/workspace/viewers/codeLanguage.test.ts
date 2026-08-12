/**
 * Tests der Sprach-Zuordnung des Code-Editors (Plan 013, B10): Label + Erweiterung
 * je Endung; unbekannte, aber textbasierte Endungen bleiben ohne Highlighting.
 */
import { describe, it, expect } from 'vitest';
import { CODE_EXTENSIONS, spracheLabel, spracheFuer } from './codeLanguage';

describe('CODE_EXTENSIONS', () => {
  it('enthält die gängigen Quelltext-Endungen', () => {
    for (const e of ['.py', '.js', '.ts', '.tsx', '.json', '.css', '.sh', '.sql']) {
      expect(CODE_EXTENSIONS.has(e)).toBe(true);
    }
  });

  it('enthält keine gerenderten/binären Typen', () => {
    for (const e of ['.md', '.html', '.pdf', '.png']) {
      expect(CODE_EXTENSIONS.has(e)).toBe(false);
    }
  });
});

describe('spracheLabel', () => {
  it('bildet Endungen auf lesbare Labels ab', () => {
    expect(spracheLabel('.py')).toBe('Python');
    expect(spracheLabel('.tsx')).toBe('TypeScript');
    expect(spracheLabel('.js')).toBe('JavaScript');
    expect(spracheLabel('.CSS')).toBe('CSS');
    expect(spracheLabel('.sql')).toBe('SQL');
  });

  it('fällt für Unbekanntes auf die Großschreibung der Endung zurück', () => {
    expect(spracheLabel('.rs')).toBe('RS');
  });
});

describe('spracheFuer', () => {
  it('liefert eine Sprach-Erweiterung für bekannte Endungen', () => {
    expect(spracheFuer('.py').length).toBeGreaterThan(0);
    expect(spracheFuer('.ts').length).toBeGreaterThan(0);
    expect(spracheFuer('.json').length).toBeGreaterThan(0);
    // UX-Sweep 2026-08-12: YAML/Shell/Env via lang-yaml bzw. legacy-modes.
    expect(spracheFuer('.yaml').length).toBeGreaterThan(0);
    expect(spracheFuer('.sh').length).toBeGreaterThan(0);
    expect(spracheFuer('.env').length).toBeGreaterThan(0);
  });

  it('liefert leeres Array für unbekannte (aber textbasierte) Endungen', () => {
    expect(spracheFuer('.rs')).toEqual([]);
  });
});
