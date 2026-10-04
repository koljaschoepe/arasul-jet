/**
 * „Über Arasul" als Fußzeile des Bereichs Gerät (M5, `frontend.md`).
 *
 * Bis M5 stand das als eigener Abschnitt im Bereich „Allgemein", mit drei
 * Werbesätzen, einer Kachel „Systeminformationen" (Fassung, Gerätename,
 * Laufzeit) und einer Begriffsliste. Die Fassung stand damit doppelt: dort
 * und unter Aktualisierungen. Jetzt steht sie EINMAL, bei der Aktualisierung;
 * hier steht, was niemand sucht, aber jeder einmal braucht: wie das Gerät
 * heißt, seit wann es läuft, wen man fragt. Bau und JetPack sind Technik und
 * stehen aufgeklappt.
 */
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@/hooks/useApi';
import { PLATFORM_NAME, SUPPORT_EMAIL } from '@/config/branding';
import { formatUptime } from '@/utils/formatting';
import { TechnischeAngaben } from '@/features/system/TechnischeAngaben';

interface SystemInfo {
  version: string;
  hostname: string;
  jetpack_version: string;
  uptime_seconds: number;
  build_hash: string;
}

export function UeberArasul() {
  const api = useApi();
  const { data: info } = useQuery({
    queryKey: ['system', 'info'],
    queryFn: () => api.get<SystemInfo>('/system/info', { showError: false }),
    staleTime: 60_000,
    retry: false,
  });

  return (
    <footer
      className="flex flex-col gap-1 pt-2 text-xs text-muted-foreground"
      data-testid="ueber-arasul"
    >
      <p>
        Über {PLATFORM_NAME}: läuft auf diesem Gerät im Haus und hostet Ihre Apps; Daten, Modelle
        und Protokolle verlassen es nicht.
        {info && (
          <>
            {' '}
            Gerätename <span className="font-mono">{info.hostname}</span>, läuft seit{' '}
            {formatUptime(info.uptime_seconds)}.
          </>
        )}{' '}
        Unterstützung:{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary hover:underline">
          {SUPPORT_EMAIL}
        </a>
      </p>
      {info && (
        <TechnischeAngaben
          kennzeichen="ueber-technik"
          angaben={[
            { beschriftung: 'Versionskennung', wert: info.version },
            { beschriftung: 'Bau', wert: info.build_hash },
            { beschriftung: 'JetPack', wert: info.jetpack_version },
          ]}
        />
      )}
    </footer>
  );
}
