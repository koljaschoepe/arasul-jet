/**
 * Das Wörterbuch der englischen Demo (J46, M7): sichtbare Sätze der Shell und
 * der Werkstatt (bis J52 Entwickler-Cockpit) auf dem Weg der Demo, Deutsch → Englisch.
 *
 * Gesammelt am fertigen Bau (`node demo/abnahme.mjs --sammeln`) und aus den
 * Quellen der Ansichten, die der Weg berührt (Startseite, Rahmen mit
 * Rückmeldung, Werkstatt, Einstellungen, Terminal). Ein Satz, der hier fehlt,
 * bleibt deutsch; `woerterbuch.test.ts` hält die gemessenen fest.
 *
 * Die Beispieldaten (`daten.ts`) stehen mit drin: Meldungen, Abteilungen und
 * Änderungstexte sind deutsch angelegt, wie sie am Gerät eines deutschen
 * Mittelständlers stünden.
 */
export const WOERTER: Record<string, string> = {
  // Shell: Leiste, Startseite, Statuszeile
  Aktivitätsleiste: 'Activity bar',
  Startseite: 'Home',
  Start: 'Home',
  Einstellungen: 'Settings',
  Verwaltung: 'Administration',
  Terminal: 'Terminal',
  Mehr: 'More',
  Logo: 'Logo',
  App: 'App',
  Apps: 'Apps',
  Abmelden: 'Sign out',
  Administrator: 'Administrator',
  Mitarbeiter: 'Employee',
  'Guten Tag': 'Hello',
  'Alles erledigt': 'All done',
  'Alles erledigt, keine Freigabe wartet auf Sie.': 'All done, no approval is waiting for you.',
  'Ihre Apps': 'Your apps',
  'Für Sie': 'For you',
  'Eine Freigabe erteilen': 'Approve something',
  'Rückmeldung geben': 'Give feedback',
  'Eine App öffnen': 'Open an app',
  'Den Store ansehen': 'Look at the store',
  'Noch nichts geöffnet. Im Store finden Sie Ihre Apps.':
    'Nothing opened yet. Find your apps in the store.',
  'Keine Freigabe liegt bei Ihnen.': 'No approval is waiting for you.',
  'Keine offene Freigabe': 'No open approval',
  '1 Freigabe offen': '1 approval open',
  'Eine Freigabe wartet auf Sie': 'One approval is waiting for you',
  'Noch keine App für Sie': 'No app for you yet',
  'Ein Administrator gibt Apps für einzelne Menschen frei. Sobald eine für Sie dabei ist, steht sie hier und in der Leiste.':
    'An administrator assigns apps to people. As soon as one is assigned to you, it appears here and in the bar.',
  'Die App wird geöffnet …': 'Opening the app …',
  'Wird geladen …': 'Loading …',
  'Diese App': 'This app',
  'Zurzeit steht nur der Test bereit. Sobald die App live geschaltet ist, steht sie hier.':
    'Only the test version is ready. As soon as the app is live, it appears here.',
  'Diese Adresse zeigt auf keine App.': 'This address does not point to an app.',

  // Rückmeldung im Rahmen
  'Rückmeldung zu dieser Seite': 'Feedback on this page',
  'Was fehlt oder stimmt nicht?': 'What is missing or wrong?',
  'Zum Beispiel: Hier fehlt ein Filter nach Monat.':
    'For example: a filter by month is missing here.',
  'Bildschirmfoto mitschicken': 'Include screenshot',
  'Ziehen Sie auf dem Bild einen Rahmen um die Stelle, oder tippen Sie darauf.':
    'Drag a frame around the spot on the image, or tap it.',
  'Das Bildschirmfoto ließ sich nicht aufnehmen. Ihre Rückmeldung geht ohne Bild.':
    'The screenshot could not be taken. Your feedback is sent without an image.',
  'Mit der Rückmeldung gehen App, Seite, Ihr Name und die Uhrzeit mit. Gespeichert wird auf diesem Gerät.':
    'App, page, your name and the time are sent with your feedback. It is stored on this server.',
  'Bildschirmfoto der Seite': 'Screenshot of the page',
  Abbrechen: 'Cancel',
  Absenden: 'Send',
  'Sendet …': 'Sending …',
  Danke: 'Thank you',
  'Ihre Rückmeldung ist angekommen. Sie steht mit ihrem Stand in der Werkstatt.':
    'Your feedback has arrived. You will find it with its status in the Workshop.',
  Schließen: 'Close',
  'Dialog schließen': 'Close dialog',

  // Werkstatt (bis J52 Entwickler-Cockpit); das Wort selbst steht bei den
  // Beispieldaten, es war dort vorher eine Abteilung.
  'Meine Meldungen': 'My feedback',
  Gemeldet: 'Reported',
  'Noch keine Meldung von Ihnen': 'No feedback from you yet',
  'Fehlt in einer App etwas oder stimmt etwas nicht, tippen Sie dort oben rechts auf das Icon. Ihre Meldung steht danach hier, mit Stand.':
    'If something is missing or wrong in an app, tap the icon at the top right there. Your feedback then appears here, with its status.',
  'Ihre Meldungen ließen sich nicht laden.': 'Your feedback could not be loaded.',
  'Die Werkstatt ließ sich nicht laden.': 'The workshop could not be loaded.',
  'Ihre Meldung ist angekommen und noch nicht bearbeitet.':
    'Your feedback has arrived and has not been handled yet.',
  'Ihre Meldung ist angenommen und wird umgesetzt.':
    'Your feedback has been accepted and will be implemented.',
  'Ihre Meldung ist umgesetzt.': 'Your feedback has been implemented.',
  'Ihre Meldung wird nicht umgesetzt.': 'Your feedback will not be implemented.',
  'Grund der Ablehnung': 'Reason for declining',
  Anmerkung: 'Note',
  'App-Betreuung': 'App support',
  'Neu laden': 'Reload',
  Eingang: 'Inbox',
  'Test nach Live': 'Test to live',
  'Seitenleiste umschalten': 'Toggle sidebar',
  Rückmeldungen: 'Feedback',
  Meldung: 'Feedback',
  Meldungen: 'Feedback',
  Foto: 'Photo',
  Stand: 'Status',
  Von: 'From',
  Alle: 'All',
  'Alle Apps': 'All apps',
  'Offen (neu und angenommen)': 'Open (new and accepted)',
  Neu: 'New',
  Angenommen: 'Accepted',
  Umgesetzt: 'Done',
  Abgelehnt: 'Declined',
  'mit Foto': 'with photo',
  ohne: 'without',
  'in diesem Filter': 'in this filter',
  'Nichts in diesem Filter': 'Nothing in this filter',
  'Wählen Sie oben eine andere App oder einen anderen Stand.':
    'Choose a different app or status above.',
  'Noch keine Rückmeldung': 'No feedback yet',
  'Sobald jemand in einer App auf das Icon oben rechts tippt und absendet, steht es hier.':
    'As soon as someone taps the icon at the top right of an app and sends it, it appears here.',
  'Die Rückmeldungen ließen sich nicht laden.': 'The feedback could not be loaded.',
  'Bildschirmfoto groß zeigen': 'Show screenshot large',
  'Bildschirmfoto kleiner': 'Show screenshot smaller',
  'Bildschirmfoto mit markierter Stelle': 'Screenshot with marked spot',
  'Ohne Bildschirmfoto.': 'Without screenshot.',
  'Grund (frei)': 'Reason (optional)',
  'Grund (Pflicht beim Ablehnen)': 'Reason (required when declining)',
  'Wer ablehnt, schreibt dazu, warum.': 'Whoever declines writes down why.',
  'Wer gemeldet hat, sieht Stand und Grund in der eigenen Werkstatt.':
    'The person who reported it sees the status and reason in their own workshop.',
  'Stand speichern': 'Save status',
  Entfernen: 'Remove',
  'Rückmeldung entfernen?': 'Remove feedback?',
  'Text und Bildschirmfoto gehen vom Gerät. In älteren Sicherungen bleiben sie, bis diese ablaufen.':
    'Text and screenshot are removed from the server. They remain in older backups until those expire.',
  'Gelöschte Person': 'Deleted person',
  Live: 'Live',
  live: 'live',
  Test: 'Test',
  'Offene Meldungen': 'Open feedback',
  'Zuletzt geändert': 'Last changed',
  'nichts im Test': 'nothing in test',
  'kommt mit Arasul': 'comes with Arasul',
  'mit dem Gerät': 'with the server',
  'Noch keine App am Gerät': 'No app on the server yet',
  'Eine App kommt mit dem Kit in den Test und steht dann hier.':
    'An app reaches test via the kit and then appears here.',
  'Die Apps ließen sich nicht laden.': 'The apps could not be loaded.',
  'neuer als live': 'newer than live',
  Eingespielt: 'Installed',
  'Was in der Testfassung neuer ist als live. Ein Klick schaltet live, mit Sicherung vorher und Rückweg.':
    'What is newer in the test version than live. One click switches it live, with a backup first and a way back.',
  'Live schalten': 'Switch live',
  'Sichert und schaltet…': 'Backing up and switching…',
  'Lädt die Fassungen…': 'Loading versions…',
  'Alles ist live': 'Everything is live',
  'Keine App hat im Test eine Fassung, die live noch fehlt.':
    'No app has a version in test that is not yet live.',
  'Zu dieser Fassung hat der Entwickler nichts geschrieben.':
    'The developer wrote nothing about this version.',
  'Zuletzt live geschaltet': 'Recently switched live',
  Zurück: 'Back',
  Zurückschalten: 'Switch back',
  'Meldung umgesetzt': 'feedback item done',
  'Meldungen umgesetzt': 'feedback items done',
  ', davor': ', before',
  seit: 'since',

  // Einstellungen
  Konto: 'Account',
  Darstellung: 'Display',
  Profil: 'Profile',
  Passwort: 'Password',
  'Angemeldete Rechner': 'Signed-in computers',
  Erscheinungsbild: 'Appearance',
  System: 'System',
  Hell: 'Light',
  Dunkel: 'Dark',
  Vorname: 'First name',
  Nachname: 'Last name',
  Funktion: 'Role',
  Kürzel: 'Initials',
  Speichern: 'Save',
  'Speichert …': 'Saving …',
  'Bild wählen': 'Choose picture',
  'Kein Rechner angemeldet': 'No computer signed in',
  'Überall abmelden': 'Sign out everywhere',
  Kopieren: 'Copy',
  Kopiert: 'Copied',
  'Aktuelles Passwort': 'Current password',
  'Neues Passwort': 'New password',
  'Neues Passwort bestätigen': 'Confirm new password',
  'Passwort ändern': 'Change password',
  'Passwort anzeigen': 'Show password',
  'Passwort verbergen': 'Hide password',
  Passwortanforderungen: 'Password requirements',

  // Terminal
  'Auf diesem Gerät ist das Terminal nicht eingeschaltet':
    'The terminal is not switched on for this server',
  'Ihr Betreuer schaltet es ein; danach steht hier Ihre Shell.':
    'Your service partner switches it on; afterwards your shell appears here.',
  'Das Terminal wird geöffnet …': 'Opening the terminal …',
  'Das Terminal gehört zum Recht in der Werkstatt': 'The terminal comes with the workshop right',
  'Die Verwaltung gibt es je Person, unter Personen.':
    'Administration grants it per person, under People.',

  // In der Demo nicht vorhanden
  'In der Demo nicht verfügbar. Auf einem echten Arasul-Server geht das.':
    'Not available in the demo. On a real Arasul server this works.',

  // Die Daten der Firma (J54): Apps, Abteilungen, Meldungen, Fassungen
  Angebote: 'Quotes',
  '(Test) Angebote': '(Test) Quotes',
  'Angebote (Test)': 'Quotes (test)',
  Wareneingang: 'Goods receipt',
  Wartungsplan: 'Maintenance plan',
  Prüfprotokolle: 'Inspection reports',
  '(Test) Prüfprotokolle': '(Test) Inspection reports',
  'Prüfprotokolle (Test)': 'Inspection reports (test)',
  Urlaubsanträge: 'Leave requests',
  Werkstatt: 'Workshop',
  Betriebsleiterin: 'Operations manager',
  'Liegt bei Ihnen.': 'Waiting for you.',
  'Was bei Ihnen liegt, steht direkt darunter bei „Für Sie“.':
    'What is waiting for you is listed right below under “For you”.',
  'Ihr Name und Ihre Adresse auf diesem Gerät.': 'Your name and address on this server.',
  'Die Telefonnummer des Servicetechnikers direkt in der Zeile wäre praktisch.':
    'The service technician’s phone number right in the row would be handy.',
  'Bei Stammkunden geben wir 3 % Rabatt. Ich rechne das jedes Mal von Hand aus. Kann das Angebot einen Rabatt haben?':
    'We give regular customers a 3% discount. I calculate it by hand every time. Can a quote have a discount?',
  'Am Handy ist die Spalte mit der Maschine abgeschnitten. In der Halle brauche ich vor allem den Standort.':
    'On the phone the machine column is cut off. In the hall I mostly need the location.',
  'Brückentage wären als Hinweis im Kalender praktisch.':
    'Bridge days marked in the calendar would be handy.',
  'Bitte eine Farbe pro Abteilung.': 'Please one colour per department.',
  'Die Abteilung steht schon als eigene Spalte; mehr Farben machen die Übersicht unruhig.':
    'The department already has its own column; more colours make the overview restless.',
  'Beim Reklamieren will ich das Foto direkt mit dem Handy machen, ohne Umweg über die Galerie.':
    'When raising a complaint I want to take the photo straight with the phone, without going through the gallery.',
  'Kann die Bestellnummer aus dem Lieferschein übernommen werden?':
    'Can the order number be taken from the delivery note?',
  'Das Angebots-PDF sollte unsere Referenzbilder anhängen können.':
    'The quote PDF should be able to attach our reference pictures.',
  'Bei Nacharbeit brauche ich eine Frist und wer es macht, sonst geht es unter.':
    'For rework I need a deadline and who does it, otherwise it gets lost.',
  'Die Liste nach Auftrag gruppieren, dann sehe ich, was für eine Baustelle fehlt.':
    'Group the list by order, then I see what is missing for a site.',
  'Ein Export für die Lohnabrechnung als CSV würde mir viel Abtippen sparen.':
    'A CSV export for payroll would save me a lot of retyping.',
  'Laser LS-1: Schutzglas-Wechsel bitte als eigene Wartung alle zwei Wochen.':
    'Laser LS-1: please make the protective window change its own task every two weeks.',
  'Auf der Übersicht hätte ich gern die Annahmequote je Monat.':
    'On the overview I would like the win rate per month.',
  'Eine App für Arbeitszeiten auf der Baustelle wäre der nächste Schritt.':
    'An app for working hours on site would be the next step.',
  'Rabatt je Angebot, darunter die Summe nach Rabatt (Rückmeldung #101 umgesetzt).':
    'Discount per quote, with the total after discount below (feedback #101 done).',
  'Nacharbeit mit Frist und zuständiger Person (Rückmeldung #108).':
    'Rework with deadline and responsible person (feedback #108).',
  'Angebote nach Kunde filtern.': 'Filter quotes by customer.',
  'Lagerort aus dem Artikel vorbelegt.': 'Storage location pre-filled from the item.',
  'Fällige Wartungen stehen oben.': 'Due maintenance is listed first.',
  'Messwert je Prüfung.': 'Measurement per inspection.',
  'Resturlaub steht über dem Formular.': 'Remaining leave is shown above the form.',
};

