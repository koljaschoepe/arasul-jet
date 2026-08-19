import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useStoreCatalog } from '@/hooks/useStoreCatalog';

// Katalog mit einem echten Sprachmodell und zwei OCR-Engines. Letztere sind
// keine Ollama-Modelle (Dokument-Indexer-verwaltet) und dürfen gar nicht erst
// im Modell-Raster auftauchen — sonst boten sie einen kaputten „Laden"-Knopf,
// der dauerhaft auf „Fehler" stehen blieb.
const CATALOG = [
  {
    id: 'qwen3:7b',
    name: 'Qwen3 7B',
    description: 'LLM',
    size_bytes: 1,
    install_status: 'available',
    model_type: 'llm',
  },
  {
    id: 'tesseract:latest',
    name: 'Tesseract OCR',
    description: 'OCR',
    size_bytes: 1,
    install_status: 'error',
    model_type: 'ocr',
  },
  {
    id: 'paddleocr:latest',
    name: 'PaddleOCR',
    description: 'OCR',
    size_bytes: 1,
    install_status: 'available',
    model_type: 'ocr',
  },
];

const apiMock = {
  get: vi.fn(async (path: string) => {
    if (path === '/models/catalog') return { models: CATALOG.map(m => ({ ...m })) };
    if (path === '/models/status') return { loaded_model: null };
    if (path === '/models/default') return { default_model: null };
    if (path === '/apps') return { apps: [] };
    return {};
  }),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
};
vi.mock('@/hooks/useApi', () => ({ useApi: () => apiMock }));

function renderCatalog() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useStoreCatalog(), { wrapper });
}

describe('useStoreCatalog, OCR-Modelle werden aus dem Katalog gefiltert', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blendet model_type="ocr" aus, behält Sprachmodelle', async () => {
    const { result } = renderCatalog();
    await waitFor(() => expect(result.current.models.length).toBeGreaterThan(0));

    const ids = result.current.models.map(m => m.id);
    expect(ids).toContain('qwen3:7b');
    expect(ids).not.toContain('tesseract:latest');
    expect(ids).not.toContain('paddleocr:latest');
    expect(result.current.models.every(m => m.model_type !== 'ocr')).toBe(true);
  });
});
