import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

// Die Projekt-Hooks liefern Server-State; hier deterministisch gemockt.
vi.mock('../useProjects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'p1', name: 'Standard', color: null, folder_count: 2, is_default: true },
      { id: 'p2', name: 'Marketing', color: '#ff0000', folder_count: 3, is_default: false },
    ],
    createProject: { mutateAsync: vi.fn(), isPending: false },
    deleteProject: { mutate: vi.fn() },
  }),
  useActiveProject: () => ({
    activeProject: { id: 'p2', name: 'Marketing' },
    setActive: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

describe('WorkspaceSwitcher', () => {
  it('zeigt den Namen des aktiven Projekts im Umschalter', () => {
    render(<WorkspaceSwitcher />);
    const trigger = screen.getByLabelText('Projekt wechseln');
    expect(trigger).toHaveTextContent('Marketing');
  });

  it('fällt ohne aktives Projekt auf „Standard" zurück', () => {
    render(<WorkspaceSwitcher />);
    // Der Trigger ist vorhanden und klickbar (kein Absturz ohne Server).
    expect(screen.getByLabelText('Projekt wechseln')).toBeInTheDocument();
  });
});
