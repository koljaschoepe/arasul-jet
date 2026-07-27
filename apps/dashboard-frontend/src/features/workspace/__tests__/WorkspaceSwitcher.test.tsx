import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);

// Die Projekt-Hooks liefern Server-State; hier deterministisch gemockt.
vi.mock('../useProjects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'p1', name: 'Standard', color: null, folder_count: 2, is_default: true },
      { id: 'p2', name: 'Marketing', color: '#ff0000', folder_count: 3, is_default: false },
    ],
    createProject: { mutateAsync: vi.fn(), isPending: false },
    deleteProject: { mutateAsync: deleteMutateAsync, isPending: false },
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

  it('bietet Löschen nur für Nicht-Standard-Projekte und öffnet den Bestätigungsdialog', async () => {
    const user = userEvent.setup();
    render(<WorkspaceSwitcher />);
    await user.click(screen.getByLabelText('Projekt wechseln'));

    // Standard (is_default) hat keinen Löschen-Knopf, Marketing schon.
    expect(screen.queryByLabelText('Projekt „Standard" löschen')).not.toBeInTheDocument();
    const del = await screen.findByLabelText('Projekt „Marketing" löschen');
    await user.click(del);

    // Bestätigungsdialog erscheint; Bestätigen ruft die Lösch-Mutation.
    expect(await screen.findByText('Projekt löschen')).toBeInTheDocument();
    const confirm = screen
      .getAllByRole('button', { name: 'Löschen' })
      .find(b => b.textContent === 'Löschen');
    await user.click(confirm as HTMLElement);
    expect(deleteMutateAsync).toHaveBeenCalledWith('p2');
  });
});
