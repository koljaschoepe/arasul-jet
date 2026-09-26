/**
 * Wächter über die Sprache der Oberfläche (J35, 26.09.2026).
 *
 * Liest jeden sichtbaren Text der Shell und der Bibliothek -- JSX-Text und
 * Zeichenketten, die ein Mensch zu sehen bekommt -- und meldet zwei Dinge:
 *
 *   1. ein Wort aus `statt` der Begriffsliste (`src/begriffe.ts`): an seiner
 *      Stelle steht das eine Wort der Liste;
 *   2. eine Umschreibung eines Umlauts (Laeufe, Geraet, pruefen): in einem
 *      sichtbaren Text steht ä, ö, ü.
 *
 * „Sichtbar" ist hier eine Näherung, und zwar eine vorsichtige: JSX-Text
 * immer; eine Zeichenkette nur, wenn sie ein Leerzeichen trägt oder an einer
 * Stelle steht, die ein Mensch liest (`titel`, `label`, `beschreibung` …).
 * Klassenketten (`className`, `cn()`, `cva()`), Importe, Testkennungen und
 * Kommentare zählen nicht. Tests und die Schauseite für Entwickler bleiben
 * draußen.
 */
import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BEGRIFFE } from '../begriffe';

const SRC = join(__dirname, '..');
const MARKEN = join(SRC, '..', '..', '..', 'packages', 'marken', 'src');

function dateien(wurzel: string): string[] {
  const aus: string[] = [];
  for (const name of readdirSync(wurzel)) {
    const pfad = join(wurzel, name);
    if (statSync(pfad).isDirectory()) {
      if (name === '__tests__' || name === 'entwickler' || name === 'node_modules') continue;
      aus.push(...dateien(pfad));
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
      if (pfad === join(SRC, 'begriffe.ts')) continue;
      aus.push(pfad);
    }
  }
  return aus;
}

/** Attribute und Schlüssel, deren Wert ein Mensch liest. */
const SICHTBAR = new Set([
  'titel',
  'title',
  'label',
  'beschriftung',
  'beschreibung',
  'description',
  'desc',
  'unterzeile',
  'hinweis',
  'erklaerung',
  'placeholder',
  'aria-label',
  'meldung',
  'fussnote',
  'text',
  'satz',
  'confirmText',
  'cancelText',
  'message',
]);

/** Attribute, deren Wert nie ein Mensch liest. */
const TECHNISCH = new Set([
  'className',
  'data-testid',
  'kennzeichen',
  'key',
  'id',
  'href',
  'to',
  'type',
  'variant',
  'size',
  'htmlFor',
  'value',
  'name',
  'role',
  'src',
  'side',
  'align',
  'queryKey',
]);

const KLASSEN_AUFRUFE = new Set(['cn', 'cva', 'clsx', 'twMerge']);

interface Fund {
  datei: string;
  zeile: number;
  text: string;
}

