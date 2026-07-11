import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProjectsSection } from '../explorer/ProjectsSection';
import { useWorkspaceStore } from '@/stores/workspaceStore';

const projects = [
  {
    id: 'p1',
    name: 'Allgemein',
    is_default: true,
    knowledge_space_id: 'ks1',
    space_name: 'Allgemein',
    conversation_count: '3',
  },
  { id: 'p2', name: 'Marketing', knowledge_space_id: null, conversation_count: '0' },
];

vi.mock('@/hooks/useApi', () => ({
  useApi: () => ({
    get: vi.fn().mockResolvedValue({ projects }),
  }),
}));

function resetStore() {
  useWorkspaceStore.setState({
    tabs: [],
    activeTabId: null,
    explorerVisible: true,
    llmVisible: true,
    llmPanelMode: 'chat',
    chatScope: null,
    explorerRequest: null,
  });
}

describe('ProjectsSection', () => {
  beforeEach(resetStore);

  it('listet Projekte und bietet den n8n-Link an', async () => {
    render(<ProjectsSection spaces={[]} />);
    expect(await screen.findByText('Allgemein')).toBeInTheDocument();
    expect(screen.getByText('Marketing')).toBeInTheDocument();
    const n8n = screen.getByLabelText('Automatisierungen (n8n) öffnen');
    expect(n8n).toHaveAttribute('href', `${window.location.origin}/n8n`);
    expect(n8n).toHaveAttribute('target', '_blank');
  });

  it('Projekt-Klick öffnet den Chat-Tab', async () => {
    render(<ProjectsSection spaces={[]} />);
    (await screen.findByText('Marketing')).click();
    expect(useWorkspaceStore.getState().activeTabId).toBe('chat:new');
  });
});
