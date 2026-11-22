/**
 * Die Firma der Demo (J54, M7): ein erfundener Metallbauer mit rund 60
 * Leuten. Das ist der eine Bestand, aus dem alle sechs Apps, die Startseite
 * und die Beispieldateien schöpfen, damit die Zahlen zusammenpassen: ein
 * Angebot nennt einen Kunden, dessen Auftrag im Wareneingang Material
 * bekommt und im Prüfprotokoll geprüft wird.
 *
 * Alles hier ist erfunden: Firma, Ort, Personen, Kunden, Lieferanten. Keine
 * Marke, kein Hersteller, kein Name aus den Apps eines Geräts. Beschrieben
 * in `FIRMA.md` daneben.
 */

export type Text = { de: string; en: string };
const T = (de: string, en: string): Text => ({ de, en });

export const FIRMA = {
  name: 'Kerschner Metallbau GmbH',
  kurz: 'Kerschner Metallbau',
  kuerzel: 'KM',
  ort: 'Grünfelden',
  strasse: 'Am Hammerwerk 12',
  plz: '79999',
  gegruendet: 1987,
  leute: 62,
  telefon: '0761 000 4180',
  web: 'kerschner-metallbau.example',
  was: T(
    'Treppen, Geländer, Vordächer und Tore für Bau und Gewerbe; Blech- und Schweißbaugruppen nach Zeichnung für den Maschinenbau.',
    'Stairs, railings, canopies and gates for construction and trade; sheet metal and welded assemblies to drawing for machine builders.'
  ),
} as const;

export interface Abteilung {
  id: string;
  name: Text;
  leute: number;
}

export const ABTEILUNGEN: Abteilung[] = [
  { id: 'gf', name: T('Geschäftsführung', 'Management'), leute: 2 },
  { id: 'vertrieb', name: T('Vertrieb und Kalkulation', 'Sales and estimating'), leute: 5 },
  { id: 'av', name: T('Arbeitsvorbereitung', 'Production planning'), leute: 4 },
  { id: 'einkauf', name: T('Einkauf und Lager', 'Purchasing and stores'), leute: 5 },
  { id: 'laser', name: T('Laser und Kanten', 'Laser and bending'), leute: 9 },
  { id: 'schweiss', name: T('Schweißerei', 'Welding shop'), leute: 16 },
  { id: 'montage', name: T('Montage', 'Installation'), leute: 11 },
  { id: 'qs', name: T('Qualitätssicherung', 'Quality assurance'), leute: 3 },
  { id: 'ih', name: T('Instandhaltung', 'Maintenance'), leute: 3 },
  { id: 'verwaltung', name: T('Verwaltung und Personal', 'Administration and HR'), leute: 4 },
];

export interface Person {
  id: number;
  vorname: string;
  nachname: string;
  kuerzel: string;
  abteilung: string;
  aufgabe: Text;
  /** Resturlaub in Tagen zum Anfang der Demo. */
  urlaub: number;
}

/** Die angemeldete Person: Betriebsleiterin, mit dem Recht in der Werkstatt. */
export const ICH_ID = 2;

