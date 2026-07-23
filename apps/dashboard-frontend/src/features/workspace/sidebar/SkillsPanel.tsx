import { Plus, Sparkles } from 'lucide-react';
import { useSkills } from '@/hooks/useSkills';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useSkillEditorStore } from '@/stores/skillEditorStore';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Skills« (Plan 012 Phase D, Schritt 12) — die echte
 * Übersicht. Listet alle Skills (echte Daten via `useSkills`); ein Klick öffnet
 * den zentralen Skill-Editor-Tab (Schritt 10) mit dem Skill, der Kopf-Knopf
 * »Neuer Skill« öffnet ihn leer. Ziel setzen + Tab öffnen läuft — wie bei
 * Modellen/Erweiterungen in der ActivityBar — über Ziel-Store + `openTab`.
 */
export function SkillsPanel() {
  const { skills, isLoading } = useSkills();
  const openTab = useWorkspaceStore(s => s.openTab);
  const setEditTarget = useSkillEditorStore(s => s.setEditTarget);

  const oeffneEditor = (editName: string | null) => {
    setEditTarget(editName);
    openTab({ type: 'skill' });
  };

  return (
    <SidebarView
      title="Skills"
      actions={
        <button
          type="button"
          aria-label="Neuer Skill"
          title="Neuer Skill"
          onClick={() => oeffneEditor(null)}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      }
    >
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Skills werden geladen …</p>
      ) : skills.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Noch keine Skills angelegt.</p>
          <button
            type="button"
            onClick={() => oeffneEditor(null)}
            className="text-sm font-medium text-primary hover:underline"
          >
            Skill anlegen
          </button>
        </div>
      ) : (
        <ul className="flex flex-col py-1">
          {skills.map(skill => (
            <li key={skill.name}>
              <button
                type="button"
                data-testid={`skill-open-${skill.name}`}
                onClick={() => oeffneEditor(skill.name)}
                className="flex w-full flex-col gap-0.5 px-3 py-1.5 text-left hover:bg-accent/50"
              >
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                  <Sparkles
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">/{skill.name}</span>
                </span>
                {skill.beschreibung && (
                  <span className="truncate pl-5 text-xs text-muted-foreground">
                    {skill.beschreibung}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </SidebarView>
  );
}
