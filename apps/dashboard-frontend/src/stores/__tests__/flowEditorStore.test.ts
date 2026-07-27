import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowEditorStore } from '@/stores/flowEditorStore';

describe('flowEditorStore', () => {
  beforeEach(() => useFlowEditorStore.setState({ editName: null }));

  it('startet ohne Ziel (neuer Flow)', () => {
    expect(useFlowEditorStore.getState().editName).toBeNull();
  });

  it('setEditTarget setzt und leert das Ziel', () => {
    useFlowEditorStore.getState().setEditTarget('recherche');
    expect(useFlowEditorStore.getState().editName).toBe('recherche');
    useFlowEditorStore.getState().setEditTarget(null);
    expect(useFlowEditorStore.getState().editName).toBeNull();
  });
});
