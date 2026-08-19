import { useCallback, useEffect, useRef } from 'react';
import { AlertTriangle, PowerOff } from 'lucide-react';
import { API_BASE } from '@/config/api';
import { useApi } from '@/hooks/useApi';
import { useExtensions } from '@/hooks/useExtensions';

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
 *
 * KI-Brücke (Plan 017 Schritt 2): Diese (authentifizierte) Seite holt einen
 * kurzlebigen Brücken-Token und reicht ihn der App per postMessage. Die App
 * (arasul-bruecke.js) ruft damit `/api/extensions/:id/bruecke/*` auf — das
 * Backend prüft Token + freigegebene Fähigkeit bei jedem Aufruf. Läuft die
 * Brücke nicht (deaktiviert, keine Fähigkeiten), bleibt die App einfach ohne.
 */

interface BrueckeTokenResponse {
  // null, wenn die Erweiterung deaktiviert ist (reguläre Antwort, kein Fehler).
  token: string | null;
  expiresInMs: number;
  faehigkeiten: string[];
}

export default function ExtensionAppTab({
  extensionId,
  title,
}: {
  extensionId: string;
  title: string;
}) {
  const api = useApi();
  const { extensions, isLoading: erweiterungenLaden } = useExtensions();
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const sendeToken = useCallback(async () => {
    const frame = frameRef.current;
    if (!frame?.contentWindow || !extensionId) {
      return;
    }
    try {
      const data = await api.post<BrueckeTokenResponse>(
        `/extensions/${encodeURIComponent(extensionId)}/bruecke/token`,
        {},
        { showError: false }
      );
      // Deaktivierte Erweiterung → kein Token (Backend antwortet regulär mit
      // token:null, F-02). Dann nichts an die App schicken; sie läuft ohne Brücke.
      if (!data.token) {
        return;
      }
      // Der iframe hat einen opaken Origin — gezieltes targetOrigin ist nicht
      // möglich, '*' ist hier korrekt. Der Token ist kurzlebig und nur für
      // die Brücken-Routen dieser einen Erweiterung gültig.
      frame.contentWindow.postMessage(
        {
          typ: 'arasul-bruecke-token',
          token: data.token,
          extensionId,
          apiBase: API_BASE,
          faehigkeiten: data.faehigkeiten,
        },
        '*'
      );
    } catch {
      // Brücke deaktiviert / Erweiterung ohne Freigabe — die App läuft ohne.
    }
  }, [api, extensionId]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (
        ev.source === frameRef.current?.contentWindow &&
        (ev.data as { typ?: string } | null)?.typ === 'arasul-bruecke-token-anfrage'
      ) {
        void sendeToken();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [sendeToken]);

  if (!extensionId) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-text-secondary">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm">Keine Erweiterung angegeben.</p>
      </div>
    );
  }

  // Der Schalter im Katalog schaltet seit dem 19.08.2026 auch die Auslieferung
  // ab (403). Ohne diesen Hinweis stünde im Tab die rohe Fehlerantwort — der
  // Nutzer hat die Erweiterung aber selbst ausgeschaltet und soll lesen, wo er
  // sie wieder einschaltet. Solange die Liste noch lädt, wird der iframe NICHT
  // gebaut: sonst blitzt beim Öffnen eines Tabs einmal die rohe 403-Antwort auf,
  // bevor die Antwort da ist.
  const eintrag = extensions.find(e => e.id === extensionId);
  if (erweiterungenLaden && !eintrag) {
    return <div className="h-full w-full bg-background" aria-busy="true" />;
  }
  if (eintrag && !eintrag.enabled) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-background px-6 text-center text-text-secondary">
        <PowerOff className="h-8 w-8" aria-hidden="true" />
        <p className="text-sm">
          {`„${eintrag.name}“ ist deaktiviert. Unter Erweiterungen wieder einschalten.`}
        </p>
      </div>
    );
  }

  const src = `${API_BASE}/extensions/${encodeURIComponent(extensionId)}/app/`;

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title || 'Erweiterung'}
      sandbox="allow-scripts allow-popups allow-forms"
      data-testid="extension-frame"
      onLoad={() => void sendeToken()}
      // Weißer Zeichengrund wie im Browser — App-HTML erwartet das, unabhängig
      // vom Dashboard-Theme.
      className="h-full w-full border-0 bg-white"
    />
  );
}
