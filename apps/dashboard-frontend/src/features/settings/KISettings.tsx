import { useEffect, useState } from 'react';
import { User, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { AIProfileSettings } from './AIProfileSettings';
import { RagLlmSettings } from './RagLlmSettings';

type SubId = 'profile' | 'rag-llm';

interface SubSection {
  id: SubId;
  label: string;
  icon: LucideIcon;
}

const subSections: SubSection[] = [
  { id: 'profile', label: 'Firmenprofil & Kontext', icon: User },
  { id: 'rag-llm', label: 'RAG & LLM', icon: SlidersHorizontal },
];

interface KISettingsProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "KI" settings tab — bundles the company/AI profile and the RAG & LLM tuning
 * into one tab with an internal sub-navigation. Both sub-sections stay mounted
 * (inactive one is visually hidden) so unsaved changes in one are preserved
 * when the user peeks at the other; the combined dirty state is reported up to
 * the Settings shell so the unsaved-changes guard covers both halves.
 */
export function KISettings({ onDirtyChange }: KISettingsProps = {}) {
  const [active, setActive] = useState<SubId>('profile');
  const [profileDirty, setProfileDirty] = useState(false);
  const [ragDirty, setRagDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(profileDirty || ragDirty);
  }, [profileDirty, ragDirty, onDirtyChange]);

  return (
    <div className="flex flex-col gap-6">
      <nav className="flex gap-1 border-b border-border" aria-label="KI-Unterbereiche">
        {subSections.map(section => {
          const Icon = section.icon;
          const isActive = active === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 -mb-px text-sm border-b-2 transition-colors',
                isActive
                  ? 'border-primary text-foreground font-semibold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn('size-4 shrink-0', isActive && 'text-primary')} />
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      <div className={cn(active !== 'profile' && 'hidden')}>
        <ComponentErrorBoundary componentName="Firmenprofil & Kontext">
          <AIProfileSettings onDirtyChange={setProfileDirty} />
        </ComponentErrorBoundary>
      </div>
      <div className={cn(active !== 'rag-llm' && 'hidden')}>
        <ComponentErrorBoundary componentName="RAG & LLM">
          <RagLlmSettings onDirtyChange={setRagDirty} />
        </ComponentErrorBoundary>
      </div>
    </div>
  );
}

export default KISettings;
