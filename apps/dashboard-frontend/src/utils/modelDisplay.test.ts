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
      modellAnzeigeName({ id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS', name: 'Qwen3.8 27B' })
    ).toBe('Qwen3.8 27B');
  });

  it('humanisiert eine rohe hf.co-Id, wenn kein Name da ist', () => {
    expect(modellAnzeigeName({ id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS' })).toBe('Qwen3.8 27B');
  });

  it('humanisiert, wenn der Name selbst eine rohe Id ist', () => {
    expect(
      modellAnzeigeName({
        id: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
        name: 'hf.co/unsloth/Qwen3.8-27B-GGUF:IQ4_XS',
      })
    ).toBe('Qwen3.8 27B');
  });
});
