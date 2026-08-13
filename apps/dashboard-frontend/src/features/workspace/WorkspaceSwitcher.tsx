import { useState } from 'react';
import {
  Boxes,
  BookOpen,
  Check,
  ChevronDown,
  FileText,
  Headphones,
  Landmark,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/shadcn/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/shadcn/dialog';
import { Input } from '@/components/ui/shadcn/input';
import { Label } from '@/components/ui/shadcn/label';
import { Textarea } from '@/components/ui/shadcn/textarea';
import { Button } from '@/components/ui/shadcn/button';
import { useRef } from 'react';
import { ConfirmModal } from '@/components/ui/Modal';
import { LayoutGrid } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { useApi } from '@/hooks/useApi';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import {
  useProjects,
  useActiveProject,
  useProjectVorlagen,
  type Project,
  type ProjektVorlage,
} from './useProjects';

/** Lucide-Symbol je Vorlagen-Icon-Name — unbekannte Namen fallen auf Boxes zurück. */
const VORLAGEN_ICONS: Record<string, LucideIcon> = {
  users: Users,
  'book-open': BookOpen,
  headphones: Headphones,
  landmark: Landmark,
  'file-text': FileText,
};

function vorlagenIcon(name: string): LucideIcon {
  return VORLAGEN_ICONS[name] ?? Boxes;
}

/**
 * Projekt-Switcher (Workspace-Neuausrichtung Batch 2) — prominenter Umschalter
 * oben in der Shell. Ein Projekt ist die oberste Ebene über den Ordnern; der
 * Wechsel bestimmt, welche Ordner der Explorer zeigt und worüber Suche/Agenten
 * laufen. Über „Neues Projekt" wird ein Projekt angelegt und direkt aktiviert.
 */
export function WorkspaceSwitcher() {
  const toast = useToast();
  const api = useApi();
  const { projects, createProject, deleteProject } = useProjects();
  const { activeProject, setActive } = useActiveProject();
  const openTab = useWorkspaceStore(s => s.openTab);

  const [dialogOffen, setDialogOffen] = useState(false);
  const [name, setName] = useState('');
  const [beschreibung, setBeschreibung] = useState('');
  // Vorlagen-Galerie (Plan 014, Phase 1): null = leeres Projekt.
  const [vorlage, setVorlage] = useState<ProjektVorlage | null>(null);
  const { vorlagen } = useProjectVorlagen(dialogOffen);
  // Einrichtungs-Interview (Plan 014, Phase 3): nach der Anlage aus einer
  // Vorlage sammelt ein zweiter Schritt Firmendaten + optional den ersten
  // Kunden und stößt die (voll autonome) Web-Recherche der Projekt-Flows an.
  const [einrichtung, setEinrichtung] = useState<{ projektId: string; name: string } | null>(null);
  const [firmenname, setFirmenname] = useState('');
  const [firmenWebseite, setFirmenWebseite] = useState('');
  const [einrichtungHinweise, setEinrichtungHinweise] = useState('');
  const [kundeName, setKundeName] = useState('');
  const [kundeWebseite, setKundeWebseite] = useState('');
  const [logoDatei, setLogoDatei] = useState<File | null>(null);
  const [richtetEin, setRichtetEin] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  // Zu löschendes Projekt (öffnet den Bestätigungsdialog). Das Standard-Projekt
  // ist nie hier — es lässt sich nicht löschen (Backend + fehlender Knopf).
  const [loeschZiel, setLoeschZiel] = useState<Project | null>(null);

  const label = activeProject?.name ?? 'Standard';

  const loeschen = async () => {
    if (!loeschZiel) return;
    const ziel = loeschZiel;
    try {
      await deleteProject.mutateAsync(ziel.id);
      toast.success(`Projekt „${ziel.name}" gelöscht`);
      setLoeschZiel(null);
    } catch (err) {
      // 409 (enthält noch Ordner) / 403 (Standard) tragen eine klare Meldung.
      toast.error(err instanceof Error ? err.message : 'Projekt konnte nicht gelöscht werden');
      setLoeschZiel(null);
    }
  };

  const anlegen = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const res = await createProject.mutateAsync({
        name: trimmed,
        description: beschreibung.trim() || null,
        vorlage: vorlage?.id ?? null,
      });
      await setActive.mutateAsync(res.data.id);
      toast.success(
        vorlage
          ? `Projekt „${trimmed}" aus Vorlage „${vorlage.name}" angelegt und aktiviert`
          : `Projekt „${trimmed}" angelegt und aktiviert`
      );
      // CRM-Vorlage: direkt ins Einrichtungs-Interview wechseln (Phase 3) —
      // der Dialog bleibt offen und sammelt Firmendaten + ersten Kunden.
      if (vorlage?.id === 'kunden-auftraege') {
        setEinrichtung({ projektId: res.data.id, name: trimmed });
      } else {
        setDialogOffen(false);
      }
      setName('');
      setBeschreibung('');
      setVorlage(null);
    } catch {
      toast.error('Projekt konnte nicht angelegt werden');
    }
  };

  const einrichtungSchliessen = () => {
    setDialogOffen(false);
    setEinrichtung(null);
    setFirmenname('');
    setFirmenWebseite('');
    setEinrichtungHinweise('');
    setKundeName('');
    setKundeWebseite('');
    setLogoDatei(null);
  };

  const einrichten = async () => {
    if (!einrichtung) return;
    setRichtetEin(true);
    try {
      // 1. Logo/Briefkopf-Datei in die Vorlagen-Ablage des Projekts.
      if (logoDatei) {
        const form = new FormData();
        form.append('file', logoDatei);
        form.append('ordner', '_Vorlagen');
        await api.post(`/projects/${einrichtung.projektId}/dateien/upload`, form, {
          showError: false,
        });
      }
      // 2. Einrichtungs-Flow: recherchiert die eigene Webseite voll autonom
      //    und füllt Firmenprofil + Briefkopf (Projekt-Flow der Vorlage).
      let gestartet = 0;
      if (firmenname.trim() && firmenWebseite.trim()) {
        await api.post('/flows/laeufe', {
          flow: 'einrichtung',
          projekt: einrichtung.projektId,
          args: {
            firmenname: firmenname.trim(),
            webseite: firmenWebseite.trim(),
            ...(einrichtungHinweise.trim() ? { hinweise: einrichtungHinweise.trim() } : {}),
          },
        });
        gestartet += 1;
      }
      // 3. Optional: den ersten Kunden anlegen (autonome Web-Recherche).
      if (kundeName.trim() && kundeWebseite.trim()) {
        await api.post('/flows/laeufe', {
          flow: 'neuer-kunde',
          projekt: einrichtung.projektId,
          args: { firma: kundeName.trim(), webseite: kundeWebseite.trim() },
        });
        gestartet += 1;
      }
      toast.success(
        gestartet > 0
          ? 'Einrichtung gestartet — der Fortschritt ist in der Flow-Zentrale und im Chat sichtbar'
          : 'Einrichtung übersprungen — jederzeit im Chat mit /einrichtung nachholbar'
      );
      einrichtungSchliessen();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Einrichtung konnte nicht gestartet werden');
    } finally {
      setRichtetEin(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-6 max-w-56 items-center gap-1.5 rounded px-2 text-xs font-medium text-foreground transition-colors hover:bg-accent data-[state=open]:bg-accent"
          aria-label="Projekt wechseln"
          title="Projekt wechseln"
        >
          <Boxes className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 truncate">{label}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Projekt</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openTab({ type: 'projekte' })}>
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Projekt-Übersicht öffnen
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projects.length === 0 && <DropdownMenuItem disabled>Keine Projekte</DropdownMenuItem>}
          {projects.map(project => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => setActive.mutate(project.id)}
              disabled={setActive.isPending}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: project.color ?? 'var(--muted-foreground)' }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="shrink-0 text-ui-xs tabular-nums text-muted-foreground">
                {project.folder_count}
              </span>
              {activeProject?.id === project.id && (
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              )}
              {!project.is_default && (
                <button
                  type="button"
                  aria-label={`Projekt „${project.name}" löschen`}
                  title="Projekt löschen"
                  // stopPropagation verhindert, dass der Zeilen-Klick (onSelect)
                  // gleichzeitig das Projekt aktiviert — Radix ruft onSelect über
                  // denselben onClick, den wir hier stoppen.
                  onClick={e => {
                    e.stopPropagation();
                    setLoeschZiel(project);
                  }}
                  className="ml-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialogOffen(true)}>
            <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            Neues Projekt …
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={dialogOffen}
        onOpenChange={offen => {
          setDialogOffen(offen);
          if (!offen) setEinrichtung(null);
        }}
      >
        {einrichtung ? (
          <DialogContent className="sm:max-w-lg" data-testid="einrichtung-dialog">
            <DialogHeader>
              <DialogTitle>„{einrichtung.name}&ldquo; einrichten</DialogTitle>
              <DialogDescription>
                Deine Webseite wird automatisch ausgewertet und füllt Firmenprofil und Briefkopf —
                optional legst du gleich den ersten Kunden an (auch der wird selbstständig im Web
                recherchiert).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-1">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="einr-firma">Firmenname</Label>
                  <Input
                    id="einr-firma"
                    value={firmenname}
                    onChange={e => setFirmenname(e.target.value)}
                    placeholder="z. B. Muster GmbH"
                    maxLength={120}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="einr-webseite">Firmen-Webseite</Label>
                  <Input
                    id="einr-webseite"
                    value={firmenWebseite}
                    onChange={e => setFirmenWebseite(e.target.value)}
                    placeholder="https://www.muster.de"
                    maxLength={300}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="einr-hinweise">Hinweise für Dokumente (optional)</Label>
                <Textarea
                  id="einr-hinweise"
                  value={einrichtungHinweise}
                  onChange={e => setEinrichtungHinweise(e.target.value)}
                  placeholder="z. B. Schwerpunkte, Ansprache, Besonderheiten"
                  rows={2}
                  className="resize-y"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Logo / Briefkopf-Datei (optional)</Label>
                <input
                  ref={logoInputRef}
                  type="file"
                  className="hidden"
                  data-testid="einr-logo-input"
                  onChange={e => setLogoDatei(e.target.files?.[0] ?? null)}
                />
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    Datei wählen …
                  </Button>
                  <span className="min-w-0 truncate text-ui-xs text-muted-foreground">
                    {logoDatei ? logoDatei.name : 'wird unter _Vorlagen/ abgelegt'}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="einr-kunde">Erster Kunde (optional)</Label>
                  <Input
                    id="einr-kunde"
                    value={kundeName}
                    onChange={e => setKundeName(e.target.value)}
                    placeholder="Firmenname des Kunden"
                    maxLength={120}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="einr-kunde-web">Webseite des Kunden</Label>
                  <Input
                    id="einr-kunde-web"
                    value={kundeWebseite}
                    onChange={e => setKundeWebseite(e.target.value)}
                    placeholder="https://www.kunde.de"
                    maxLength={300}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={einrichtungSchliessen} disabled={richtetEin}>
                Später
              </Button>
              <Button
                onClick={einrichten}
                disabled={richtetEin || (!firmenname.trim() && !kundeName.trim() && !logoDatei)}
                data-testid="einrichtung-starten"
              >
                {richtetEin ? 'Startet …' : 'Einrichten starten'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Neues Projekt</DialogTitle>
              <DialogDescription>
                Starte leer — oder mit einer fertigen Vorlage: Sie bringt Ordnerstruktur,
                Wissens-Dateien und passende Flows gleich mit.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-1">
              {vorlagen.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label>Vorlage</Label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      data-testid="vorlage-leer"
                      onClick={() => setVorlage(null)}
                      className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
                        vorlage === null
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:border-primary/40'
                      }`}
                    >
                      <Boxes
                        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">
                          Leeres Projekt
                        </span>
                        <span className="block text-ui-xs text-muted-foreground">
                          Ohne Struktur starten — alles selbst aufbauen.
                        </span>
                      </span>
                    </button>
                    {vorlagen.map(v => {
                      const Icon = vorlagenIcon(v.icon);
                      const aktiv = vorlage?.id === v.id;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          data-testid={`vorlage-${v.id}`}
                          onClick={() => setVorlage(v)}
                          className={`flex items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
                            aktiv
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/40'
                          }`}
                        >
                          <Icon
                            className={`mt-0.5 h-4 w-4 shrink-0 ${aktiv ? 'text-primary' : 'text-muted-foreground'}`}
                            aria-hidden="true"
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {v.name}
                            </span>
                            <span className="line-clamp-2 block text-ui-xs text-muted-foreground">
                              {v.beschreibung}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projekt-name">Name</Label>
                <Input
                  id="projekt-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z. B. Marketing"
                  maxLength={100}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void anlegen();
                    }
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="projekt-beschreibung">Beschreibung (optional)</Label>
                <Textarea
                  id="projekt-beschreibung"
                  value={beschreibung}
                  onChange={e => setBeschreibung(e.target.value)}
                  placeholder="Wofür ist dieses Projekt?"
                  rows={2}
                  className="resize-y"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOffen(false)}>
                Abbrechen
              </Button>
              <Button onClick={anlegen} disabled={!name.trim() || createProject.isPending}>
                {createProject.isPending ? 'Legt an …' : 'Anlegen & aktivieren'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <ConfirmModal
        isOpen={loeschZiel !== null}
        onClose={() => setLoeschZiel(null)}
        onConfirm={loeschen}
        title="Projekt löschen"
        message={`Das Projekt „${loeschZiel?.name ?? ''}" wirklich löschen? Ordner müssen zuvor entfernt oder verschoben sein. Dies kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        confirmVariant="danger"
        isLoading={deleteProject.isPending}
      />
    </>
  );
}
