import { AlertTriangle } from 'lucide-react';
import { API_BASE } from '@/config/api';

/**
 * ExtensionAppTab (Plan 012 Batch 3) — rendert die Oberfläche einer installierten
 * App-Erweiterung „in der Mitte", genau wie der n8n-Tab: ein same-origin-iframe
 * auf `GET /api/extensions/:id/app/`. Das Backend liefert die Startdatei des
 * Pakets aus; die Auth trägt das `arasul_session`-Cookie (same-origin), das ein
 * iframe automatisch mitschickt.
 *
 * Der iframe ist doppelt eingesperrt: das `sandbox`-Attribut hier UND die
 * CSP-`sandbox`-Direktive der Antwort. Ohne `allow-same-origin` bekommt die
 * Erweiterung einen eigenen, opaken Origin — ihre Skripte laufen, kommen aber
 * nicht an das Dashboard, seine Cookies oder die API.
 */
export default function ExtensionAppTab({
  extensionId,
  title,
}: {
  extensionId: string;
  title: string;
}) {
  if (!extensionId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-text-secondary">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm">Keine Erweiterung angegeben.</p>
      </div>
    );
  }

  const src = `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/app/`;

  return (
    <iframe
      src={src}
      title={title || 'Erweiterung'}
      sandbox="allow-scripts allow-popups allow-forms"
      data-testid="extension-frame"
      // Weißer Zeichengrund wie im Browser — App-HTML erwartet das, unabhängig
      // vom Dashboard-Theme.
      className="h-full w-full border-0 bg-white"
    />
  );
}
