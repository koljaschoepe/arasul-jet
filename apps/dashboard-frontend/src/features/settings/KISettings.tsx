import { useEffect, useState } from 'react';
import { User, SlidersHorizontal, Cloud } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FilterBar, type FilterBarItem } from '@/components/ui/FilterBar';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { AIProfileSettings } from './AIProfileSettings';
import { RagLlmSettings } from './RagLlmSettings';
import { ExterneModelleSettings } from './ExterneModelleSettings';

type SubId = 'profile' | 'rag-llm' | 'extern';

const subSections: FilterBarItem<SubId>[] = [
  { id: 'profile', label: 'Firmenprofil & Kontext', icon: User },
  { id: 'rag-llm', label: 'Sprachmodell', icon: SlidersHorizontal },
  { id: 'extern', label: 'Externe Modelle', icon: Cloud },
];

interface KISettingsProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/**
 * "KI" settings tab — bundles the company/AI profile and the Sprachmodell (LLM) tuning
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
    <FilterBar
      items={subSections}
      active={active}
      onChange={setActive}
      label="KI-Unterbereiche"
      panelClassName="pt-6"
    >
      {/*
        Beide Haelften bleiben gemountet und werden nur versteckt, damit ein
        halb ausgefuelltes Formular den Blick in die andere Haelfte ueberlebt.
        Deshalb liegen sie zusammen in der einen Inhaltsflaeche der Leiste.
      */}
      <div className={cn(active !== 'profile' && 'hidden')}>
        <ComponentErrorBoundary componentName="Firmenprofil & Kontext">
          <AIProfileSettings onDirtyChange={setProfileDirty} />
        </ComponentErrorBoundary>
      </div>
      <div className={cn(active !== 'rag-llm' && 'hidden')}>
        <ComponentErrorBoundary componentName="Sprachmodell">
          <RagLlmSettings onDirtyChange={setRagDirty} />
        </ComponentErrorBoundary>
      </div>
      {/*
        Externe Modelle melden keinen Schmutzstand nach oben: hier gibt es
        kein Formular, das man halb ausgefuellt verlassen koennte. Jede
        Aktion (speichern, pruefen, schalten, entfernen) ist fuer sich
        abgeschlossen und sofort wirksam.
      */}
      <div className={cn(active !== 'extern' && 'hidden')}>
        <ComponentErrorBoundary componentName="Externe Modelle">
          <ExterneModelleSettings />
        </ComponentErrorBoundary>
      </div>
    </FilterBar>
  );
}

export default KISettings;