export const PERSONEN: Person[] = [
  {
    id: 1,
    vorname: 'Thomas',
    nachname: 'Kerschner',
    kuerzel: 'TK',
    abteilung: 'gf',
    aufgabe: T('Geschäftsführer', 'Managing director'),
    urlaub: 14,
  },
  {
    id: 2,
    vorname: 'Miriam',
    nachname: 'Kerschner',
    kuerzel: 'MK',
    abteilung: 'gf',
    aufgabe: T('Betriebsleiterin, betreut die Apps', 'Operations manager, looks after the apps'),
    urlaub: 11,
  },
  {
    id: 3,
    vorname: 'Jonas',
    nachname: 'Albrecht',
    kuerzel: 'JA',
    abteilung: 'vertrieb',
    aufgabe: T('Kalkulation und Innendienst', 'Estimating and inside sales'),
    urlaub: 17,
  },
  {
    id: 4,
    vorname: 'Sabine',
    nachname: 'Reuter',
    kuerzel: 'SR',
    abteilung: 'vertrieb',
    aufgabe: T('Außendienst und Projektleitung', 'Field sales and project lead'),
    urlaub: 9,
  },
  {
    id: 5,
    vorname: 'Daniel',
    nachname: 'Okafor',
    kuerzel: 'DO',
    abteilung: 'av',
    aufgabe: T('Arbeitsvorbereitung', 'Production planning'),
    urlaub: 21,
  },
  {
    id: 6,
    vorname: 'Petra',
    nachname: 'Hagedorn',
    kuerzel: 'PH',
    abteilung: 'einkauf',
    aufgabe: T('Einkauf', 'Purchasing'),
    urlaub: 12,
  },
  {
    id: 7,
    vorname: 'Murat',
    nachname: 'Yıldız',
    kuerzel: 'MY',
    abteilung: 'einkauf',
    aufgabe: T('Lager und Wareneingang', 'Stores and goods receipt'),
    urlaub: 15,
  },
  {
    id: 8,
    vorname: 'Frank',
    nachname: 'Wiesner',
    kuerzel: 'FW',
    abteilung: 'schweiss',
    aufgabe: T('Meister Schweißerei', 'Welding shop foreman'),
    urlaub: 8,
  },
  {
    id: 9,
    vorname: 'Katarina',
    nachname: 'Novak',
    kuerzel: 'KN',
    abteilung: 'laser',
    aufgabe: T('Meisterin Laser und Kanten', 'Laser and bending forewoman'),
    urlaub: 19,
  },
  {
    id: 10,
    vorname: 'Lukas',
    nachname: 'Brandt',
    kuerzel: 'LB',
    abteilung: 'montage',
    aufgabe: T('Montageleiter', 'Installation lead'),
    urlaub: 6,
  },
  {
    id: 11,
    vorname: 'Elena',
    nachname: 'Fischer',
    kuerzel: 'EF',
    abteilung: 'qs',
    aufgabe: T('Qualitätssicherung, Schweißaufsicht', 'Quality assurance, welding supervisor'),
    urlaub: 13,
  },
  {
    id: 12,
    vorname: 'Ralf',
    nachname: 'Gerber',
    kuerzel: 'RG',
    abteilung: 'ih',
    aufgabe: T('Instandhaltung', 'Maintenance'),
    urlaub: 10,
  },
  {
    id: 13,
    vorname: 'Anja',
    nachname: 'Kowalski',
    kuerzel: 'AK',
    abteilung: 'verwaltung',
    aufgabe: T('Personal und Lohn', 'HR and payroll'),
    urlaub: 16,
  },
  {
    id: 14,
    vorname: 'Tim',
    nachname: 'Seidel',
    kuerzel: 'TS',
    abteilung: 'schweiss',
    aufgabe: T('Auszubildender Metallbauer', 'Apprentice metalworker'),
    urlaub: 22,
  },
  {
    id: 15,
    vorname: 'Nadine',
    nachname: 'Vogel',
    kuerzel: 'NV',
    abteilung: 'verwaltung',
    aufgabe: T('Buchhaltung', 'Accounting'),
    urlaub: 18,
  },
  {
    id: 16,
    vorname: 'Marco',
    nachname: 'Schuster',
    kuerzel: 'MS',
    abteilung: 'schweiss',
    aufgabe: T('Schweißer', 'Welder'),
    urlaub: 12,
  },
  {
    id: 17,
    vorname: 'Benedikt',
    nachname: 'Ramm',
    kuerzel: 'BR',
    abteilung: 'laser',
    aufgabe: T('Laserbediener', 'Laser operator'),
    urlaub: 20,
  },
  {
    id: 18,
    vorname: 'Yvonne',
    nachname: 'Pfister',
    kuerzel: 'YP',
    abteilung: 'montage',
    aufgabe: T('Monteurin', 'Installer'),
    urlaub: 7,
  },
];

export const person = (id: number): Person => PERSONEN.find(p => p.id === id) ?? PERSONEN[0]!;
export const name = (id: number): string => {
  const p = person(id);
  return `${p.vorname} ${p.nachname}`;
};

export interface Kunde {
  id: number;
  name: string;
  art: Text;
  ort: string;
  ansprechpartner: string;
}