const TAGE: Record<string, string> = {
  Montag: 'Monday',
  Dienstag: 'Tuesday',
  Mittwoch: 'Wednesday',
  Donnerstag: 'Thursday',
  Freitag: 'Friday',
  Samstag: 'Saturday',
  Sonntag: 'Sunday',
};
const MONATE: Record<string, string> = {
  Januar: 'January',
  Februar: 'February',
  März: 'March',
  April: 'April',
  Mai: 'May',
  Juni: 'June',
  Juli: 'July',
  August: 'August',
  September: 'September',
  Oktober: 'October',
  November: 'November',
  Dezember: 'December',
};

const ZAHLEN: Record<string, string> = {
  Zwei: 'Two',
  Drei: 'Three',
  Vier: 'Four',
  Fünf: 'Five',
  Sechs: 'Six',
  Sieben: 'Seven',
  Acht: 'Eight',
  Neun: 'Nine',
  Zehn: 'Ten',
  Elf: 'Eleven',
  Zwölf: 'Twelve',
};

const name = (s: string) => WOERTER[s] ?? s;

/** Sätze mit Zahlen oder Namen darin. Reihenfolge zählt: das erste Muster gewinnt. */
export const MUSTER: Array<[RegExp, (...teile: string[]) => string]> = [
  [/^Guten Tag, (.+)$/, (_, n = '') => `Hello, ${name(n)}`],
  [/^Bereiche: (.+)$/, (_, n = '') => `Sections: ${name(n)}`],
  [/^Konto: (.+)$/, (_, n = '') => `Account: ${name(n)}`],
  [/^\(Test\) (.+)$/, (_, n = '') => `(Test) ${name(n)}`],
  [/^Startseite, (\d+) offen$/, (_, n) => `Home, ${n} open`],
  [/^Für Sie, (\d+) offen$/, (_, n) => `For you, ${n} open`],
  [/^(.+): erledigt$/, (_, t = '') => `${WOERTER[t] ?? t}: done`],
  [/^Start, (\d+) offen$/, (_, n) => `Home, ${n} open`],
  [/^(\d+) Freigaben offen$/, (_, n) => `${n} approvals open`],
  [/^(\d+) Freigaben?$/, (_, n) => `${n} approval${n === '1' ? '' : 's'}`],
  [/^1 Freigabe, liegt bei Ihnen$/, () => '1 approval, waiting for you'],
  [/^(\d+) Freigaben, alle liegen bei Ihnen$/, (_, n) => `${n} approvals, all waiting for you`],
  [/^Eine Freigabe wartet auf Sie$/, () => 'One approval is waiting for you'],
  [
    /^(\S+) Freigaben warten auf Sie$/,
    (_, n = '') => `${ZAHLEN[n] ?? n} approvals are waiting for you`,
  ],
  [
    /^wartet seit (\d+|einer|einem) (Minuten?|Stunden?|Tagen?|Tag|Wochen?)$/,
    (_, n = '', e = '') => {
      const zahl = n === 'einer' || n === 'einem' ? '1' : n;
      const einheit = e.startsWith('Minute')
        ? 'minute'
        : e.startsWith('Stunde')
          ? 'hour'
          : e.startsWith('Tag')
            ? 'day'
            : 'week';
      return `waiting for ${zahl} ${einheit}${zahl === '1' ? '' : 's'}`;
    },
  ],
  [/^wartet seit eben$/, () => 'waiting since just now'],
  [
    /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. (\S+) (\d{4})$/,
    (_, t = '', d, m = '', j) => `${TAGE[t] ?? t}, ${d} ${MONATE[m] ?? m} ${j}`,
  ],
  [/^(\d+) Meldung(?:en)?$/, (_, n) => `${n} feedback item${n === '1' ? '' : 's'}`],
  [/^(\d+) offen$/, (_, n) => `${n} open`],
  [
    /^(\d+) Meldung(?:en)? von Ihnen$/,
    (_, n) => `${n} feedback item${n === '1' ? '' : 's'} from you`,
  ],
  [/^Gemeldet (.+)$/, (_, d = '') => `Reported ${d}`],
  [
    /^Was Sie über das Icon oben rechts in einer App gemeldet haben, und was daraus wurde\. (\d+|Eine) Meldung(?:en)? (?:ist|sind) in Arbeit\.$/,
    (_, n = '') =>
      `What you reported via the icon at the top right of an app, and what became of it. ${n === 'Eine' || n === '1' ? 'One item is' : `${n} items are`} in progress.`,
  ],
  [/^(\d+) Meldung(?:en)? umgesetzt$/, (_, n) => `${n} feedback item${n === '1' ? '' : 's'} done`],
  [
    /^Was in den Apps über das Icon oben rechts gemeldet wurde\. (\d+|Eine) Meldung(?:en)? (?:ist|sind) offen\.$/,
    (_, n = '') =>
      `What was reported in the apps via the icon at the top right. ${n === 'Eine' || n === '1' ? 'One item is' : `${n} items are`} open.`,
  ],
  [
    /^Je App die Fassung in Test und Live\. (\d+|Eine) offene Meldung(?:en)? über alle Apps; ein Klick zeigt sie\.$/,
    (_, n = '') =>
      `Test and live version per app. ${n === 'Eine' || n === '1' ? 'One open item' : `${n} open items`} across all apps; one click shows them.`,
  ],
  [/^(.+) ist live$/, (_, n = '') => `${name(n)} is live`],
  [/^(.+) ist zurück$/, (_, n = '') => `${name(n)} is back`],
  [/^(.+) live schalten\?$/, (_, n = '') => `Switch ${name(n)} live?`],
  [/^(.+) zurückschalten\?$/, (_, n = '') => `Switch ${name(n)} back?`],
  [/^Es läuft jetzt Fassung (\S+)\.$/, (_, v) => `Version ${v} is now running.`],
  [
    /^Arasul sichert zuerst die Daten von (.+), schaltet dann Fassung (\S+) live und geht selbst auf (\S+) zurück, wenn die neue Fassung nicht startet\. Das dauert etwa zwei Minuten\.$/,
    (_, n = '', v, w) =>
      `Arasul first backs up the data of ${name(n)}, then switches version ${v} live and goes back to ${w} by itself if the new version does not start. This takes about two minutes.`,
  ],
  [
    /^(.+) geht zurück auf Fassung (\S+)\. Das ist ein Tausch: dieselbe Rückfrage bringt (\S+) wieder\.$/,
    (_, n = '', v, w) =>
      `${name(n)} goes back to version ${v}. This is a swap: the same question brings ${w} back.`,
  ],
  [/^(.+) ist Ihnen nicht freigegeben$/, (_, n = '') => `${name(n)} is not assigned to you`],
  [/^(.+) ist noch nicht live$/, (_, n = '') => `${name(n)} is not live yet`],
  [/^(.+) – Arasul$/, (_, n = '') => `${name(n)} – Arasul`],
  [/^zuletzt (.+)$/, (_, d) => `last ${d}`],
  [/^(.+):$/, (_, n = '') => `${name(n)}:`],
];