function sichtbareTexte(pfad: string): Fund[] {
  const quelle = ts.createSourceFile(
    pfad,
    readFileSync(pfad, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    pfad.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const funde: Fund[] = [];
  const zeile = (n: ts.Node) => quelle.getLineAndCharacterOfPosition(n.getStart()).line + 1;

  /** Wo steht diese Zeichenkette? `null` heißt: technisch, nicht prüfen. */
  function ort(n: ts.Node): 'sichtbar' | 'vielleicht' | null {
    let p: ts.Node | undefined = n.parent;
    while (p) {
      if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) return null;
      if (ts.isJsxAttribute(p)) {
        const name = p.name.getText(quelle);
        if (TECHNISCH.has(name)) return null;
        return SICHTBAR.has(name) ? 'sichtbar' : 'vielleicht';
      }
      if (ts.isPropertyAssignment(p)) {
        const name = p.name.getText(quelle).replace(/['"]/g, '');
        if (TECHNISCH.has(name)) return null;
        if (SICHTBAR.has(name)) return 'sichtbar';
      }
      if (ts.isCallExpression(p)) {
        const wer = p.expression.getText(quelle);
        if (KLASSEN_AUFRUFE.has(wer)) return null;
        if (
          /^(console|logger)\.|querySelector|addEventListener|getItem|setItem|matchMedia/.test(wer)
        )
          return null;
      }
      if (ts.isElementAccessExpression(p) || ts.isTypeNode(p)) return null;
      if (
        ts.isBinaryExpression(p) &&
        [
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ts.SyntaxKind.EqualsEqualsToken,
        ].includes(p.operatorToken.kind)
      )
        return null;
      if (ts.isCaseClause(p) && p.expression === n) return null;
      p = p.parent;
    }
    return 'vielleicht';
  }

  function besuche(n: ts.Node) {
    if (ts.isJsxText(n)) {
      const text = n.getText(quelle).replace(/\s+/g, ' ').trim();
      if (text) funde.push({ datei: pfad, zeile: zeile(n), text });
    } else if (
      ts.isStringLiteral(n) ||
      ts.isNoSubstitutionTemplateLiteral(n) ||
      ts.isTemplateHead(n) ||
      ts.isTemplateMiddle(n) ||
      ts.isTemplateTail(n)
    ) {
      const text = n.text;
      const wo = ort(n);
      // Eine Zeichenkette ohne Leerzeichen ist fast immer ein Schlüssel,
      // ein Pfad oder ein Wert -- es sei denn, sie steht, wo man liest.
      if (wo === 'sichtbar' || (wo === 'vielleicht' && /\s/.test(text.trim()))) {
        // Tailwind-Ketten ausserhalb von `className`/`cn()` (etwa in einem
        // Objekt mit Varianten): nur Kleinbuchstaben, Ziffern und Zeichen.
        if (
          !/[A-ZÄÖÜ]/.test(text) &&
          /(^|\s)[a-z-]+:[a-z]|(^|\s)(flex|grid|text|bg|border|px|py|p|m|mt|gap|size|w|h|rounded)-/.test(
            text
          )
        )
          return;
        funde.push({ datei: pfad, zeile: zeile(n), text });
      }
    }
    ts.forEachChild(n, besuche);
  }
  besuche(quelle);
  return funde;
}

const ALLE = [...dateien(SRC), ...dateien(MARKEN)].flatMap(sichtbareTexte);

/**
 * Umschreibungen, die in einem deutschen Satz nur als ä/ö/ü vorkommen. Eine
 * Liste von Stämmen und keine Regel „ae, oe, ue": die fände „Quelle",
 * „neue" und „Steuer".
 */
const UMSCHRIEBEN =
  /(aender|aelter|uebersicht|ueber|fuer|zurueck|geraet|laeuf|laesst|laed|pruef|moeglich|schluessel|loesch|waehl|spaeter|naechst|muess|koenn|groess|haeuf|oeffn|faell|haelt|traeg|zaehl|erklaer|bestaetig|fuehr|wuerd|duerf|noetig|taetig|verfueg|rueck|stueck|gruen|schoen|moecht|gehoer|stoer|zustaend|erhoeh|hoech|naeh|uebrig|koerper|koennt|aehnlich|gewaehr|natuerlich|zuverlaess|faehig|staend|staerk)/i;

function kurz(f: Fund) {
  return `${relative(join(SRC, '..', '..', '..'), f.datei)}:${f.zeile}  ${f.text.slice(0, 90)}`;
}

describe('Die Sprache der Oberfläche', () => {
  it('findet überhaupt sichtbare Texte (sonst misst der Wächter nichts)', () => {
    expect(ALLE.length).toBeGreaterThan(500);
  });

  it.each(BEGRIFFE.map(b => [b.wort, b] as const))(
    'sagt %s und nicht, was an seiner Stelle stand',
    (_wort, begriff) => {
      const muster = new RegExp(`(^|[^\\p{L}])(${begriff.statt.join('|')})(?![\\p{L}])`, 'u');
      const befunde = ALLE.filter(f => muster.test(f.text)).map(kurz);
      expect(befunde, `statt „${begriff.wort}“`).toEqual([]);
    }
  );

  it('schreibt ä, ö und ü aus, wo ein Mensch liest', () => {
    const befunde = ALLE.filter(f => UMSCHRIEBEN.test(f.text)).map(kurz);
    expect(befunde).toEqual([]);
  });
});
