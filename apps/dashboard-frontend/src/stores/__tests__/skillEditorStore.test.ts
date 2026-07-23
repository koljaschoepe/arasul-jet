import { describe, it, expect, beforeEach } from 'vitest';
import { useSkillEditorStore } from '@/stores/skillEditorStore';

describe('skillEditorStore', () => {
  beforeEach(() => useSkillEditorStore.setState({ editName: null }));

  it('startet ohne Ziel (neuer Skill)', () => {
    expect(useSkillEditorStore.getState().editName).toBeNull();
  });

  it('setEditTarget setzt und leert das Ziel', () => {
    useSkillEditorStore.getState().setEditTarget('recherche');
    expect(useSkillEditorStore.getState().editName).toBe('recherche');
    useSkillEditorStore.getState().setEditTarget(null);
    expect(useSkillEditorStore.getState().editName).toBeNull();
  });
});
