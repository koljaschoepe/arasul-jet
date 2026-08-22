/**
 * Wie ein Agent-Schritt auf Deutsch heisst (Plan 023 E3).
 *
 * Stand bis zum 22.08.2026 mitten in `CompactMessage.tsx`. Die Denkzeile
 * braucht dieselben Saetze, und zwei Kopien davon liefen sicher auseinander:
 * das Panel haette "liest kapitel-01.md" gesagt und der Verlauf etwas anderes.
 *
 * Die Saetze sind bewusst Verben in der dritten Person ("liest", "schreibt",
 * "sucht im Web"), damit sie sowohl hinter einem Punkt in der Schrittliste als
 * auch hinter dem Namen des Geraets in der Denkzeile gelesen werden koennen.
 */
import { FileText, Globe, ListTodo, Search, Sparkles, TerminalSquare, Wrench } from 'lucide-react';
import type { AgentToolStep } from '@/contexts/ChatContext';

/** Kompakte deutsche Beschriftung eines Werkzeug-Schritts aus Name + Parametern. */
export function agentStepLabel(step: AgentToolStep): string {
  const p = step.params || {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  if (step.kind === 'plan') {
    return step.status === 'running' ? 'erstellt einen Plan' : 'Plan erstellt';
  }
  if (step.kind === 'todos') {
    return 'aktualisiert die Aufgabenliste';
  }
  if (step.kind === 'subagent') {
    return step.status === 'running' ? `Helfer „${step.tool}" arbeitet` : `Helfer „${step.tool}"`;
  }
  switch (step.tool) {
    case 'dateien':
    case 'dateien_lesen': {
      const aktion = str(p.aktion).toLowerCase();
      const pfad = str(p.pfad) || '/';
      if (aktion === 'read') return `liest ${pfad}`;
      if (aktion === 'write') return `schreibt ${pfad}`;
      if (aktion === 'list') return `listet ${pfad}`;
      return `Dateien: ${pfad}`;
    }
    case 'dateien_schreiben':
      return `schreibt ${str(p.pfad) || 'Datei'}`;
    case 'dateien_bearbeiten':
      return `ändert ${str(p.pfad) || 'Datei'}`;
    case 'dateien_anhaengen':
      return `ergänzt ${str(p.pfad) || 'Datei'}`;
    case 'todo_liste':
      return 'aktualisiert die Aufgabenliste';
    case 'dateien_suchen': {
      const muster = str(p.muster) || str(p.text) || str(p.suchbegriff) || str(p.query);
      return muster ? `sucht Dateien: ${muster}` : 'durchsucht Dateien';
    }
    case 'rag':
    case 'rag_suche': {
      const q = str(p.frage) || str(p.query);
      return q ? `sucht im Wissen: ${q}` : 'durchsucht das Wissen';
    }
    case 'web_suche': {
      const q = str(p.frage) || str(p.query) || str(p.suchbegriff);
      return q ? `sucht im Web: ${q}` : 'sucht im Web';
    }
    case 'web_lesen':
      return `liest ${str(p.adresse) || str(p.url) || 'eine Webseite'}`;
    case 'terminal': {
      const cmd = str(p.befehl) || str(p.command);
      return cmd ? `führt aus: ${cmd}` : 'führt einen Befehl aus';
    }
    default:
      return `nutzt ${step.tool || 'Werkzeug'}`;
  }
}

export function agentStepIcon(step: AgentToolStep): React.ReactNode {
  if (step.kind === 'plan' || step.kind === 'todos') {
    return <ListTodo className="size-3" />;
  }
  if (step.kind === 'subagent') {
    return <Sparkles className="size-3" />;
  }
  switch (step.tool) {
    case 'dateien':
    case 'dateien_lesen':
    case 'dateien_schreiben':
    case 'dateien_bearbeiten':
    case 'dateien_anhaengen':
    case 'dateien_suchen':
      return <FileText className="size-3" />;
    case 'todo_liste':
      return <ListTodo className="size-3" />;
    case 'rag':
    case 'rag_suche':
    case 'web_suche':
      return <Search className="size-3" />;
    case 'web_lesen':
      return <Globe className="size-3" />;
    case 'terminal':
      return <TerminalSquare className="size-3" />;
    default:
      return <Wrench className="size-3" />;
  }
}
