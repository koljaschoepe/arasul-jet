/**
 * Die Begriffsliste des Geräts (J35, 26.09.2026).
 *
 * Ein Administrator einer Kanzlei ist kein Entwickler. Ein englisches
 * Technikwort oder ein Wort, das an einer Stelle „Sicherung" und an der
 * nächsten „Backup" heißt, lässt das Gerät unfertig wirken -- und wer zwei
 * Wörter liest, sucht zwei Dinge. Deshalb steht hier je Sache EIN Wort, und
 * daneben, was an seiner Stelle nicht mehr stehen soll.
 *
 * Gemessen wird das von `__tests__/begriffe.test.ts`: er liest jeden
 * sichtbaren Text der Shell und der Bibliothek (JSX-Text und
 * Zeichenketten mit Leerzeichen) und meldet jedes Wort aus `statt` sowie
 * jede Umschreibung eines Umlauts (ae/oe/ue). Die Liste ist die Quelle; wer
 * ein Wort ergänzt, ergänzt es hier.
 */
export interface Begriff {
  /** Das Wort, das gilt. */
  wort: string;
  /** Was es bedeutet, in einem Satz. */
  bedeutung: string;
  /** Wörter, die an seiner Stelle nicht mehr sichtbar sein sollen. */
  statt: string[];
}

export const BEGRIFFE: Begriff[] = [
  {
    wort: 'Sicherung',
    bedeutung: 'Eine Kopie aller Daten des Geräts, aus der es sich wiederherstellen lässt.',
    statt: ['Backup', 'Backups'],
  },
  {
    wort: 'Wiederherstellungstest',
    bedeutung: 'Die Probe, ob sich eine Sicherung wirklich zurückspielen lässt.',
    statt: ['Restore-Drill', 'Restore-Test', 'Restore'],
  },
  {
    wort: 'Mitarbeiter',
    bedeutung: 'Ein Mensch mit einem Konto an diesem Gerät.',
    statt: ['User', 'Nutzer'],
  },
  {
    wort: 'Fassung',
    bedeutung: 'Welcher Stand der Software auf dem Gerät oder in einer App läuft.',
    statt: ['Version', 'Build'],
  },
  {
    wort: 'Test und Live',
    bedeutung:
      'Die zwei Stände einer App: Test sehen nur die Tester, Live sehen alle, denen die App freigegeben ist.',
    statt: ['Staging', 'Livestand', 'Teststand'],
  },
  {
    wort: 'Warnungen',
    bedeutung: 'Was das Gerät meldet, weil jemand nachsehen sollte.',
    statt: ['Alerts', 'Alarme', 'Warnings'],
  },
  {
    wort: 'Dienste',
    bedeutung: 'Die Teile des Geräts, die im Hintergrund laufen.',
    statt: ['Services', 'Service'],
  },
  {
    wort: 'Selbstheilung',
    bedeutung: 'Das Gerät startet einen Dienst selbst neu, wenn er hängt.',
    statt: ['Self-Healing'],
  },
  {
    wort: 'Aktualisierung',
    bedeutung: 'Eine neue Fassung, die auf das Gerät kommt.',
    statt: ['Update', 'Updates', 'Upload'],
  },
  {
    wort: 'Protokoll',
    bedeutung: 'Was ein Dienst oder eine App über sich aufschreibt.',
    statt: ['Logs', 'Log', 'Event-Log'],
  },
  {
    wort: 'App',
    bedeutung: 'Ein Wort für alles, was auf dem Gerät läuft und ein Mensch benutzt.',
    statt: ['Container', 'Volumes'],
  },
  {
    wort: 'Oberfläche',
    bedeutung: 'Was ein Mensch im Browser sieht.',
    statt: ['Dashboard', 'Frontend', 'UI'],
  },
  {
    wort: 'Server-Teil',
    bedeutung: 'Der Teil einer App, der auf dem Gerät rechnet und ihre Daten hält.',
    statt: ['Backend'],
  },
  {
    wort: 'Speicher für KI',
    bedeutung: 'Der Teil des Arbeitsspeichers, den die Modelle belegen dürfen.',
    statt: ['RAM'],
  },
  {
    wort: 'Herunterladen',
    bedeutung: 'Ein Modell oder ein Paket auf das Gerät holen.',
    statt: ['Download', 'Pull'],
  },
];
