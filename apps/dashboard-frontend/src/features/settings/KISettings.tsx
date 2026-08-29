import { useEffect, useState } from 'react';
import { User, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@marken';
import { ComponentErrorBoundary } from '../../components/ui/ErrorBoundary';
import { AIProfileSettings } from './AIProfileSettings';
import { RagLlmSettings } from './RagLlmSettings';

type SubId = 'profile' | 'rag-llm';

const subSections: { id: SubId; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Firmenprofil & Kontext', icon: User },
  { id: 'rag-llm', label: 'Sprachmodell', icon: SlidersHorizontal },
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
    <Tabs value={active} onValueChange={wert => setActive(wert as SubId)}>
      <TabsList aria-label="KI-Unterbereiche">
        {subSections.map(({ id, label, icon: Symbol }) => (
          <TabsTrigger key={id} value={id}>
            <Symbol />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      {/*
        Beide Haelften bleiben gemountet und werden nur versteckt, damit ein
        halb ausgefuelltes Formular den Blick in die andere Haelfte ueberlebt.
        `forceMount` ist genau dafuer da: Radix laesst die Flaeche stehen und
        setzt ihr `hidden`, solange sie nicht die aktive ist.
      */}
      <TabsContent value="profile" forceMount className="pt-6 data-[state=inactive]:hidden">
        <ComponentErrorBoundary componentName="Firmenprofil & Kontext">
          <AIProfileSettings onDirtyChange={setProfileDirty} />
        </ComponentErrorBoundary>
      </TabsContent>
      <TabsContent value="rag-llm" forceMount className="pt-6 data-[state=inactive]:hidden">
        <ComponentErrorBoundary componentName="Sprachmodell">
          <RagLlmSettings onDirtyChange={setRagDirty} />
        </ComponentErrorBoundary>
      </TabsContent>
    </Tabs>
  );
}
