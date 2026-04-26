import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import StatusMessage from '../../../components/ui/StatusMessage';
import { formatDate } from '../../../utils/formatting';
import { useUnsavedChangesGuard } from '../../../contexts/UnsavedChangesContext';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Button } from '@/components/ui/shadcn/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/shadcn/radio-group';
import { Textarea } from '@/components/ui/shadcn/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/shadcn/select';
import { useProfileQuery, useCompanyContextQuery } from '../hooks/queries';
import { useUpdateProfileMutation, useUpdateCompanyContextMutation } from '../hooks/mutations';

const AI_INDUSTRIES = [
  'IT & Software',
  'Handel & E-Commerce',
  'Produktion & Fertigung',
  'Beratung & Dienstleistungen',
  'Gesundheit & Medizin',
];

const defaultContextTemplate = `# Zusätzlicher Kontext

## Kunden & Zielgruppen
- [Kundensegment 1]
- [Kundensegment 2]

## Besonderheiten
- [Besonderheit 1]
- [Besonderheit 2]

---
*Diese Informationen werden bei allen KI-Anfragen als Hintergrundkontext bereitgestellt.*`;

interface ProfileForm {
  companyName: string;
  industry: string;
  customIndustry: string;
  products: string;
  answerLength: string;
  formality: string;
}

const EMPTY_FORM: ProfileForm = {
  companyName: '',
  industry: '',
  customIndustry: '',
  products: '',
  answerLength: 'mittel',
  formality: 'normal',
};

