import { describe, it, expect } from 'vitest';
import { istChatModell, modellAnzeigeName } from './modelDisplay';

describe('istChatModell (Plan 022)', () => {
  it('lässt Chat-/Coding-/multimodale Modelle durch', () => {
    expect(istChatModell({ id: 'qwen3-coder:30b', name: 'Qwen3 Coder', model_type: 'llm' })).toBe(
      true
    );
    expect(istChatModell({ id: 'llava:13b', name: 'LLaVA', model_type: 'vision' })).toBe(true);
    // 'text' ist der Alt-Name für Sprachmodelle → bleibt sichtbar.
    expect(istChatModell({ id: 'mistral', name: 'Mistral', model_type: 'text' })).toBe(true);
  });

  it('blendet reine Embedding-/OCR-/Audio-Modelle aus', () => {
    expect(
      istChatModell({ id: 'nomic-embed-text', name: 'Nomic Embed Text', model_type: 'embedding' })
    ).toBe(false);
    expect(istChatModell({ id: 'tesseract', name: 'Tesseract', model_type: 'ocr' })).toBe(false);
  });

  it('erkennt falsch als llm getypte Embedder am Namen/an der Id', () => {
    expect(istChatModell({ id: 'bge-m3:latest', name: 'bge-m3', model_type: 'llm' })).toBe(false);
    expect(istChatModell({ id: 'all-minilm', name: 'all-minilm', model_type: 'llm' })).toBe(false);
  });
});

describe('modellAnzeigeName (Plan 022)', () => {
  it('bevorzugt den sauberen Katalog-Namen', () => {
    expect(
      modellAnzeigeName({ id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', name: 'Qwen 3.8 27B' })
    ).toBe('Qwen 3.8 27B');
  });

  it('humanisiert eine rohe hf.co-Id, wenn kein Name da ist', () => {
    expect(modellAnzeigeName({ id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS' })).toBe('Qwen 3.8 27B');
  });

  it('humanisiert, wenn der Name selbst eine rohe Id ist', () => {
    expect(
      modellAnzeigeName({
        id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
        name: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
      })
    ).toBe('Qwen 3.8 27B');
  });

  it('humanisiert Ollama-name:tag-Ids ohne Slash (UI-Sweep F1)', () => {
    // Genau die Form, die ein Direkt-Pull erzeugt und die vorher roh durchrutschte.
    expect(modellAnzeigeName({ id: 'qwen3-coder:30b', name: 'qwen3-coder:30b' })).toBe(
      'Qwen 3 Coder 30B'
    );
    expect(modellAnzeigeName({ id: 'mistral:7b', name: 'mistral:7b' })).toBe('Mistral 7B');
  });

  it('lässt einen sauberen Namen mit Leerzeichen unangetastet', () => {
    expect(modellAnzeigeName({ id: 'qwen3:8b', name: 'Qwen 3 8B' })).toBe('Qwen 3 8B');
    expect(modellAnzeigeName({ id: 'gemma3:1b', name: 'Gemma 4 Kompakt' })).toBe('Gemma 4 Kompakt');
  });

  // --- Plan 023 D1 ---------------------------------------------------------

  it('trennt Familie und Version wie der Katalog es schreibt', () => {
    // Der Katalog schreibt "Gemma 3 1B" und "Qwen 3 32B". Solange die
    // Ableitung "Qwen3.8" schrieb, hiess dasselbe Modell je nach Weg anders.
    expect(modellAnzeigeName({ id: 'gemma4:26b' })).toBe('Gemma 4 26B');
    expect(modellAnzeigeName({ id: 'qwen3:32b' })).toBe('Qwen 3 32B');
  });

  it('haelt eine Groessenangabe fuer eine, die auch eine ist', () => {
    // "e4b" ist Gemmas Bezeichnung fuer ein Modell mit vier Milliarden
    // wirksamen Parametern, kein Modell mit vier. Vorher stand hier
    // "Gemma 4 4B".
    expect(modellAnzeigeName({ id: 'gemma4:e4b' })).toBe('Gemma 4');
  });

  it('nimmt auch eine blosse Kennung als Zeichenkette', () => {
    // Die Statusleiste bekommt von Ollama nur die Kennung. Ohne diese Form
    // baute sich jeder Aufrufer sein eigenes Objekt zusammen.
    expect(modellAnzeigeName('hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS')).toBe('Qwen 3.8 27B');
    expect(modellAnzeigeName('Gemma 4 Kompakt')).toBe('Gemma 4 Kompakt');
  });

  it('gibt bei nichts einen leeren Namen statt zu werfen', () => {
    expect(modellAnzeigeName(null)).toBe('');
    expect(modellAnzeigeName(undefined)).toBe('');
    expect(modellAnzeigeName('')).toBe('');
  });
});
