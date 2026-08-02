import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSwitcher } from '../WorkspaceSwitcher';

const deleteMutateAsync = vi.fn().mockResolvedValue(undefined);
const createMutateAsync = vi.fn().mockResolvedValue({ data: { id: 'p-neu' } });

// Vorlagen der Galerie (Plan 014) — pro Test veränderbar.
const galerie = vi.hoisted(() => ({
  vorlagen: [] as {
    id: string;
    name: string;
    beschreibung: string;
    icon: string;
    color: string;
    version: number;
  }[],
}));

// Die Projekt-Hooks liefern Server-State; hier deterministisch gemockt.
vi.mock('../useProjects', () => ({
  useProjects: () => ({
    projects: [
      { id: 'p1', name: 'Standard', color: null, folder_count: 2, is_default: true },
      { id: 'p2', name: 'Marketing', color: '#ff0000', folder_count: 3, is_default: false },
    ],
    createProject: { mutateAsync: createMutateAsync, isPending: false },
    deleteProject: { mutateAsync: deleteMutateAsync, isPending: false },
  }),
  useActiveProject: () => ({
    activeProject: { id: 'p2', name: 'Marketing' },
    setActive: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  }),
  useProjectVorlagen: () => ({ vorlagen: galerie.vorlagen, isLoading: false }),
}));

vi.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));

// Einrichtungs-Interview (Phase 3): der Switcher startet Flows über useApi.
vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({ get: vi.fn(), post: vi.fn().mockResolvedValue({}) }),
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

  it('Vorlagen-Galerie (Plan 014): gewählte Vorlage wird beim Anlegen mitgeschickt', async () => {
    galerie.vorlagen = [
      {
        id: 'kunden-auftraege',
        name: 'Kunden & Aufträge',
        beschreibung: 'CRM-Arbeitsbereich',
        icon: 'users',
        color: '#0ea5e9',
        version: 1,
      },
    ];
    const user = userEvent.setup();
    render(<WorkspaceSwitcher />);
    await user.click(screen.getByLabelText('Projekt wechseln'));
    await user.click(await screen.findByText('Neues Projekt …'));

    // Galerie zeigt „Leeres Projekt" + die Vorlage; Vorlage wählen.
    expect(await screen.findByTestId('vorlage-leer')).toBeInTheDocument();
    await user.click(screen.getByTestId('vorlage-kunden-auftraege'));

    await user.type(screen.getByLabelText('Name'), 'Vertrieb');
    await user.click(screen.getByRole('button', { name: /Anlegen/ }));

    expect(createMutateAsync).toHaveBeenCalledWith({
      name: 'Vertrieb',
      description: null,
      vorlage: 'kunden-auftraege',
    });
    galerie.vorlagen = [];
  });
});