export function AIProfileSettings() {
  const profileQuery = useProfileQuery();
  const contextQuery = useCompanyContextQuery();
  const updateProfile = useUpdateProfileMutation();
  const updateContext = useUpdateCompanyContextMutation();

  const loading = profileQuery.isLoading || contextQuery.isLoading;
  const saving = updateProfile.isPending || updateContext.isPending;

  // Derived "original" form from server data — recomputed when query refetches
  const originalForm = useMemo<ProfileForm>(() => {
    const p = profileQuery.data;
    if (!p) return EMPTY_FORM;
    const isKnownIndustry = AI_INDUSTRIES.includes(p.branche);
    return {
      companyName: p.firma,
      industry: p.branche ? (isKnownIndustry ? p.branche : 'custom') : '',
      customIndustry: p.branche && !isKnownIndustry ? p.branche : '',
      products: p.produkte.join(', '),
      answerLength: p.antwortlaenge || 'mittel',
      formality: p.formalitaet || 'normal',
    };
  }, [profileQuery.data]);

  const originalContext = contextQuery.data?.content || defaultContextTemplate;
  const lastUpdated = contextQuery.data?.updated_at ?? null;

  // Local form state — synced from server on initial load and after every save
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [contextContent, setContextContent] = useState('');
  const [originalSnapshot, setOriginalSnapshot] = useState<string>('');
  const [originalContextSnapshot, setOriginalContextSnapshot] = useState<string>('');
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

  // Sync local form from server when query data changes (initial load, after save)
  if (profileQuery.data) {
    const snapshot = JSON.stringify(originalForm);
    if (snapshot !== originalSnapshot) {
      setForm(originalForm);
      setOriginalSnapshot(snapshot);
    }
  }
  if (contextQuery.data && originalContext !== originalContextSnapshot) {
    setContextContent(originalContext);
    setOriginalContextSnapshot(originalContext);
  }

  const profileChanged = JSON.stringify(form) !== originalSnapshot;
  const contextChanged = contextContent !== originalContextSnapshot;
  const hasChanges = profileChanged || contextChanged;

  // Report dirty state to the Settings-level UnsavedChangesProvider, which
  // installs the browser beforeunload warning AND lets Settings prompt
  // before in-app tab switches discard our edits.
  useUnsavedChangesGuard(hasChanges);

  const handleSave = async () => {
    setMessage(null);
    const tasks: Promise<unknown>[] = [];

    if (profileChanged) {
      const resolvedIndustry = form.industry === 'custom' ? form.customIndustry : form.industry;
      const productList = form.products
        .split(',')
        .map(p => p.trim())
        .filter(Boolean);
      tasks.push(
        updateProfile.mutateAsync({
          companyName: form.companyName || 'Unbekannt',
          industry: resolvedIndustry,
          teamSize: '',
          products: productList,
          preferences: { antwortlaenge: form.answerLength, formalitaet: form.formality },
        })
      );
    }

    if (contextChanged) {
      tasks.push(updateContext.mutateAsync(contextContent));
    }

    try {
      await Promise.all(tasks);
      setMessage({ type: 'success', text: 'KI-Profil erfolgreich gespeichert' });
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage({ type: 'error', text: err.message || 'Fehler beim Speichern' });
    }
  };

  if (loading) {
    return (
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">KI-Profil</h1>
        </div>
        <SkeletonCard hasAvatar={false} lines={4} />
      </div>
    );
  }

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">KI-Profil</h1>
        <p className="text-sm text-muted-foreground">
          Firmen- und KI-Verhalten konfigurieren. Diese Einstellungen werden automatisch bei jedem
          Chat als Kontext mitgegeben.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        {/* Firmenprofil */}
        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-foreground">Firmenprofil</h3>

          <div className="space-y-2">
            <Label htmlFor="companyName">Firmenname</Label>
            <Input
              id="companyName"
              value={form.companyName}
              onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
              placeholder="z.B. Muster GmbH"
            />
          </div>

          <div className="space-y-2">
            <Label>Branche</Label>
            <Select
              value={form.industry}
              onValueChange={val =>
                setForm(f => ({
                  ...f,
                  industry: val,
                  customIndustry: val === 'custom' ? f.customIndustry : '',
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="-- Bitte wählen --" />
              </SelectTrigger>
              <SelectContent>
                {AI_INDUSTRIES.map(ind => (
                  <SelectItem key={ind} value={ind}>
                    {ind}
                  </SelectItem>
                ))}
                <SelectItem value="custom">Sonstige...</SelectItem>
              </SelectContent>
            </Select>
            {form.industry === 'custom' && (
              <Input
                className="mt-2"
                value={form.customIndustry}
                onChange={e => setForm(f => ({ ...f, customIndustry: e.target.value }))}
                placeholder="Ihre Branche eingeben..."
              />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="products">
              Produkte & Services <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Input
              id="products"
              value={form.products}
              onChange={e => setForm(f => ({ ...f, products: e.target.value }))}
              placeholder="z.B. Webentwicklung, Cloud-Hosting, Beratung"
            />
            <p className="text-xs text-muted-foreground">Komma-getrennt eingeben</p>
          </div>
        </section>

        <div className="border-t border-border" />

        {/* Zusatzkontext */}
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Zusatzkontext</h3>
            <p className="text-xs text-muted-foreground">
              Beschreibung Ihres Unternehmens, Ihrer Zielgruppen und Besonderheiten.
            </p>
          </div>
          <Textarea
            className="min-h-[200px] font-mono text-sm"
            value={contextContent}
            onChange={e => setContextContent(e.target.value)}
            placeholder="Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten..."
            spellCheck={false}
          />
          {lastUpdated && (
            <p className="text-xs text-muted-foreground">
              Zuletzt aktualisiert: {formatDate(lastUpdated)}
            </p>
          )}
        </section>

        <div className="border-t border-border" />

        {/* KI-Verhalten */}
        <section className="space-y-5">
          <h3 className="text-sm font-semibold text-foreground">KI-Verhalten</h3>

          <div className="space-y-2">
            <Label>Antwortlänge</Label>
            <RadioGroup
              value={form.answerLength}
              onValueChange={val => setForm(f => ({ ...f, answerLength: val }))}
              className="flex flex-wrap gap-3"
            >
              {[
                { value: 'kurz', label: 'Kurz' },
                { value: 'mittel', label: 'Mittel' },
                { value: 'ausfuehrlich', label: 'Ausführlich' },
              ].map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`len-${opt.value}`} />
                  <Label htmlFor={`len-${opt.value}`} className="cursor-pointer font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Formalität</Label>
            <RadioGroup
              value={form.formality}
              onValueChange={val => setForm(f => ({ ...f, formality: val }))}
              className="flex flex-wrap gap-3"
            >
              {[
                { value: 'formell', label: 'Formell' },
                { value: 'normal', label: 'Normal' },
                { value: 'locker', label: 'Locker' },
              ].map(opt => (
                <div key={opt.value} className="flex items-center gap-2">
                  <RadioGroupItem value={opt.value} id={`form-${opt.value}`} />
                  <Label htmlFor={`form-${opt.value}`} className="cursor-pointer font-normal">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        </section>

        <StatusMessage message={message as { type: 'success' | 'error'; text: string } | null} />

        <div className="flex items-center justify-between py-2">
          <div>
            {hasChanges && (
              <span className="text-xs text-warning font-medium">Ungespeicherte Änderungen</span>
            )}
          </div>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              'Speichern...'
            ) : (
              <>
                <Save className="size-4" />
                Speichern
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
