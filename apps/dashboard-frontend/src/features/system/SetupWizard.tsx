/**
 * SetupWizard - First-Run Setup Experience
 *
 * Multi-step wizard shown after first login when setup is not yet completed.
 * Steps: 1) Welcome, 2) KI-Profil, 3) Password Change, 4) Network Check, 5) AI Models, 6) Summary
 */

import { useState, useEffect, useCallback } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  Loader2,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  Server,
  Shield,
  SkipForward,
  Code,
  ShoppingCart,
  Settings,
  Briefcase,
  Heart,
  Pencil,
  User,
  Users,
  LayoutGrid,
  MessageCircle,
  FileText,
  Zap,
  Coffee,
  Star,
  Download,
  Info,
} from 'lucide-react';
import { useDownloads } from '../../contexts/DownloadContext';
import { useAuth } from '../../contexts/AuthContext';
import { useApi } from '../../hooks/useApi';
import { Button } from '@/components/ui/shadcn/button';
import { Input } from '@/components/ui/shadcn/input';
import { Badge } from '@/components/ui/shadcn/badge';
import { cn } from '@/lib/utils';
import { PLATFORM_NAME } from '@/config/branding';

interface SetupWizardProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface Step {
  id: number;
  title: string;
  description: string;
}

interface IndustryOption {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface TeamSizeOption {
  label: string;
  sublabel: string;
  value: string;
  icon: LucideIcon;
}

interface AnswerStyleOption {
  label: string;
  desc: string;
  value: string;
  icon: LucideIcon;
}

interface ModelCategoryInfo {
  title: string;
  desc: string;
}

interface NetworkInfo {
  ip_addresses?: string[];
  internet_reachable?: boolean;
  mdns?: string;
  error?: boolean;
}

interface SetupCatalogModel {
  id: string;
  name: string;
  description?: string;
  size_bytes?: number;
  ram_required_gb?: number;
  category?: string;
  model_type?: string;
  install_status?: string;
  download_progress?: number;
  performance_tier?: number;
}

interface SystemInfo {
  hostname?: string;
  uptime?: number;
  platform?: string;
  version?: string;
  [key: string]: unknown;
}

interface DeviceInfo {
  model?: string;
  name?: string;
  ram_total_gb?: number;
  storage_total_gb?: number;
  [key: string]: unknown;
}

interface LoginResponse {
  token: string;
  user: Record<string, unknown>;
}

const STEPS: Step[] = [
  { id: 1, title: 'Willkommen', description: 'System einrichten' },
  { id: 2, title: 'KI-Profil', description: 'Ihr Unternehmen' },
  { id: 3, title: 'Passwort', description: 'Admin-Passwort ändern' },
  { id: 4, title: 'Netzwerk', description: 'Konnektivität prüfen' },
  { id: 5, title: 'KI-Modelle', description: 'Modell auswählen' },
  { id: 6, title: 'Zusammenfassung', description: 'Einrichtung abschließen' },
];

const INDUSTRIES: IndustryOption[] = [
  { label: 'IT & Software', value: 'IT & Software', icon: Code },
  { label: 'Handel & E-Commerce', value: 'Handel & E-Commerce', icon: ShoppingCart },
  { label: 'Produktion & Fertigung', value: 'Produktion & Fertigung', icon: Settings },
  { label: 'Beratung & Dienstleistung', value: 'Beratung & Dienstleistungen', icon: Briefcase },
  { label: 'Gesundheit & Medizin', value: 'Gesundheit & Medizin', icon: Heart },
  { label: 'Andere Branche', value: 'custom', icon: Pencil },
];

const TEAM_SIZES: TeamSizeOption[] = [
  { label: '1-5', sublabel: 'Kleinteam', value: '5', icon: User },
  { label: '6-20', sublabel: 'Mittelgroß', value: '20', icon: Users },
  { label: '21-100', sublabel: 'Unternehmen', value: '100', icon: LayoutGrid },
  { label: '100+', sublabel: 'Konzern', value: '100+', icon: Briefcase },
];

const ANSWER_STYLES: AnswerStyleOption[] = [
  {
    label: 'Kurz & prägnant',
    desc: 'Kompakte Antworten, direkt zum Punkt',
    value: 'kurz',
    icon: Zap,
  },
  {
    label: 'Ausführlich',
    desc: 'Detaillierte Erklärungen mit Kontext',
    value: 'ausfuehrlich',
    icon: FileText,
  },
  {
    label: 'Professionell',
    desc: 'Formeller Ton, geschäftliche Sprache',
    value: 'formell',
    icon: MessageCircle,
  },
  {
    label: 'Locker & direkt',
    desc: 'Ungezwungen, wie ein Kollege',
    value: 'locker',
    icon: Coffee,
  },
];

const MODEL_CATEGORIES: Record<string, ModelCategoryInfo> = {
  small: { title: 'Schnell & Kompakt', desc: '7-12 GB RAM' },
  medium: { title: 'Ausgewogen', desc: '15-25 GB RAM' },
  large: { title: 'Leistungsstark', desc: '30-40 GB RAM' },
  xlarge: { title: 'Maximum', desc: '45+ GB RAM' },
};

const RECOMMENDED_MODEL = 'qwen3:14b-q8';

const formatModelSize = (bytes: number | null | undefined): string => {
  if (!bytes) return 'N/A';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(gb * 1024).toFixed(0)} MB`;
};

function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const api = useApi();
  const { user, login } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Step 1: Welcome
  const [companyName, setCompanyName] = useState('');

  // Step 2: KI-Profil
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [products, setProducts] = useState('');
  const [answerStyle, setAnswerStyle] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);

  // Step 3: Password
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [pwMinLength, setPwMinLength] = useState(4); // default fallback

  // Step 4: Network
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);

  // Step 5: AI Models
  const [models, setModels] = useState<SetupCatalogModel[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);

  // Step 6: System info
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // Downloads (DownloadContext)
  const { startDownload, getDownloadState } = useDownloads();

  // Save step progress
  const saveStepProgress = useCallback(
    async (step: number) => {
      try {
        await api.put(
          '/system/setup-step',
          {
            step,
            companyName: companyName || undefined,
            selectedModel: selectedModel || undefined,
          },
          { showError: false }
        );
      } catch {
        // Non-critical, silently ignore
      }
    },
    [api, companyName, selectedModel]
  );

  // Save KI-Profil
  const saveProfile = async () => {
    try {
      const selectedIndustry = customIndustry || industry;
      const productList = products
        ? products
            .split(',')
            .map((p: string) => p.trim())
            .filter(Boolean)
        : [];

      await api.post(
        '/memory/profile',
        {
          companyName: companyName || 'Mein Unternehmen',
          industry: selectedIndustry,
          teamSize: teamSize,
          products: productList,
          preferences: {
            antwortlaenge: answerStyle || 'mittel',
            formalitaet: answerStyle === 'formell' ? 'formell' : 'locker',
          },
        },
        { showError: false }
      );
      setProfileSaved(true);
    } catch {
      // Non-critical
    }
  };

  // Step navigation
  const goNext = useCallback(() => {
    if (currentStep < 6) {
      if (currentStep === 2 && !profileSaved) {
        saveProfile();
      }
      // Trigger model download when leaving step 5
      if (currentStep === 5 && selectedModel) {
        const model = models.find((m: SetupCatalogModel) => m.id === selectedModel);
        if (model && model.install_status !== 'available') {
          startDownload(selectedModel, model.name);
        }
      }
      const nextStep = currentStep + 1;
      setCurrentStep(nextStep);
      setError('');
      saveStepProgress(nextStep);
    }
  }, [
    currentStep,
    saveStepProgress,
    profileSaved,
    selectedModel,
    models,
    startDownload,
    saveProfile,
  ]);

  const goBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
      setError('');
    }
  }, [currentStep]);

  // Step 3: Change password
  const handlePasswordChange = async () => {
    setPasswordError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Alle Felder müssen ausgefüllt werden');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Neue Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < pwMinLength) {
      setPasswordError(`Passwort muss mindestens ${pwMinLength} Zeichen lang sein`);
      return;
    }

    setLoading(true);
    try {
      await api.post(
        '/auth/change-password',
        { currentPassword, newPassword },
        { showError: false }
      );

      // Re-login immediately — backend blacklists all tokens after password change
      const username = user?.username || 'admin';
      try {
        const loginData = await api.post<LoginResponse>(
          '/auth/login',
          { username, password: newPassword },
          { showError: false }
        );
        localStorage.setItem('arasul_token', loginData.token);
        localStorage.setItem('arasul_user', JSON.stringify(loginData.user));
        login(loginData as Parameters<typeof login>[0]);
      } catch {
        // If re-login fails, at least store that password was changed
      }
      setPasswordChanged(true);
    } catch (err: unknown) {
      const e = err as { data?: { error?: string; message?: string }; message?: string };
      setPasswordError(e.data?.error || e.data?.message || e.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // Step 4: Fetch network info
  const fetchNetworkInfo = useCallback(async () => {
    setNetworkLoading(true);
    try {
      const data = await api.get<NetworkInfo>('/system/network', { showError: false });
      setNetworkInfo(data);
    } catch {
      setNetworkInfo({ ip_addresses: [], internet_reachable: false, error: true });
    } finally {
      setNetworkLoading(false);
    }
  }, [api]);

  // Step 5: Fetch model catalog
  const fetchModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const data = await api.get<{ models?: SetupCatalogModel[] }>('/models/catalog', {
        showError: false,
      });
      const llmModels = (data.models || []).filter(
        (m: SetupCatalogModel) => (m.model_type || 'llm') === 'llm'
      );
      setModels(llmModels);
      if (!selectedModel) {
        setSelectedModel(RECOMMENDED_MODEL);
      }
    } catch {
      setModels([]);
    } finally {
      setModelsLoading(false);
    }
  }, [api]);

  // Step 6: Fetch system info
  const fetchSystemInfo = useCallback(async () => {
    try {
      const [infoData, thresholdData] = await Promise.all([
        api.get<SystemInfo>('/system/info', { showError: false }).catch(() => null),
        api
          .get<{ device?: DeviceInfo }>('/system/thresholds', { showError: false })
          .catch(() => null),
      ]);

      if (infoData) setSystemInfo(infoData);
      if (thresholdData) setDeviceInfo(thresholdData.device ?? null);
    } catch {
      // Non-critical
    }
  }, [api]);

  // Load data when step changes
  useEffect(() => {
    if (currentStep === 4) fetchNetworkInfo();
    if (currentStep === 5) fetchModels();
    if (currentStep === 6) fetchSystemInfo();
  }, [currentStep, fetchNetworkInfo, fetchModels, fetchSystemInfo]);

  // Fetch password requirements from backend (no auth required)
  useEffect(() => {
    api
      .get<{ requirements: { minLength: number } }>('/settings/password-requirements', {
        showError: false,
      })
      .then(data => {
        if (data?.requirements?.minLength) setPwMinLength(data.requirements.minLength);
      })
      .catch(() => {});
  }, [api]);

  // Complete setup
  const handleComplete = async () => {
    setLoading(true);
    setError('');

    try {
      // Set default model if already installed
      if (selectedModel) {
        const model = models.find((m: SetupCatalogModel) => m.id === selectedModel);
        if (model?.install_status === 'available') {
          await api
            .post('/models/default', { model_id: selectedModel }, { showError: false })
            .catch(() => {});
        }
      }

      await api.post(
        '/system/setup-complete',
        {
          companyName: companyName || undefined,
          selectedModel: selectedModel || undefined,
          hostname: networkInfo?.mdns || undefined,
        },
        { showError: false }
      );

      onComplete();
    } catch (err: unknown) {
      const e = err as { data?: { error?: string }; message?: string };
      setError(e.data?.error || e.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  // Skip setup
  const handleSkip = async () => {
    setLoading(true);
    try {
      await api.post('/system/setup-skip', {}, { showError: false });
      onSkip();
    } catch {
      onSkip();
    } finally {
      setLoading(false);
    }
  };

  // Can advance to next step?
  const canAdvance = () => {
    if (currentStep === 3 && !passwordChanged) return false;
    return true;
  };

  // Inline validation hints for password step
  const passwordMismatch =
    passwordTouched && confirmPassword.length > 0 && newPassword !== confirmPassword;
  const passwordTooShort =
    passwordTouched && newPassword.length > 0 && newPassword.length < pwMinLength;

  return (
    <div className="flex justify-center items-center min-h-screen bg-background p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-[720px] shadow-lg flex flex-col max-h-[90vh] md:max-h-[90vh] max-md:max-w-full max-md:rounded-lg max-md:max-h-[95vh]">
        {/* Header */}
        <div className="text-center py-8 px-8 pb-4 max-md:py-6 max-md:px-6 max-md:pb-3 max-sm:p-4">
          <h1 className="text-[1.75rem] text-primary m-0 mb-1 font-bold max-md:text-2xl">
            {PLATFORM_NAME} Platform
          </h1>
          <p className="text-muted-foreground text-sm m-0">Ersteinrichtung</p>
        </div>

        {/* Progress Steps */}
        <div
          className="flex justify-center gap-2 py-4 px-8 border-b border-border max-md:py-3 max-md:px-4 max-md:gap-1"
          role="navigation"
          aria-label="Setup-Fortschritt"
        >
          {STEPS.map(step => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div
                key={step.id}
                className={cn(
                  'flex flex-col items-center gap-1 flex-1 max-w-[100px] transition-opacity',
                  isActive ? 'opacity-100' : isCompleted ? 'opacity-80' : 'opacity-40'
                )}
              >
                <div
                  className={cn(
                    'size-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all max-md:size-7 max-md:text-xs',
                    isActive
                      ? 'bg-primary text-white border-primary'
                      : isCompleted
                        ? 'bg-primary text-white border-primary'
                        : 'bg-background text-muted-foreground border-border'
                  )}
                >
                  {isCompleted ? <Check className="size-4" aria-hidden="true" /> : step.id}
                </div>
                <span
                  className={cn(
                    'text-[0.7rem] text-muted-foreground text-center whitespace-nowrap max-md:text-[0.6rem]',
                    isActive && 'text-foreground font-semibold'
                  )}
                >
                  {step.title}
                </span>
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="p-8 flex-1 overflow-y-auto max-md:p-6 max-sm:p-4">
          {/* Step 1: Welcome */}
          {currentStep === 1 && (
            <div className="flex flex-col items-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary max-sm:size-12">
                <Server className="size-7 max-sm:size-5" />
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center max-sm:text-[1.15rem]">
                Willkommen bei {PLATFORM_NAME}
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] max-sm:text-sm">
                Ihr Edge-AI-System ist bereit für die Einrichtung. Dieser Assistent führt Sie durch
                die wichtigsten Konfigurationsschritte.
              </p>

              <div className="w-full max-w-[440px] mb-4">
                <label
                  htmlFor="company-name"
                  className="block mb-1.5 text-muted-foreground font-semibold text-sm uppercase tracking-wide"
                >
                  Firmenname (optional)
                </label>
                <Input
                  id="company-name"
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="z.B. Meine Firma GmbH"
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                />
              </div>

              <div className="flex gap-3 p-4 bg-primary/10 border border-primary/20 rounded-md w-full max-w-[440px] mt-4">
                <Shield className="size-5 shrink-0 text-primary mt-0.5" />
                <div>
                  <strong className="block text-foreground mb-1 text-sm">
                    Was wird eingerichtet?
                  </strong>
                  <ul className="m-0 mt-1 pl-5 text-muted-foreground text-sm">
                    <li className="mb-0.5">Sicheres Admin-Passwort</li>
                    <li className="mb-0.5">Netzwerk-Konnektivität</li>
                    <li>KI-Modell-Auswahl</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: KI-Profil */}
          {currentStep === 2 && (
            <div className="flex flex-col items-stretch max-w-[560px] w-full mx-auto">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary self-center max-sm:size-12">
                <Cpu className="size-7 max-sm:size-5" />
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center self-center max-sm:text-[1.15rem]">
                KI-Profil einrichten
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] self-center max-sm:text-sm">
                Damit die KI Sie optimal unterstützt, erzählen Sie kurz etwas über Ihr Unternehmen.
              </p>

              {/* Industry */}
              <div className="mb-6 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground m-0 mb-2.5 flex items-center gap-2">
                  Branche
                </h3>
                <div className="grid grid-cols-3 gap-2 w-full max-md:grid-cols-2 max-sm:grid-cols-2">
                  {INDUSTRIES.map(ind => {
                    const Icon = ind.icon;
                    const isSelected = industry === ind.value;
                    return (
                      <button
                        key={ind.value}
                        type="button"
                        className={cn(
                          'flex flex-col items-center gap-1.5 py-3.5 px-2 bg-background border-2 border-border rounded-md cursor-pointer transition-all text-muted-foreground text-center hover:border-primary/30 hover:bg-card hover:text-foreground',
                          isSelected &&
                            'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        )}
                        onClick={() => {
                          setIndustry(ind.value);
                          if (ind.value !== 'custom') setCustomIndustry('');
                        }}
                      >
                        <Icon className={cn('size-5 shrink-0', isSelected && 'text-primary')} />
                        <span className="text-xs font-semibold leading-tight">{ind.label}</span>
                      </button>
                    );
                  })}
                </div>
                {industry === 'custom' && (
                  <Input
                    type="text"
                    value={customIndustry}
                    onChange={e => setCustomIndustry(e.target.value)}
                    placeholder="Ihre Branche eingeben..."
                    className="mt-2 bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                    autoFocus
                  />
                )}
              </div>

              {/* Team Size */}
              <div className="mb-6 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground m-0 mb-2.5 flex items-center gap-2">
                  Teamgröße
                </h3>
                <div className="grid grid-cols-4 gap-2 w-full max-md:grid-cols-2 max-sm:grid-cols-2">
                  {TEAM_SIZES.map(ts => {
                    const Icon = ts.icon;
                    const isSelected = teamSize === ts.value;
                    return (
                      <button
                        key={ts.value}
                        type="button"
                        className={cn(
                          'flex flex-col items-center gap-1.5 py-3 px-1.5 bg-background border-2 border-border rounded-md cursor-pointer transition-all text-muted-foreground text-center hover:border-primary/30 hover:bg-card hover:text-foreground',
                          isSelected &&
                            'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        )}
                        onClick={() => setTeamSize(ts.value)}
                      >
                        <Icon className={cn('size-5 shrink-0', isSelected && 'text-primary')} />
                        <span className="text-xs font-semibold leading-tight">{ts.label}</span>
                        <span
                          className={cn(
                            'text-[0.65rem] text-muted-foreground font-normal',
                            isSelected && 'text-primary opacity-70'
                          )}
                        >
                          {ts.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Products */}
              <div className="mb-6 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground m-0 mb-2.5 flex items-center gap-2">
                  Produkte & Services{' '}
                  <span className="text-[0.65rem] font-medium normal-case tracking-normal text-muted-foreground bg-background py-0.5 px-1.5 rounded-sm border border-border">
                    optional
                  </span>
                </h3>
                <Input
                  type="text"
                  value={products}
                  onChange={e => setProducts(e.target.value)}
                  placeholder="z.B. Webentwicklung, Cloud-Hosting, Beratung"
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                />
                <span className="block text-[0.72rem] text-muted-foreground mt-1">
                  Komma-getrennt eingeben
                </span>
              </div>

              {/* Answer Style */}
              <div className="mb-6 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground m-0 mb-2.5 flex items-center gap-2">
                  Antwort-Stil
                </h3>
                <div className="grid grid-cols-2 gap-2 w-full max-sm:grid-cols-1">
                  {ANSWER_STYLES.map(style => {
                    const Icon = style.icon;
                    const isSelected = answerStyle === style.value;
                    return (
                      <button
                        key={style.value}
                        type="button"
                        className={cn(
                          'flex flex-row items-center text-left py-3.5 px-4 gap-3 bg-background border-2 border-border rounded-md cursor-pointer transition-all text-muted-foreground hover:border-primary/30 hover:bg-card hover:text-foreground max-sm:py-3 max-sm:px-3.5',
                          isSelected &&
                            'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                        )}
                        onClick={() => setAnswerStyle(style.value)}
                      >
                        <div
                          className={cn(
                            'size-9 rounded-sm bg-card flex items-center justify-center shrink-0 transition-all',
                            isSelected && 'bg-primary/15 text-primary'
                          )}
                        >
                          <Icon className="size-4" />
                        </div>
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-xs font-semibold leading-tight">{style.label}</span>
                          <span
                            className={cn(
                              'text-[0.72rem] text-muted-foreground font-normal leading-snug',
                              isSelected && 'text-muted-foreground'
                            )}
                          >
                            {style.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {profileSaved && (
                <div className="flex items-center gap-1.5 text-primary text-xs font-medium mt-2 self-center">
                  <Check className="size-4" /> Profil gespeichert
                </div>
              )}
            </div>
          )}

          {/* Step 3: Password Change */}
          {currentStep === 3 && (
            <div className="flex flex-col items-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary max-sm:size-12">
                <Shield className="size-7 max-sm:size-5" />
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center max-sm:text-[1.15rem]">
                Admin-Passwort ändern
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] max-sm:text-sm">
                Ändern Sie das Standard-Passwort für mehr Sicherheit. Dies ist ein Pflichtschritt.
              </p>

              {passwordChanged ? (
                <div className="flex items-center gap-3 bg-primary/10 border border-primary text-primary p-5 rounded-md w-full max-w-[440px] text-base font-semibold">
                  <Check className="size-6 shrink-0" />
                  <p className="m-0">Passwort wurde erfolgreich geändert!</p>
                </div>
              ) : (
                <>
                  {passwordError && (
                    <div
                      className="flex items-center gap-2 bg-destructive/10 border border-destructive text-destructive py-3 px-4 rounded-md w-full max-w-[440px] mb-4 text-sm"
                      role="alert"
                    >
                      <AlertCircle className="size-4 shrink-0" /> {passwordError}
                    </div>
                  )}

                  <div className="w-full max-w-[440px] mb-4">
                    <label
                      htmlFor="current-password"
                      className="block mb-1.5 text-muted-foreground font-semibold text-sm uppercase tracking-wide"
                    >
                      Aktuelles Passwort
                    </label>
                    <Input
                      id="current-password"
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      placeholder="Aktuelles Passwort eingeben"
                      autoComplete="current-password"
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                    />
                  </div>

                  <div className="w-full max-w-[440px] mb-4">
                    <label
                      htmlFor="new-password"
                      className="block mb-1.5 text-muted-foreground font-semibold text-sm uppercase tracking-wide"
                    >
                      Neues Passwort
                    </label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={e => {
                        setNewPassword(e.target.value);
                        setPasswordTouched(true);
                      }}
                      placeholder="Mindestens 4 Zeichen"
                      autoComplete="new-password"
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                    />
                    {passwordTooShort && (
                      <p className="text-xs text-destructive mt-1">
                        Mindestens {pwMinLength} Zeichen erforderlich
                      </p>
                    )}
                  </div>

                  <div className="w-full max-w-[440px] mb-4">
                    <label
                      htmlFor="confirm-password"
                      className="block mb-1.5 text-muted-foreground font-semibold text-sm uppercase tracking-wide"
                    >
                      Passwort bestätigen
                    </label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={e => {
                        setConfirmPassword(e.target.value);
                        setPasswordTouched(true);
                      }}
                      placeholder="Neues Passwort wiederholen"
                      autoComplete="new-password"
                      className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-primary/15"
                    />
                    {passwordMismatch && (
                      <p className="text-xs text-destructive mt-1">
                        Passwörter stimmen nicht überein
                      </p>
                    )}
                  </div>

                  <Button
                    variant="solid"
                    onClick={handlePasswordChange}
                    disabled={loading || !currentPassword || !newPassword || !confirmPassword}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" /> Wird geändert...
                      </>
                    ) : (
                      'Passwort ändern'
                    )}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Step 4: Network Check */}
          {currentStep === 4 && (
            <div className="flex flex-col items-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary max-sm:size-12">
                {networkInfo?.internet_reachable ? (
                  <Wifi className="size-7 max-sm:size-5" />
                ) : (
                  <WifiOff className="size-7 max-sm:size-5" />
                )}
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center max-sm:text-[1.15rem]">
                Netzwerk-Status
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] max-sm:text-sm">
                Überprüfung der Netzwerk-Konnektivität Ihres Systems.
              </p>

              {networkLoading ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="m-0">Netzwerk wird geprüft...</p>
                </div>
              ) : networkInfo ? (
                <div className="w-full max-w-[440px]">
                  <div className="flex items-start gap-3 py-3 border-b border-border/30">
                    <div
                      className={cn(
                        'size-7 rounded-full flex items-center justify-center shrink-0 text-sm',
                        networkInfo.internet_reachable
                          ? 'bg-primary/15 text-primary'
                          : 'bg-muted-foreground/15 text-muted-foreground'
                      )}
                    >
                      {networkInfo.internet_reachable ? (
                        <Check className="size-3.5" />
                      ) : (
                        <WifiOff className="size-3.5" />
                      )}
                    </div>
                    <div>
                      <strong className="block text-foreground text-sm mb-0.5">Internet</strong>
                      <p className="text-muted-foreground text-sm m-0">
                        {networkInfo.internet_reachable
                          ? 'Verbunden'
                          : 'Nicht verfügbar (Offline-Modus)'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 py-3 border-b border-border/30">
                    <div className="size-7 rounded-full flex items-center justify-center shrink-0 text-sm bg-primary/15 text-primary">
                      <Check className="size-3.5" />
                    </div>
                    <div>
                      <strong className="block text-foreground text-sm mb-0.5">IP-Adressen</strong>
                      <p className="text-muted-foreground text-sm m-0">
                        {networkInfo.ip_addresses?.join(', ') || 'Keine gefunden'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 py-3">
                    <div className="size-7 rounded-full flex items-center justify-center shrink-0 text-sm bg-primary/15 text-primary">
                      <Check className="size-3.5" />
                    </div>
                    <div>
                      <strong className="block text-foreground text-sm mb-0.5">mDNS</strong>
                      <p className="text-muted-foreground text-sm m-0">
                        {networkInfo.mdns || 'arasul.local'}
                      </p>
                    </div>
                  </div>

                  {!networkInfo.internet_reachable && (
                    <div className="flex gap-3 p-4 bg-primary/10 border border-primary/20 rounded-md w-full mt-4">
                      <AlertCircle className="size-5 shrink-0 text-primary mt-0.5" />
                      <div>
                        <strong className="block text-foreground mb-1 text-sm">
                          Offline-Modus
                        </strong>
                        <p className="text-muted-foreground text-sm m-0">
                          Das System funktioniert vollständig ohne Internet. Updates können per USB
                          eingespielt werden.
                        </p>
                      </div>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    onClick={fetchNetworkInfo}
                    disabled={networkLoading}
                    className="mt-4"
                  >
                    Erneut prüfen
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {/* Step 5: AI Models */}
          {currentStep === 5 && (
            <div className="flex flex-col items-stretch max-w-[580px] w-full mx-auto">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary self-center max-sm:size-12">
                <Cpu className="size-7 max-sm:size-5" />
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center self-center max-sm:text-[1.15rem]">
                KI-Modell auswählen
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] self-center max-sm:text-sm">
                Wählen Sie ein Startmodell für Ihren KI-Assistenten. Es wird im Hintergrund
                heruntergeladen.
              </p>

              {modelsLoading ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <Loader2 className="size-6 animate-spin text-primary" />
                  <p className="m-0">Modell-Katalog wird geladen...</p>
                </div>
              ) : models.length > 0 ? (
                <>
                  {(['small', 'medium', 'large', 'xlarge'] as const).map((cat: string) => {
                    const catModels = models.filter((m: SetupCatalogModel) => m.category === cat);
                    if (catModels.length === 0) return null;
                    const catInfo = MODEL_CATEGORIES[cat];
                    return (
                      <div key={cat} className="w-full mb-4">
                        <div className="flex items-baseline gap-2 mb-1.5 pb-1 border-b border-border/30">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            {catInfo.title}
                          </span>
                          <span className="text-[0.7rem] text-muted-foreground opacity-70">
                            {catInfo.desc}
                          </span>
                        </div>
                        {catModels.map((model: SetupCatalogModel) => {
                          const isSelected = selectedModel === model.id;
                          const isRecommended = model.id === RECOMMENDED_MODEL;
                          const isInstalled = model.install_status === 'available';
                          const dlState = getDownloadState(model.id);
                          return (
                            <button
                              key={model.id}
                              type="button"
                              className={cn(
                                'flex flex-col gap-1 py-3 px-4 bg-background border-2 border-border rounded-md cursor-pointer transition-all text-left w-full mb-1.5 text-muted-foreground hover:border-primary/30 hover:bg-card',
                                isSelected && 'border-primary bg-primary/5'
                              )}
                              onClick={() => setSelectedModel(model.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-bold text-foreground">
                                  {model.name}
                                </span>
                                <div className="flex gap-1.5 shrink-0">
                                  {isRecommended && (
                                    <Badge className="inline-flex items-center gap-0.5 text-[0.6rem] font-bold uppercase tracking-wide py-0.5 px-2 rounded-sm bg-muted-foreground/10 text-muted-foreground border border-muted-foreground/30">
                                      <Star className="w-2.5 h-2.5" /> Empfohlen
                                    </Badge>
                                  )}
                                  {isInstalled && (
                                    <Badge className="inline-flex items-center gap-0.5 text-[0.6rem] font-bold uppercase py-0.5 px-2 rounded-sm bg-primary/10 text-primary border border-primary/30">
                                      <Check className="w-2.5 h-2.5" /> Installiert
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground leading-snug">
                                {model.description}
                              </span>
                              <div className="flex gap-3 text-[0.75rem] text-muted-foreground mt-0.5">
                                <span className="inline-flex items-center gap-1">
                                  <Download className="size-3" />{' '}
                                  {formatModelSize(model.size_bytes)}
                                </span>
                                <span className="inline-flex items-center gap-1">
                                  <HardDrive className="size-3" /> {model.ram_required_gb} GB RAM
                                </span>
                              </div>
                              {dlState && (
                                <div className="mt-1.5">
                                  <div className="h-1 bg-border rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full transition-[width] duration-300"
                                      style={{ width: `${dlState.progress}%` }}
                                    />
                                  </div>
                                  <span className="block text-[0.7rem] text-primary mt-0.5">
                                    {dlState.status} ({dlState.progress}%)
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="flex gap-3 p-4 bg-primary/10 border border-primary/20 rounded-md w-full mt-4">
                    <Info className="size-5 shrink-0 text-primary mt-0.5" />
                    <div>
                      <p className="text-muted-foreground text-sm m-0">
                        Das Standardmodell kann später jederzeit unter{' '}
                        <strong>Store &rarr; Modelle</strong> geändert werden. Weitere Modelle
                        können dort ebenfalls heruntergeladen werden.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex gap-3 p-4 bg-primary/10 border border-primary/20 rounded-md w-full max-w-[440px] self-center mt-4">
                  <AlertCircle className="size-5 shrink-0 text-primary mt-0.5" />
                  <div>
                    <strong className="block text-foreground mb-1 text-sm">
                      Keine Modelle verfügbar
                    </strong>
                    <p className="text-muted-foreground text-sm m-0">
                      Der Modell-Katalog konnte nicht geladen werden. Modelle können später im Store
                      heruntergeladen werden.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Summary */}
          {currentStep === 6 && (
            <div className="flex flex-col items-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 text-primary max-sm:size-12">
                <Check className="size-7 max-sm:size-5" />
              </div>
              <h2 className="text-foreground text-[1.35rem] m-0 mb-2 text-center max-sm:text-[1.15rem]">
                Zusammenfassung
              </h2>
              <p className="text-muted-foreground text-center mb-6 text-sm max-w-[440px] max-sm:text-sm">
                Ihre Einrichtung ist fast abgeschlossen. Überprüfen Sie die Konfiguration.
              </p>

              <div className="w-full max-w-[440px]">
                {companyName && (
                  <div className="flex justify-between items-center py-3 border-b border-border/30">
                    <span className="text-muted-foreground text-sm">Firma</span>
                    <span className="text-foreground font-semibold text-sm">{companyName}</span>
                  </div>
                )}

                <div className="flex justify-between items-center py-3 border-b border-border/30">
                  <span className="text-muted-foreground text-sm">Passwort</span>
                  <span className="text-foreground font-semibold text-sm">
                    {passwordChanged ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Check className="size-4" /> Geändert
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <AlertCircle className="size-4" /> Nicht geändert
                      </span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between items-center py-3 border-b border-border/30">
                  <span className="text-muted-foreground text-sm">Netzwerk</span>
                  <span className="text-foreground font-semibold text-sm">
                    {networkInfo?.internet_reachable ? (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Wifi className="size-4" /> Online
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <WifiOff className="size-4" /> Offline-Modus
                      </span>
                    )}
                  </span>
                </div>

                {networkInfo?.ip_addresses?.[0] && (
                  <div className="flex justify-between items-center py-3 border-b border-border/30">
                    <span className="text-muted-foreground text-sm">IP-Adresse</span>
                    <span className="text-foreground font-semibold text-sm">
                      {networkInfo.ip_addresses[0]}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center py-3 border-b border-border/30">
                  <span className="text-muted-foreground text-sm">KI-Modell</span>
                  <span className="text-foreground font-semibold text-sm">
                    {selectedModel ? (
                      <>
                        {models.find((m: SetupCatalogModel) => m.id === selectedModel)?.name ||
                          selectedModel}
                        {(() => {
                          const dlState = getDownloadState(selectedModel);
                          if (!dlState) return null;
                          if (dlState.phase === 'complete')
                            return (
                              <span className="inline-flex items-center gap-1 text-primary ml-2">
                                <Check className="size-4" /> Fertig
                              </span>
                            );
                          if (dlState.phase === 'error')
                            return (
                              <span className="inline-flex items-center gap-1 text-muted-foreground ml-2">
                                <AlertCircle className="size-4" /> Fehler
                              </span>
                            );
                          return (
                            <span className="inline-flex items-center gap-1 text-muted-foreground ml-2">
                              <Loader2 className="size-4 animate-spin" /> {dlState.progress}%
                            </span>
                          );
                        })()}
                      </>
                    ) : (
                      'Keins ausgewählt'
                    )}
                  </span>
                </div>

                {deviceInfo && (
                  <div className="flex justify-between items-center py-3 border-b border-border/30">
                    <span className="text-muted-foreground text-sm">Gerät</span>
                    <span className="text-foreground font-semibold text-sm">{deviceInfo.name}</span>
                  </div>
                )}

                {systemInfo && (
                  <div className="flex justify-between items-center py-3">
                    <span className="text-muted-foreground text-sm">Version</span>
                    <span className="text-foreground font-semibold text-sm">
                      {systemInfo.version || '1.0.0'}
                    </span>
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="flex items-center gap-2 bg-destructive/10 border border-destructive text-destructive py-3 px-4 rounded-md w-full max-w-[440px] mb-4 mt-4 text-sm"
                  role="alert"
                >
                  <AlertCircle className="size-4 shrink-0" /> {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="flex justify-between items-center p-4 px-8 border-t border-border max-md:px-6 max-md:py-3 max-md:flex-wrap max-md:gap-2">
          <div className="flex items-center">
            {currentStep > 1 && (
              <Button variant="ghost" onClick={goBack}>
                <ChevronLeft className="size-4" /> Zurück
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
              title="Einrichtung überspringen (für erfahrene Admins)"
              className="text-xs opacity-70 hover:opacity-100"
            >
              <SkipForward className="size-3.5" /> Überspringen
            </Button>

            {currentStep < 6 ? (
              <Button variant="solid" onClick={goNext} disabled={!canAdvance()}>
                Weiter <ChevronRight className="size-4" />
              </Button>
            ) : (
              <Button variant="solid" onClick={handleComplete} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Wird abgeschlossen...
                  </>
                ) : (
                  <>
                    <Check className="size-4" /> Einrichtung abschließen
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SetupWizard;
