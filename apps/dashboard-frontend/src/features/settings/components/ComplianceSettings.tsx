/**
 * ComplianceSettings — Phase 1.4 + 1.6
 *
 * UI für Compliance-relevante Toggles:
 *   - KI-Transparenz-Label (EU-AI-Act Art. 50): Default ON, Deaktivierung
 *     erfordert Admin-Rolle und wird im Audit-Log nachvollzogen.
 *   - Telegram-Bot-Aktivierung (Drittland UAE): Default OFF, Aktivierung
 *     erfordert ausdrücklichen Disclaimer-Acknowledge.
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, Bot, Loader2, ShieldCheck, Globe, Trash2, Plus } from 'lucide-react';
import { useApi } from '../../../hooks/useApi';
import { useToast } from '../../../contexts/ToastContext';
import { useFeatureFlags } from '../../../contexts/FeatureFlagsContext';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';

interface ComplianceState {
  telegram: {
    enabled: boolean;
    disclaimer_accepted: boolean;
    disclaimer_accepted_at: string | null;
    disclaimer_accepted_by: number | null;
  };
  ai_transparency: {
    enabled: boolean;
    disabled_at: string | null;
    disabled_by: number | null;
  };
}

interface WhitelistDomain {
  id: number;
  domain: string;
  description: string | null;
  added_by: number | null;
  added_at: string;
}

export function ComplianceSettings() {
  const api = useApi();
  const toast = useToast();
  const { refresh } = useFeatureFlags();
  const [state, setState] = useState<ComplianceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [telegramDisclaimer, setTelegramDisclaimer] = useState(false);
  const [whitelist, setWhitelist] = useState<WhitelistDomain[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainDesc, setNewDomainDesc] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, wl] = await Promise.all([
          api.get<ComplianceState>('/settings/compliance'),
          api.get<{ domains: WhitelistDomain[] }>('/settings/n8n-whitelist'),
        ]);
        if (!cancelled) {
          setState(data);
          setTelegramDisclaimer(data.telegram.disclaimer_accepted);
          setWhitelist(wl.domains);
        }
      } catch {
        if (!cancelled) toast.error('Compliance-Einstellungen konnten nicht geladen werden');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, toast]);

  const addDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setSaving('whitelist-add');
    try {
      const res = await api.post<{ domain: WhitelistDomain }>('/settings/n8n-whitelist', {
        domain,
        description: newDomainDesc || undefined,
      });
      setWhitelist(prev => [...prev, res.domain].sort((a, b) => a.domain.localeCompare(b.domain)));
      setNewDomain('');
      setNewDomainDesc('');
      toast.success(`${domain} hinzugefügt`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Hinzufügen');
    } finally {
      setSaving(null);
    }
  };

  const removeDomain = async (id: number, domain: string) => {
    if (!window.confirm(`Domain "${domain}" aus Whitelist entfernen?`)) return;
    setSaving(`whitelist-${id}`);
    try {
      await api.del(`/settings/n8n-whitelist/${id}`);
      setWhitelist(prev => prev.filter(d => d.id !== id));
      toast.success(`${domain} entfernt`);
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Entfernen');
    } finally {
      setSaving(null);
    }
  };

  const toggleTelegram = async (nextEnabled: boolean) => {
    if (nextEnabled && !telegramDisclaimer) {
      toast.warning('Bitte erst den Drittland-Disclaimer bestätigen');
      return;
    }
    setSaving('telegram');
    try {
      await api.put('/settings/compliance/telegram', {
        enabled: nextEnabled,
        disclaimer_accepted: telegramDisclaimer,
      });
      setState(prev =>
        prev
          ? {
              ...prev,
              telegram: {
                ...prev.telegram,
                enabled: nextEnabled,
                disclaimer_accepted: nextEnabled || prev.telegram.disclaimer_accepted,
              },
            }
          : prev
      );
      await refresh();
      toast.success(nextEnabled ? 'Telegram aktiviert' : 'Telegram deaktiviert');
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Speichern');
    } finally {
      setSaving(null);
    }
  };

  const toggleAiTransparency = async (nextEnabled: boolean) => {
    if (!nextEnabled) {
      const confirmed = window.confirm(
        'Achtung: Sie deaktivieren das KI-Transparenz-Label, das nach Art. 50 EU-AI-Act ab August 2026 Pflicht ist. ' +
          'Diese Aktion wird im Audit-Log protokolliert. Fortfahren?'
      );
      if (!confirmed) return;
    }
    setSaving('ai_transparency');
    try {
      await api.put('/settings/compliance/ai-transparency', { enabled: nextEnabled });
      setState(prev =>
        prev
          ? { ...prev, ai_transparency: { ...prev.ai_transparency, enabled: nextEnabled } }
          : prev
      );
      await refresh();
      toast.success(nextEnabled ? 'Transparenz-Label aktiviert' : 'Transparenz-Label deaktiviert');
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message || 'Fehler beim Speichern');
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Lädt Compliance-Einstellungen...
      </div>
    );
  }

  if (!state) return null;

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl">
      <header className="flex items-center gap-3">
        <ShieldCheck className="size-7 text-primary" />
        <div>
          <h2 className="text-xl font-semibold text-foreground m-0">Compliance</h2>
          <p className="text-sm text-muted-foreground m-0">
            DSGVO, EU-AI-Act und Berufsgeheimnis-Konformität.
          </p>
        </div>
      </header>

      {/* KI-Transparenz */}
      <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Bot className="size-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-semibold text-foreground m-0">
                KI-Transparenz-Label (Art. 50 EU-AI-Act)
              </h3>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Zeigt unter jeder KI-Antwort einen Hinweis &bdquo;Generiert von KI&ldquo;. Pflicht
                ab 2. August 2026. Default: aktiviert.
                {state.ai_transparency.disabled_at && (
                  <span className="block mt-1 text-warning">
                    Deaktiviert am{' '}
                    {new Date(state.ai_transparency.disabled_at).toLocaleString('de-DE')}
                  </span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant={state.ai_transparency.enabled ? 'outline' : 'default'}
            disabled={saving === 'ai_transparency'}
            onClick={() => toggleAiTransparency(!state.ai_transparency.enabled)}
          >
            {saving === 'ai_transparency' && <Loader2 className="size-4 animate-spin" />}
            {state.ai_transparency.enabled ? 'Deaktivieren' : 'Aktivieren'}
          </Button>
        </div>
      </section>

      {/* Telegram Drittland */}
      <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-6 text-warning shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground m-0">
              Telegram-Bot (Drittland-Risiko)
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Telegram Messenger Inc. (UAE) ist ein Drittland ohne EU-AVV. Default: deaktiviert für
              Berufsgeheimnis-Personas (Arzt, Anwalt, Steuerberater). Aktivierung dokumentiert im
              Audit-Log.
              {state.telegram.disclaimer_accepted_at && (
                <span className="block mt-1">
                  Disclaimer bestätigt am{' '}
                  {new Date(state.telegram.disclaimer_accepted_at).toLocaleString('de-DE')}
                </span>
              )}
            </p>
          </div>
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-background border border-border rounded-lg">
          <input
            type="checkbox"
            checked={telegramDisclaimer}
            onChange={e => setTelegramDisclaimer(e.target.checked)}
            disabled={state.telegram.enabled}
            className="mt-0.5 accent-primary shrink-0"
          />
          <span className="text-foreground text-sm leading-relaxed">
            Ich bestätige, dass über Telegram-Bots dieser Box keine Mandanten-, Patienten- oder
            anderweitig nach §203 StGB geschützten Daten verarbeitet werden, und dass ich meinen
            Datenschutzbeauftragten konsultiert habe.
          </span>
        </label>

        <div className="flex justify-end">
          <Button
            variant={state.telegram.enabled ? 'outline' : 'default'}
            disabled={saving === 'telegram' || (!state.telegram.enabled && !telegramDisclaimer)}
            onClick={() => toggleTelegram(!state.telegram.enabled)}
          >
            {saving === 'telegram' && <Loader2 className="size-4 animate-spin" />}
            {state.telegram.enabled ? 'Telegram deaktivieren' : 'Telegram aktivieren'}
          </Button>
        </div>
      </section>

      {/* n8n External Whitelist */}
      <section className="bg-card border border-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Globe className="size-6 text-primary shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground m-0">
              n8n &mdash; Externe Domain-Whitelist
            </h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              Welche externen Domains dürfen n8n-Workflows kontaktieren? Leer = alles geblockt
              (Soll-Zustand für Berufsgeheimnis-Personas). Interne Dienste (Ollama, Qdrant, MinIO,
              Embedding-Service) sind immer erlaubt. Jeder Call wird im Audit-Log protokolliert.
            </p>
          </div>
        </div>

        {whitelist.length === 0 ? (
          <div className="text-sm text-muted-foreground italic px-1">
            Whitelist ist leer &mdash; n8n-Workflows können aktuell keine externen Dienste
            kontaktieren.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {whitelist.map(d => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 p-2.5 bg-background border border-border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-foreground">{d.domain}</div>
                  {d.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{d.description}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={saving === `whitelist-${d.id}`}
                  onClick={() => removeDomain(d.id, d.domain)}
                  aria-label={`${d.domain} entfernen`}
                >
                  {saving === `whitelist-${d.id}` ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-border">
          <Input
            type="text"
            placeholder="z. B. api.telegram.org"
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            className="flex-1 font-mono text-sm"
          />
          <Input
            type="text"
            placeholder="Beschreibung (optional)"
            value={newDomainDesc}
            onChange={e => setNewDomainDesc(e.target.value)}
            className="flex-1 text-sm"
          />
          <Button disabled={!newDomain.trim() || saving === 'whitelist-add'} onClick={addDomain}>
            {saving === 'whitelist-add' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Hinzufügen
          </Button>
        </div>
      </section>
    </div>
  );
}

export default ComplianceSettings;
