/**
 * Roundtrip-Tests für die Frontmatter-Trennung (Plan 016, Schritt 4).
 * Kern-Sicherheit: split → join muss die Originaldatei exakt reproduzieren,
 * sonst korrumpiert der WYSIWYG-Editor agent-geschriebene Dateien.
 */
import { describe, it, expect } from 'vitest';
import {
  splitFrontmatter,
  joinFrontmatter,
} from '../../components/editor/tiptap/markdownFrontmatter';

describe('splitFrontmatter', () => {
  it('trennt einen Frontmatter-Block sauber ab', () => {
    const md = '---\ntitel: Test\ntags: [a, b]\n---\n\n# Überschrift\n\nText.';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('---\ntitel: Test\ntags: [a, b]\n---\n');
    expect(body).toBe('\n# Überschrift\n\nText.');
  });

  it('lässt Dateien ohne Frontmatter unangetastet', () => {
    const md = '# Nur Text\n\nKein Frontmatter hier.\n\n---\n\nEine Trennlinie unten.';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('');
    expect(body).toBe(md);
  });

  it('greift NICHT, wenn --- nicht am Dateianfang steht', () => {
    const md = 'Vorwort\n---\nkey: val\n---\nrest';
    expect(splitFrontmatter(md).frontmatter).toBe('');
  });

  it('akzeptiert ... als Abschluss', () => {
    const md = '---\nkey: val\n...\nBody';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('---\nkey: val\n...\n');
    expect(body).toBe('Body');
  });

  it('ist non-greedy: der erste schließende ----Block gewinnt', () => {
    const md = '---\na: 1\n---\nText\n\n---\n\nMehr';
    const { frontmatter, body } = splitFrontmatter(md);
    expect(frontmatter).toBe('---\na: 1\n---\n');
    expect(body).toBe('Text\n\n---\n\nMehr');
  });

  it('roundtrip split→join reproduziert das Original exakt', () => {
    const samples = [
      '---\ntitel: X\n---\n\nInhalt mit ```code```.',
      '# Ohne Frontmatter\n\n```js\nconst a = 1;\n```\n',
      '---\nnur: eins\n---\n',
      'plain',
    ];
    for (const md of samples) {
      const { frontmatter, body } = splitFrontmatter(md);
      expect(joinFrontmatter(frontmatter, body)).toBe(md);
    }
  });
});