export const KUNDEN: Kunde[] = [
  {
    id: 1,
    name: 'Baugesellschaft Am Mühlbach GmbH',
    art: T('Bauträger', 'Developer'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Lorenz',
  },
  {
    id: 2,
    name: 'Ostermeyer Fördertechnik GmbH',
    art: T('Maschinenbau', 'Machine building'),
    ort: 'Halbrück',
    ansprechpartner: 'Frau Demir',
  },
  {
    id: 3,
    name: 'Gemeinde Grünfelden, Bauamt',
    art: T('Kommune', 'Municipality'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Baumann',
  },
  {
    id: 4,
    name: 'Seeger & Hahn Architekten',
    art: T('Architekturbüro', 'Architects'),
    ort: 'Eschenau',
    ansprechpartner: 'Frau Hahn',
  },
  {
    id: 5,
    name: 'Wohnbau Talblick eG',
    art: T('Wohnungsbau', 'Housing'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Schäfer',
  },
  {
    id: 6,
    name: 'Bergmüller Anlagenbau GmbH',
    art: T('Anlagenbau', 'Plant engineering'),
    ort: 'Weilerbach am See',
    ansprechpartner: 'Herr Bergmüller',
  },
  {
    id: 7,
    name: 'Autohaus Lindenhof GmbH',
    art: T('Gewerbe', 'Business'),
    ort: 'Halbrück',
    ansprechpartner: 'Frau Kraus',
  },
  {
    id: 8,
    name: 'Kreisklinik Grünfelden, Technik',
    art: T('Klinik', 'Hospital'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Petersen',
  },
  {
    id: 9,
    name: 'Brauerei Hallmann',
    art: T('Gewerbe', 'Business'),
    ort: 'Eschenau',
    ansprechpartner: 'Herr Hallmann',
  },
  {
    id: 10,
    name: 'Ruland Verpackungsmaschinen GmbH',
    art: T('Maschinenbau', 'Machine building'),
    ort: 'Obertal',
    ansprechpartner: 'Frau Ruland',
  },
  {
    id: 11,
    name: 'Stadtwerke Grünfelden',
    art: T('Versorger', 'Utility'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Engel',
  },
  {
    id: 12,
    name: 'Achterberg Holzbau GmbH',
    art: T('Bauunternehmen', 'Builder'),
    ort: 'Weilerbach am See',
    ansprechpartner: 'Herr Achterberg',
  },
  {
    id: 13,
    name: 'Gasthof Linde, Familie Rauscher',
    art: T('Gastronomie', 'Hospitality'),
    ort: 'Obertal',
    ansprechpartner: 'Frau Rauscher',
  },
  {
    id: 14,
    name: 'Möbelwerk Sonnleitner GmbH',
    art: T('Industrie', 'Industry'),
    ort: 'Halbrück',
    ansprechpartner: 'Herr Sonnleitner',
  },
  {
    id: 15,
    name: 'Ingenieurbüro Teichmann',
    art: T('Planer', 'Engineers'),
    ort: 'Eschenau',
    ansprechpartner: 'Herr Teichmann',
  },
  {
    id: 16,
    name: 'Landkreis, Schulzentrum Grünfelden',
    art: T('Öffentlicher Bau', 'Public building'),
    ort: 'Grünfelden',
    ansprechpartner: 'Frau Wolff',
  },
  {
    id: 17,
    name: 'Hagenau Logistik GmbH',
    art: T('Logistik', 'Logistics'),
    ort: 'Obertal',
    ansprechpartner: 'Herr Hagenau',
  },
  {
    id: 18,
    name: 'Familie Vossberg',
    art: T('Privat', 'Private'),
    ort: 'Grünfelden',
    ansprechpartner: 'Dr. Vossberg',
  },
  {
    id: 19,
    name: 'Landmaschinen Eberle KG',
    art: T('Handel und Werkstatt', 'Dealer and workshop'),
    ort: 'Weilerbach am See',
    ansprechpartner: 'Herr Eberle',
  },
  {
    id: 20,
    name: 'Wärmetechnik Lorenz GmbH',
    art: T('Industrie', 'Industry'),
    ort: 'Halbrück',
    ansprechpartner: 'Frau Lorenz',
  },
  {
    id: 21,
    name: 'Freiwillige Feuerwehr Grünfelden',
    art: T('Kommune', 'Municipality'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Maurer',
  },
  {
    id: 22,
    name: 'Hotel am Stadtpark',
    art: T('Gastronomie', 'Hospitality'),
    ort: 'Grünfelden',
    ansprechpartner: 'Frau Sommer',
  },
  {
    id: 23,
    name: 'Weingut Hornung',
    art: T('Landwirtschaft', 'Agriculture'),
    ort: 'Eschenau',
    ansprechpartner: 'Herr Hornung',
  },
  {
    id: 24,
    name: 'TSV Grünfelden 1898 e. V.',
    art: T('Verein', 'Club'),
    ort: 'Grünfelden',
    ansprechpartner: 'Herr Kugler',
  },
  {
    id: 25,
    name: 'Zellner Präzisionsteile GmbH',
    art: T('Maschinenbau', 'Machine building'),
    ort: 'Obertal',
    ansprechpartner: 'Frau Zellner',
  },
];

export const kunde = (id: number): Kunde => KUNDEN.find(k => k.id === id) ?? KUNDEN[0]!;

/** „Herr Lorenz" auf Englisch „Mr Lorenz". */
export const ansprech = (k: Kunde, sp: 'de' | 'en'): string =>
  sp === 'en'
    ? k.ansprechpartner.replace(/^Herr /, 'Mr ').replace(/^Frau /, 'Ms ')
    : k.ansprechpartner;

export interface Lieferant {
  id: number;
  name: string;
  was: Text;
  ort: string;
}

export const LIEFERANTEN: Lieferant[] = [
  {
    id: 1,
    name: 'Stahlhandel Rheintal GmbH',
    was: T('Bleche, Träger, Profile', 'Sheet, beams, sections'),
    ort: 'Rheinstetten-Süd',
  },
  {
    id: 2,
    name: 'Edelstahl Mertens KG',
    was: T('Edelstahlbleche und -rohre', 'Stainless sheet and tube'),
    ort: 'Halbrück',
  },
  {
    id: 3,
    name: 'Schraubenhandel Hollerbach',
    was: T('Schrauben, Anker, Normteile', 'Bolts, anchors, standard parts'),
    ort: 'Obertal',
  },
  {
    id: 4,
    name: 'Gase und Schweißtechnik Brandl',
    was: T('Schweißgase, Draht, Zubehör', 'Welding gas, wire, accessories'),
    ort: 'Eschenau',
  },
  {
    id: 5,
    name: 'Beschichtungszentrum Aichele',
    was: T('Pulverbeschichtung', 'Powder coating'),
    ort: 'Weilerbach am See',
  },
  {
    id: 6,
    name: 'Glas Wiedemann GmbH',
    was: T('Sicherheitsglas für Geländer', 'Safety glass for railings'),
    ort: 'Grünfelden',
  },
  {
    id: 7,
    name: 'Rohrhandel Nordstern',
    was: T('Rohre und Hohlprofile', 'Tubes and hollow sections'),
    ort: 'Nordhagen',
  },
  {
    id: 8,
    name: 'Werkzeugdienst Pohl',
    was: T('Verschleißteile, Trennscheiben', 'Wear parts, cutting discs'),
    ort: 'Halbrück',
  },
  {
    id: 9,
    name: 'Feuerverzinkerei Talgrund',
    was: T('Feuerverzinken', 'Hot-dip galvanising'),
    ort: 'Talgrund',
  },
  {
    id: 10,
    name: 'Aluprofile Sander GmbH',
    was: T('Aluminiumprofile', 'Aluminium sections'),
    ort: 'Obertal',
  },
  {
    id: 11,
    name: 'Arbeitsschutz Kühne',
    was: T('Schutzausrüstung', 'Protective equipment'),
    ort: 'Grünfelden',
  },
  {
    id: 12,
    name: 'Hydraulikservice Ostrowski',
    was: T('Hydraulik, Schläuche, Wartung', 'Hydraulics, hoses, service'),
    ort: 'Eschenau',
  },
  {
    id: 13,
    name: 'Industriebedarf Hennig',
    was: T('Betriebsmittel, Öle', 'Supplies, oils'),
    ort: 'Halbrück',
  },
  {
    id: 14,
    name: 'Kranservice Lauterbach',
    was: T('Kranprüfung und Wartung', 'Crane inspection and service'),
    ort: 'Nordhagen',
  },
  {
    id: 15,
    name: 'Optik und Laserteile Rieger',
    was: T('Linsen, Düsen, Schutzgläser', 'Lenses, nozzles, protective windows'),
    ort: 'Obertal',
  },
];

export const lieferant = (id: number): Lieferant =>
  LIEFERANTEN.find(l => l.id === id) ?? LIEFERANTEN[0]!;

export interface Maschine {
  id: string;
  name: Text;
  ort: Text;
  baujahr: number;
}

export const MASCHINEN: Maschine[] = [
  {
    id: 'LS-1',
    name: T('Faserlaser 6 kW', 'Fibre laser 6 kW'),
    ort: T('Halle 1', 'Hall 1'),
    baujahr: 2021,
  },
  {
    id: 'KP-1',
    name: T('Abkantpresse 135 t', 'Press brake 135 t'),
    ort: T('Halle 1', 'Hall 1'),
    baujahr: 2014,
  },
  {
    id: 'KP-2',
    name: T('Abkantpresse 230 t', 'Press brake 230 t'),
    ort: T('Halle 1', 'Hall 1'),
    baujahr: 2019,
  },
  { id: 'BS-1', name: T('Bandsäge', 'Band saw'), ort: T('Halle 2', 'Hall 2'), baujahr: 2012 },
  {
    id: 'BSA-1',
    name: T('Bohr- und Sägeanlage', 'Drilling and sawing line'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2017,
  },
  {
    id: 'SR-1',
    name: T('Schweißroboter', 'Welding robot'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2022,
  },
  {
    id: 'SG-1',
    name: T('MAG-Schweißgerät 1', 'MAG welder 1'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2018,
  },
  {
    id: 'SG-2',
    name: T('MAG-Schweißgerät 2', 'MAG welder 2'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2018,
  },
  {
    id: 'SG-3',
    name: T('WIG-Schweißgerät', 'TIG welder'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2020,
  },
  {
    id: 'RB-1',
    name: T('Rohrbiegemaschine', 'Tube bender'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2016,
  },
  {
    id: 'SA-1',
    name: T('Strahlanlage', 'Blasting unit'),
    ort: T('Halle 3', 'Hall 3'),
    baujahr: 2010,
  },
  {
    id: 'HK-1',
    name: T('Hallenkran 10 t', 'Overhead crane 10 t'),
    ort: T('Halle 2', 'Hall 2'),
    baujahr: 2008,
  },
  {
    id: 'HK-2',
    name: T('Hallenkran 5 t', 'Overhead crane 5 t'),
    ort: T('Halle 1', 'Hall 1'),
    baujahr: 2014,
  },
  { id: 'ST-1', name: T('Gabelstapler 3 t', 'Forklift 3 t'), ort: T('Hof', 'Yard'), baujahr: 2019 },
  {
    id: 'KO-1',
    name: T('Kompressor', 'Compressor'),
    ort: T('Technikraum', 'Plant room'),
    baujahr: 2015,
  },
];

export const maschine = (id: string): Maschine => MASCHINEN.find(m => m.id === id) ?? MASCHINEN[0]!;

export interface Artikel {
  nr: string;
  name: Text;
  einheit: Text;
  lieferant: number;
  lagerort: string;
}

export const ARTIKEL: Artikel[] = [
  {
    nr: '10-0301',
    name: T('Blech S235, 3 mm, 1500 × 3000', 'Sheet S235, 3 mm, 1500 × 3000'),
    einheit: T('Tafeln', 'sheets'),
    lieferant: 1,
    lagerort: 'B-01',
  },
  {
    nr: '10-0501',
    name: T('Blech S235, 5 mm, 1500 × 3000', 'Sheet S235, 5 mm, 1500 × 3000'),
    einheit: T('Tafeln', 'sheets'),
    lieferant: 1,
    lagerort: 'B-02',
  },
  {
    nr: '10-0802',
    name: T('Riffelblech 5/7 mm', 'Chequer plate 5/7 mm'),
    einheit: T('Tafeln', 'sheets'),
    lieferant: 1,
    lagerort: 'B-03',
  },
  {
    nr: '11-0201',
    name: T('Edelstahlblech 1.4301, 2 mm', 'Stainless sheet 1.4301, 2 mm'),
    einheit: T('Tafeln', 'sheets'),
    lieferant: 2,
    lagerort: 'B-05',
  },
  {
    nr: '20-4008',
    name: T('Flachstahl 40 × 8', 'Flat bar 40 × 8'),
    einheit: T('m', 'm'),
    lieferant: 1,
    lagerort: 'R-11',
  },
  {
    nr: '20-4040',
    name: T('Quadratrohr 40 × 40 × 3', 'Square tube 40 × 40 × 3'),
    einheit: T('m', 'm'),
    lieferant: 7,
    lagerort: 'R-12',
  },
  {
    nr: '20-6060',
    name: T('Quadratrohr 60 × 60 × 4', 'Square tube 60 × 60 × 4'),
    einheit: T('m', 'm'),
    lieferant: 7,
    lagerort: 'R-12',
  },
  {
    nr: '21-4242',
    name: T('Rundrohr 42,4 × 2, Edelstahl', 'Round tube 42.4 × 2, stainless'),
    einheit: T('m', 'm'),
    lieferant: 2,
    lagerort: 'R-14',
  },
  {
    nr: '22-0160',
    name: T('Träger HEA 160', 'Beam HEA 160'),
    einheit: T('m', 'm'),
    lieferant: 1,
    lagerort: 'R-01',
  },
  {
    nr: '22-0200',
    name: T('Träger IPE 200', 'Beam IPE 200'),
    einheit: T('m', 'm'),
    lieferant: 1,
    lagerort: 'R-02',
  },
  {
    nr: '22-1120',
    name: T('U-Profil 120', 'Channel 120'),
    einheit: T('m', 'm'),
    lieferant: 1,
    lagerort: 'R-03',
  },
  {
    nr: '23-0505',
    name: T('Winkel 50 × 5', 'Angle 50 × 5'),
    einheit: T('m', 'm'),
    lieferant: 1,
    lagerort: 'R-05',
  },
  {
    nr: '30-1001',
    name: T('Schweißdraht G3Si1, 1,0 mm', 'Welding wire G3Si1, 1.0 mm'),
    einheit: T('Rollen', 'spools'),
    lieferant: 4,
    lagerort: 'L-21',
  },
  {
    nr: '30-2018',
    name: T('Mischgas 82/18, 50 l', 'Mixed gas 82/18, 50 l'),
    einheit: T('Flaschen', 'cylinders'),
    lieferant: 4,
    lagerort: 'Gaslager',
  },
  {
    nr: '31-1208',
    name: T('Sechskantschraube M12 × 40, 8.8, verzinkt', 'Hex bolt M12 × 40, 8.8, galvanised'),
    einheit: T('Stück', 'pcs'),
    lieferant: 3,
    lagerort: 'L-04',
  },
  {
    nr: '31-5012',
    name: T('Bolzenanker M12', 'Anchor bolt M12'),
    einheit: T('Stück', 'pcs'),
    lieferant: 3,
    lagerort: 'L-05',
  },
  {
    nr: '40-3010',
    name: T('Gitterrost 30/10, 1000 × 600', 'Grating 30/10, 1000 × 600'),
    einheit: T('Stück', 'pcs'),
    lieferant: 1,
    lagerort: 'H-02',
  },
  {
    nr: '41-0876',
    name: T('VSG-Klarglas 8,76 mm, nach Maß', 'Laminated glass 8.76 mm, to size'),
    einheit: T('Scheiben', 'panes'),
    lieferant: 6,
    lagerort: 'Glasbock',
  },
  {
    nr: '50-0015',
    name: T('Laserdüsen 1,5 mm', 'Laser nozzles 1.5 mm'),
    einheit: T('Stück', 'pcs'),
    lieferant: 15,
    lagerort: 'L-30',
  },
  {
    nr: '50-0120',
    name: T('Schutzglas Schneidkopf', 'Cutting head protective window'),
    einheit: T('Stück', 'pcs'),
    lieferant: 15,
    lagerort: 'L-30',
  },
  {
    nr: '51-0125',
    name: T('Trennscheibe 125 mm', 'Cutting disc 125 mm'),
    einheit: T('Stück', 'pcs'),
    lieferant: 8,
    lagerort: 'L-22',
  },
  {
    nr: '60-7016',
    name: T('Pulverlack RAL 7016', 'Powder coat RAL 7016'),
    einheit: T('kg', 'kg'),
    lieferant: 5,
    lagerort: 'L-40',
  },
  {
    nr: '61-2211',
    name: T('Aluprofil Handlauf oval', 'Aluminium oval handrail'),
    einheit: T('m', 'm'),
    lieferant: 10,
    lagerort: 'R-20',
  },
  {
    nr: '70-0001',
    name: T('Hydrauliköl HLP 46', 'Hydraulic oil HLP 46'),
    einheit: T('l', 'l'),
    lieferant: 13,
    lagerort: 'Ölraum',
  },
];

/**
 * Die Aufträge: aus angenommenen Angeboten entstanden. Dieselbe Nummer
 * steht im Angebot, im Wareneingang (Material für den Auftrag) und im
 * Prüfprotokoll (das Bauteil des Auftrags).
 */
export interface Auftrag {
  nr: string;
  kunde: number;
  gegenstand: Text;
  /** Woraus er entstand: die Nummer des Angebots. */
  angebot: string;
}

export const AUFTRAEGE: Auftrag[] = [
  {
    nr: 'AU-26-041',
    kunde: 1,
    gegenstand: T('Außentreppe verzinkt, 14 Stufen', 'External stair, galvanised, 14 steps'),
    angebot: 'AN-26-087',
  },
  {
    nr: 'AU-26-042',
    kunde: 2,
    gegenstand: T('Schweißbaugruppe Rahmen RF-200, 40 Stück', 'Welded frame RF-200, 40 pcs'),
    angebot: 'AN-26-089',
  },
  {
    nr: 'AU-26-043',
    kunde: 5,
    gegenstand: T(
      'Balkongeländer Edelstahl mit Glas, Haus C',
      'Stainless balcony railing with glass, block C'
    ),
    angebot: 'AN-26-091',
  },
  {
    nr: 'AU-26-044',
    kunde: 16,
    gegenstand: T('Fluchttreppe Schulzentrum, Bauteil B', 'Escape stair, school centre, section B'),
    angebot: 'AN-26-093',
  },
  {
    nr: 'AU-26-045',
    kunde: 7,
    gegenstand: T('Vordach Showroom, 9 × 3 m', 'Showroom canopy, 9 × 3 m'),
    angebot: 'AN-26-096',
  },
  {
    nr: 'AU-26-046',
    kunde: 10,
    gegenstand: T(
      'Maschinenverkleidung, Kantteile, 120 Stück',
      'Machine guards, bent parts, 120 pcs'
    ),
    angebot: 'AN-26-098',
  },
  {
    nr: 'AU-26-047',
    kunde: 11,
    gegenstand: T('Bühne mit Gitterrost, Pumpwerk Nord', 'Grating platform, north pumping station'),
    angebot: 'AN-26-101',
  },
  {
    nr: 'AU-26-048',
    kunde: 9,
    gegenstand: T('Treppe und Podest Sudhaus', 'Stair and landing, brewhouse'),
    angebot: 'AN-26-103',
  },
  {
    nr: 'AU-26-049',
    kunde: 25,
    gegenstand: T('Laserteile nach Zeichnung, Serie 3', 'Laser parts to drawing, batch 3'),
    angebot: 'AN-26-106',
  },
  {
    nr: 'AU-26-050',
    kunde: 21,
    gegenstand: T('Schiebetor Gerätehaus, 6 m', 'Sliding gate, fire station, 6 m'),
    angebot: 'AN-26-108',
  },
  {
    nr: 'AU-26-051',
    kunde: 14,
    gegenstand: T('Regalbühne Lager, 120 m²', 'Mezzanine floor, warehouse, 120 m²'),
    angebot: 'AN-26-111',
  },
  {
    nr: 'AU-26-052',
    kunde: 18,
    gegenstand: T('Wendeltreppe Garten, feuerverzinkt', 'Garden spiral stair, hot-dip galvanised'),
    angebot: 'AN-26-114',
  },
];

export const auftrag = (nr: string): Auftrag | undefined => AUFTRAEGE.find(a => a.nr === nr);
