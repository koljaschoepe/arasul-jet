import { Sparkles } from 'lucide-react';
import { useSkills } from '@/hooks/useSkills';
import { SidebarView } from './SidebarView';

/**
 * Sidebar-Ansicht »Skills« (Plan 012 Phase B, Schritt 6 — Grundgerüst).
 * Zeigt schon jetzt die verfügbaren Skills als Liste (echte Daten via
 * `useSkills`). Der zentrale Skill-Editor/-Preview kommt als eigener Mitte-Tab
 * in Phase D (Schritte 10–12).
 */
export function SkillsPanel() {
  const { skills, isLoading } = useSkills();

  return (
    <SidebarView title="Skills">
      {isLoading ? (
        <p className="px-3 py-3 text-sm text-muted-foreground">Skills werden geladen …</p>
      ) : skills.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <Sparkles className="h-6 w-6 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Noch keine Skills angelegt.</p>
        </div>
      ) : (
        <ul className="flex flex-col py-1">
          {skills.map(skill => (
            <li key={skill.name} className="flex flex-col gap-0.5 px-3 py-1.5 hover:bg-accent/50">
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
            </li>
          ))}
        </ul>
      )}
    </SidebarView>
  );
}
