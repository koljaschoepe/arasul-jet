import { useState, useEffect, useCallback } from 'react';
import { User, Save, Check, AlertCircle, FileText, Sparkles } from 'lucide-react';
import { SkeletonCard } from '../../components/ui/Skeleton';
import { useApi } from '../../hooks/useApi';
import { formatDate } from '../../utils/formatting';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/shadcn/card';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/shadcn/tabs';

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

export function AIProfileSettings() {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: string; text: string } | null>(null);

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
        const l = lines[i].trim();
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
        const l = lines[i].trim();
        if (l.startsWith('antwortlaenge:')) {
          data._antwortlaenge = l
            .split(':')[1]
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (l.startsWith('formalitaet:')) {
          data._formalitaet = l
            .split(':')[1]
            .trim()
            .replace(/^["']|["']$/g, '');
        } else if (l && !l.startsWith('#') && !l.startsWith('-')) {
          if (l.indexOf(':') > 0 && !l.startsWith(' ')) break;
        }
      }
    }
    return data;
  }, []);

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      try {
        // Fetch both in parallel
        const [profileData, contextData] = await Promise.all([
          api.get('/memory/profile', { signal, showError: false }).catch(() => ({ profile: null })),
          api
            .get('/settings/company-context', { signal, showError: false })
            .catch(() => ({ content: '', updated_at: null })),
        ]);

        // Parse profile
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

        // Parse context
        const ctx = contextData.content || defaultContextTemplate;
        setContextContent(ctx);
        setOriginalContext(ctx);
        setLastUpdated(contextData.updated_at || null);
      } catch (error) {
        if (signal?.aborted) return;
        console.error('Error fetching profile data:', error);
        setOriginalProfile({ firma: '', branche: '', prods: '', aLen: 'mittel', form: 'normal' });
        setContextContent(defaultContextTemplate);
        setOriginalContext(defaultContextTemplate);
      } finally {
        setLoading(false);
      }
    },
    [api, parseYaml]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

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

  // Warn user about unsaved changes when closing/refreshing the browser
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
    setMessage(null);

    try {
      const promises: Promise<any>[] = [];

      // Save profile if changed
      if (profileChanged) {
        const resolvedIndustry = industry === 'custom' ? customIndustry : industry;
        const productList = products
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);

        promises.push(
          api.post(
            '/memory/profile',
            {
              companyName: companyName || 'Unbekannt',
              industry: resolvedIndustry,
              teamSize: '',
              products: productList,
              preferences: { antwortlaenge: answerLength, formalitaet: formality },
            },
            { showError: false }
          )
        );
      }

      // Save context if changed
      if (contextChanged) {
        promises.push(
          api.put('/settings/company-context', { content: contextContent }, { showError: false })
        );
      }

      const results = await Promise.all(promises);

      // Update original state
      setOriginalProfile({ ...currentProfileState });
      setOriginalContext(contextContent);

      // Update lastUpdated from context response
      const contextResult = results.find(r => r?.updated_at);
      if (contextResult) {
        setLastUpdated(contextResult.updated_at);
      }

      setMessage({ type: 'success', text: 'KI-Profil erfolgreich gespeichert' });
    } catch (error: any) {
      setMessage({
        type: 'error',
        text: error.data?.error || error.message || 'Fehler beim Speichern',
      });
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

  return (
    <div className="animate-in fade-in">
      <div className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl font-bold text-foreground mb-2">KI-Profil</h1>
        <p className="text-sm text-muted-foreground">
          Firmen- und KI-Verhalten konfigurieren. Diese Einstellungen werden automatisch bei jedem
          Chat als Kontext mitgegeben.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <Tabs defaultValue="profil">
          <TabsList variant="line" className="w-full mb-6">
            <TabsTrigger value="profil" className="flex-1">
              <User className="size-4" />
              Firmenprofil
            </TabsTrigger>
            <TabsTrigger value="kontext" className="flex-1">
              <FileText className="size-4" />
              Zusatzkontext
            </TabsTrigger>
            <TabsTrigger value="praeferenzen" className="flex-1">
              <Sparkles className="size-4" />
              KI-Verhalten
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Company Info */}
          <TabsContent value="profil">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="size-5" />
                  Unternehmensinformationen
                </CardTitle>
                <CardDescription>Grundlegende Informationen über Ihr Unternehmen</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Firma */}
                <div className="space-y-2">
                  <Label htmlFor="companyName">Firmenname</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    placeholder="z.B. Muster GmbH"
                  />
                </div>

                {/* Branche */}
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

                {/* Produkte */}
                <div className="space-y-2">
                  <Label htmlFor="products">
                    Produkte & Services{' '}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Input
                    id="products"
                    value={products}
                    onChange={e => setProducts(e.target.value)}
                    placeholder="z.B. Webentwicklung, Cloud-Hosting, Beratung"
                  />
                  <p className="text-xs text-muted-foreground">Komma-getrennt eingeben</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Additional Context */}
          <TabsContent value="kontext">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="size-5" />
                  Zusätzlicher Kontext
                </CardTitle>
                <CardDescription>
                  Freitext-Beschreibung Ihres Unternehmens, Ihrer Zielgruppen und Besonderheiten.
                  Wird bei allen KI-Anfragen als Hintergrundkontext mitgegeben.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  className="min-h-[250px] font-mono text-sm"
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: AI Preferences + Info */}
          <TabsContent value="praeferenzen" className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-5" />
                  KI-Präferenzen
                </CardTitle>
                <CardDescription>Wie soll die KI antworten?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Antwortlänge */}
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

                {/* Formalität */}
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
              </CardContent>
            </Card>

            {/* Info Alert */}
            <Alert>
              <Sparkles className="size-4" />
              <AlertDescription>
                <strong className="block mb-2">Wie wird das Profil genutzt?</strong>
                <ul className="list-disc pl-4 space-y-1 text-sm">
                  <li>
                    <strong>Automatischer Kontext</strong> — Unternehmensdaten und Präferenzen
                    werden bei jedem Chat automatisch an die KI übergeben
                  </li>
                  <li>
                    <strong>Bessere Antworten</strong> — Die KI kennt Ihre Branche und passt Sprache
                    und Detailgrad entsprechend an
                  </li>
                  <li>
                    <strong>Projekt-Prompts</strong> — Zusätzlich können pro Projekt eigene
                    Anweisungen definiert werden
                  </li>
                </ul>
              </AlertDescription>
            </Alert>
          </TabsContent>
        </Tabs>

        {/* Message */}
        {message && (
          <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
            {message.type === 'success' ? (
              <Check className="size-4" />
            ) : (
              <AlertCircle className="size-4" />
            )}
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        {/* Save Footer */}
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
