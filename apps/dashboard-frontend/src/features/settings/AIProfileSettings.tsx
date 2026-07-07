import { useState, useEffect, useCallback } from 'react';
import { Save, AlertCircle, RefreshCw } from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi, type ApiError } from '../../hooks/useApi';
import { useToast } from '../../contexts/ToastContext';
import { formatDate } from '../../utils/formatting';
import { extractIssues } from './validationIssues';
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
import { Alert, AlertDescription } from '@/components/ui/shadcn/alert';

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

interface AIProfileSettingsProps {
  onDirtyChange?: (dirty: boolean) => void;
}

/** GET /memory/profile response (YAML profile string or null). */
interface ProfileResponse {
  profile: string | null;
}

/** GET/PUT /settings/company-context response. */
interface CompanyContextResponse {
  content?: string | null;
  updated_at?: string | null;
}

export function AIProfileSettings({ onDirtyChange }: AIProfileSettingsProps = {}) {
  const api = useApi();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Distinguishes a genuine backend failure (show error + retry) from an
  // empty-but-successful load (no profile yet).
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Field-level validation errors keyed by 'companyName' | 'context'.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Profile fields
  const [companyName, setCompanyName] = useState('');
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [products, setProducts] = useState('');
  const [answerLength, setAnswerLength] = useState('mittel');
  const [formality, setFormality] = useState('normal');

  // Company context fields
  const [contextContent, setContextContent] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Original state for change detection
  const [originalProfile, setOriginalProfile] = useState<Record<string, string> | null>(null);
  const [originalContext, setOriginalContext] = useState('');

  const parseYaml = useCallback((yamlStr: string) => {
    if (!yamlStr) return {} as Record<string, string | string[]>;
    const data: Record<string, string | string[]> = {};
    for (const line of yamlStr.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || !trimmed || trimmed.startsWith('#')) continue;
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.substring(0, colonIdx).trim();
        const val = trimmed
          .substring(colonIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, '');
        data[key] = val;
      }
    }
    const lines = yamlStr.split('\n');
    const produkteIdx = lines.findIndex(l => l.trim() === 'produkte:');
    if (produkteIdx >= 0) {
      const items: string[] = [];
      for (let i = produkteIdx + 1; i < lines.length; i++) {
        const l = (lines[i] ?? '').trim();
        if (l.startsWith('- ')) {
          items.push(l.substring(2).trim());
        } else if (l && !l.startsWith('#')) {
          break;
        }
      }
      data._produkte = items;
    }
    const praefIdx = lines.findIndex(l => l.trim() === 'praeferenzen:');
    if (praefIdx >= 0) {
      for (let i = praefIdx + 1; i < lines.length; i++) {
        const l = (lines[i] ?? '').trim();
        if (l.startsWith('antwortlaenge:')) {
          data._antwortlaenge = (l.split(':')[1] ?? '').trim().replace(/^["']|["']$/g, '');
        } else if (l.startsWith('formalitaet:')) {
          data._formalitaet = (l.split(':')[1] ?? '').trim().replace(/^["']|["']$/g, '');
        } else if (l && !l.startsWith('#') && !l.startsWith('-')) {
          if (l.indexOf(':') > 0 && !l.startsWith(' ')) break;
        }
      }
    }
    return data;
  }, []);

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setLoadError(false);
      try {
        // No per-request .catch(): a rejection here is a real backend failure,
        // which must surface as an error state — not be masked as an empty
        // profile. A genuinely empty profile is a *successful* { profile: null }.
        const [profileData, contextData] = await Promise.all([
          api.get<ProfileResponse>('/memory/profile', { signal, showError: false }),
          api.get<CompanyContextResponse>('/settings/company-context', {
            signal,
            showError: false,
          }),
        ]);

        if (profileData.profile) {
          const parsed = parseYaml(profileData.profile);
          const firma = (parsed.firma as string) || '';
          const branche = (parsed.branche as string) || '';
          const prods = Array.isArray(parsed._produkte) ? parsed._produkte.join(', ') : '';
          const aLen = (parsed._antwortlaenge as string) || 'mittel';
          const form = (parsed._formalitaet as string) || 'normal';

          setCompanyName(firma);
          if (AI_INDUSTRIES.includes(branche)) {
            setIndustry(branche);
            setCustomIndustry('');
          } else if (branche) {
            setIndustry('custom');
            setCustomIndustry(branche);
          }
          setProducts(prods);
          setAnswerLength(aLen);
          setFormality(form);
          setOriginalProfile({ firma, branche, prods, aLen, form });
        } else {
          setOriginalProfile({ firma: '', branche: '', prods: '', aLen: 'mittel', form: 'normal' });
        }

        const ctx = contextData.content || defaultContextTemplate;
        setContextContent(ctx);
        setOriginalContext(ctx);
        setLastUpdated(contextData.updated_at || null);
      } catch (error) {
        if (signal?.aborted) return;
        console.error('Error fetching profile data:', error);
        setLoadError(true);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [api, parseYaml]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, reloadKey]);

  const handleRetry = () => {
    setLoading(true);
    setLoadError(false);
    setReloadKey(k => k + 1);
  };

  const currentProfileState = {
    firma: companyName,
    branche: industry === 'custom' ? customIndustry : industry,
    prods: products,
    aLen: answerLength,
    form: formality,
  };

  const profileChanged =
    originalProfile &&
    (currentProfileState.firma !== originalProfile.firma ||
      currentProfileState.branche !== originalProfile.branche ||
      currentProfileState.prods !== originalProfile.prods ||
      currentProfileState.aLen !== originalProfile.aLen ||
      currentProfileState.form !== originalProfile.form);

  const contextChanged = contextContent !== originalContext;
  const hasChanges = profileChanged || contextChanged;

  useEffect(() => {
    onDirtyChange?.(hasChanges);
  }, [hasChanges, onDirtyChange]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  const handleSave = async () => {
    setSaving(true);
    setFieldErrors({});

    // Sequence the two writes and commit each half's "saved" baseline right
    // after its own success. On a partial failure this keeps the client in
    // sync with the server (the saved half is marked clean, the failed half
    // stays dirty) instead of the old Promise.all, which could leave one half
    // persisted server-side while both were rolled back only client-side.
    let profileSaved = false;
    try {
      if (profileChanged) {
        const resolvedIndustry = industry === 'custom' ? customIndustry : industry;
        const productList = products
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);

        await api.post<CompanyContextResponse>(
          '/memory/profile',
          {
            // No 'Unbekannt' fallback: an empty name must surface the backend
            // ValidationError instead of being silently renamed.
            companyName,
            industry: resolvedIndustry,
            teamSize: '',
            products: productList,
            preferences: { antwortlaenge: answerLength, formalitaet: formality },
          },
          { showError: false }
        );
        setOriginalProfile({ ...currentProfileState });
        profileSaved = true;
      }

      if (contextChanged) {
        const res = await api.put<CompanyContextResponse>(
          '/settings/company-context',
          { content: contextContent },
          { showError: false }
        );
        setOriginalContext(contextContent);
        if (res?.updated_at) setLastUpdated(res.updated_at);
      }

      toast.success('KI-Profil erfolgreich gespeichert');
    } catch (error: unknown) {
      const issues = extractIssues(error);
      const nextFieldErrors: Record<string, string> = {};
      for (const issue of issues) {
        if (issue.path.includes('companyName')) {
          nextFieldErrors.companyName = issue.message;
        } else if (issue.path.includes('content')) {
          nextFieldErrors.context = issue.message;
        }
      }
      setFieldErrors(nextFieldErrors);

      const detail = issues[0]?.message || (error as ApiError).message || 'Fehler beim Speichern';
      let text: string;
      if (profileSaved && contextChanged) {
        text = `Firmenprofil gespeichert, aber Zusatzkontext konnte nicht gespeichert werden: ${detail}`;
      } else if (profileChanged && !profileSaved) {
        text = `Firmenprofil konnte nicht gespeichert werden: ${detail}`;
      } else {
        text = `Zusatzkontext konnte nicht gespeichert werden: ${detail}`;
      }
      toast.error(text);
    } finally {
      setSaving(false);
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

  if (loadError) {
    return (
      <div className="animate-in fade-in">
        <div className="mb-8 pb-6 border-b border-border">
          <h1 className="text-2xl font-bold text-foreground mb-2">KI-Profil</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>
              KI-Profil konnte nicht geladen werden. Bitte prüfen Sie die Verbindung und versuchen
              Sie es erneut.
            </span>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="size-4" />
              Erneut versuchen
            </Button>
          </AlertDescription>
        </Alert>
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
              value={companyName}
              onChange={e => {
                setCompanyName(e.target.value);
                setFieldErrors(prev => {
                  if (!prev.companyName) return prev;
                  const { companyName: _omit, ...rest } = prev;
                  return rest;
                });
              }}
              placeholder="z.B. Muster GmbH"
              aria-invalid={Boolean(fieldErrors.companyName)}
            />
            {fieldErrors.companyName && (
              <p className="text-xs text-destructive">{fieldErrors.companyName}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Branche</Label>
            <Select
              value={industry}
              onValueChange={val => {
                setIndustry(val);
                if (val !== 'custom') setCustomIndustry('');
              }}
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
            {industry === 'custom' && (
              <Input
                className="mt-2"
                value={customIndustry}
                onChange={e => setCustomIndustry(e.target.value)}
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
              value={products}
              onChange={e => setProducts(e.target.value)}
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
            className="min-h-50 font-mono text-sm"
            value={contextContent}
            onChange={e => {
              setContextContent(e.target.value);
              setFieldErrors(prev => {
                if (!prev.context) return prev;
                const { context: _omit, ...rest } = prev;
                return rest;
              });
            }}
            placeholder="Beschreiben Sie Ihr Unternehmen, Kunden, Besonderheiten..."
            spellCheck={false}
            aria-invalid={Boolean(fieldErrors.context)}
          />
          {fieldErrors.context && <p className="text-xs text-destructive">{fieldErrors.context}</p>}
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
              value={answerLength}
              onValueChange={setAnswerLength}
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
              value={formality}
              onValueChange={setFormality}
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

        {/* Save Footer */}
        <div className="flex items-center justify-between py-2">
          <div>
            {hasChanges && (
              <span className="text-xs text-warning font-medium">Ungespeicherte Änderungen</span>
            )}
          </div>
          <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
            <Save className="size-4" />
            Speichern
          </Button>
        </div>
      </div>
    </div>
  );
}
