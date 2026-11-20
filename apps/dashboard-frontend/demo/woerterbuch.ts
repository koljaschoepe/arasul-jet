/**
 * Das Wörterbuch der englischen Demo (J46, M7): sichtbare Sätze der Shell und
 * des Entwickler-Cockpits auf dem Weg der Demo, Deutsch → Englisch.
 *
 * Gesammelt am fertigen Bau (`node demo/abnahme.mjs --sammeln`) und aus den
 * Quellen der Ansichten, die der Weg berührt (Startseite, Rahmen mit
 * Rückmeldung, Cockpit, Einstellungen, Terminal). Ein Satz, der hier fehlt,
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
  'Guten Tag': 'Good day',
  'Alles erledigt': 'All done',
  'Für Sie': 'For you',
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
  'Ihre Rückmeldung ist angekommen. Wer die App weiterbaut, sieht sie jetzt.':
    'Your feedback has arrived. Whoever develops the app can see it now.',
  Schließen: 'Close',
  'Dialog schließen': 'Close dialog',

  // Entwickler-Cockpit
  'Entwickler-Cockpit': 'Developer cockpit',
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
  'Wer gemeldet hat, erfährt davon nichts.': 'The person who reported it is not notified.',
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
  'Das Terminal ist für Entwickler': 'The terminal is for developers',

  // In der Demo nicht vorhanden
  'In der Demo nicht verfügbar. Auf einem echten Arasul-Server geht das.':
    'Not available in the demo. On a real Arasul server this works.',

  // Beispieldaten
  'Beispiel-Mitarbeiter': 'Sample employee',
  'Beispiel-Entwickler': 'Sample developer',
  Entwicklung: 'Development',
  Angebote: 'Quotes',
  '(Test) Angebote': '(Test) Quotes',
  'Angebote (Test)': 'Quotes (test)',
  Wartungsplan: 'Maintenance plan',
  Urlaubsanträge: 'Leave requests',
  'Vertrieb Innendienst': 'Inside sales',
  'Kundendienst Außendienst': 'Field service',
  Werkstatt: 'Workshop',
  Buchhaltung: 'Accounting',
  'Bei Stammkunden geben wir oft 3 % Rabatt. Ich rechne das jedes Mal von Hand aus. Kann das Angebot einen Rabatt haben?':
    'We often give regular customers a 3% discount. I calculate it by hand every time. Can a quote have a discount?',
  'Am Handy ist die Spalte mit dem Kunden abgeschnitten. Unterwegs brauche ich vor allem den Ort.':
    'On the phone the customer column is cut off. On the road I mostly need the location.',
  'Brückentage wären als Hinweis im Kalender praktisch.':
    'Bridge days marked in the calendar would be handy.',
  'Bitte eine Farbe pro Abteilung.': 'Please one colour per department.',
  'Abteilungen stehen schon als eigene Spalte; mehr Farben machen die Übersicht unruhig.':
    'Departments already have their own column; more colours make the overview restless.',
  'Rabatt je Angebot, darunter die Summe nach Rabatt (Rückmeldung #101 umgesetzt).':
    'Discount per quote, with the total after discount below (feedback #101 done).',
  'Angebote nach Kunde filtern.': 'Filter quotes by customer.',
  'Fällige Wartungen stehen oben.': 'Due maintenance is listed first.',
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

const name = (s: string) => WOERTER[s] ?? s;

/** Sätze mit Zahlen oder Namen darin. Reihenfolge zählt: das erste Muster gewinnt. */
export const MUSTER: Array<[RegExp, (...teile: string[]) => string]> = [
  [/^Guten Tag, (.+)$/, (_, n = '') => `Good day, ${name(n)}`],
  [/^Bereiche: (.+)$/, (_, n = '') => `Sections: ${name(n)}`],
  [/^Konto: (.+)$/, (_, n = '') => `Account: ${name(n)}`],
  [/^\(Test\) (.+)$/, (_, n = '') => `(Test) ${name(n)}`],
  [/^Startseite, (\d+) offen$/, (_, n) => `Home, ${n} open`],
  [/^(\d+) Freigaben offen$/, (_, n) => `${n} approvals open`],
  [
    /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag), (\d+)\. (\S+) (\d{4})$/,
    (_, t = '', d, m = '', j) => `${TAGE[t] ?? t}, ${d} ${MONATE[m] ?? m} ${j}`,
  ],
  [/^(\d+) Meldung(?:en)?$/, (_, n) => `${n} feedback item${n === '1' ? '' : 's'}`],
  [/^(\d+) offen$/, (_, n) => `${n} open`],
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
