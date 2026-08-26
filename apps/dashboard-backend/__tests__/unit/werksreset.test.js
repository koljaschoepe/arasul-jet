/**
 * Werksreset (Plan 023 B5).
 *
 * Der Werksreset hat eine Eigenschaft, die schwerer wiegt als seine
 * Vollständigkeit: er muss wissen, wann er unvollständig ist. Eine neue
 * Migration mit einer neuen Tabelle darf nicht dazu führen, dass ab dem Tag
 * still Daten stehen bleiben, während die Oberfläche „zurückgesetzt" meldet.
 *
 * Deshalb prüfen diese Tests vor allem das Verweigern.
 */

jest.mock('../../src/database', () => ({
  query: jest.fn(),
  transaction: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../../src/services/system-settings/systemSettingsService', () => ({
  reload: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/services/core/cacheService', () => ({
  cacheService: { clear: jest.fn() },
}));

jest.mock('fs', () => ({
  promises: { readdir: jest.fn(), rm: jest.fn(), readFile: jest.fn() },
}));

jest.mock('../../src/utils/envManager', () => ({ updateEnvVariable: jest.fn() }));

jest.mock('../../src/services/core/docker', () => ({ restartContainer: jest.fn() }));

jest.mock('../../src/middleware/auth', () => ({
  clearUserCache: jest.fn(),
  optionalAuth: (req, res, next) => next(),
}));

const db = require('../../src/database');
const werksreset = require('../../src/services/werksreset/werksreset');
const { INHALTE, AUSLIEFERUNG, MODELLE, BLEIBT } = require('../../src/services/werksreset/tabellen');

/** Antwortet auf die Abfrage der vorhandenen Tabellen. */
function tabellenInDerDatenbank(namen) {
  db.query.mockImplementation(async sql => {
    if (sql.includes('information_schema.tables')) {
      return { rows: namen.map(name => ({ name })) };
    }
    if (sql.includes('FROM system_settings')) {
      return { rows: [{ hostname: 'orin-vorfuehrer' }] };
    }
    if (sql.startsWith('SELECT count(*)')) {
      return { rows: [{ n: 7 }] };
    }
    return { rows: [] };
  });
}

const ALLE = [...INHALTE, ...AUSLIEFERUNG, ...MODELLE, ...BLEIBT].map(([name]) => name);

describe('Klassifikation', () => {
  test('jede Tabelle steht in genau einem Topf', () => {
    const doppelt = ALLE.filter((name, i) => ALLE.indexOf(name) !== i);
    expect(doppelt).toEqual([]);
  });

  test('jeder Eintrag hat Schema, Name und einen Grund', () => {
    for (const [name, grund] of [...INHALTE, ...AUSLIEFERUNG, ...MODELLE, ...BLEIBT]) {
      expect(name).toMatch(/^(public|arasul)\.[a-z][a-z0-9_]*$/);
      expect(grund.length).toBeGreaterThan(4);
    }
  });

  test('Stufe "inhalte" fasst weder Zugangsdaten noch Anbieter-Schluessel an', () => {
    const namen = werksreset.tabellenFuer('inhalte').map(t => t.name);
    expect(namen).not.toContain('public.admin_users');
    expect(namen).not.toContain('arasul.externe_modell_anbieter');
    expect(namen).toContain('public.chat_messages');
    expect(namen).toContain('arasul.flow_runs');
  });

  test('Stufe "auslieferung" nimmt sie mit', () => {
    const namen = werksreset.tabellenFuer('auslieferung').map(t => t.name);
    expect(namen).toContain('public.admin_users');
    expect(namen).toContain('arasul.externe_modell_anbieter');
    expect(namen).toContain('public.chat_messages');
  });

  test('Modelle nur auf ausdrücklichen Wunsch', () => {
    expect(werksreset.tabellenFuer('auslieferung').map(t => t.name)).not.toContain(
      'public.llm_installed_models'
    );
    expect(werksreset.tabellenFuer('auslieferung', true).map(t => t.name)).toContain(
      'public.llm_installed_models'
    );
  });

  test('Schema-Buchführung und Werkskatalog bleiben in jeder Stufe stehen', () => {
    for (const stufe of ['inhalte', 'auslieferung']) {
      const namen = werksreset.tabellenFuer(stufe, true).map(t => t.name);
      expect(namen).not.toContain('public.schema_migrations');
      expect(namen).not.toContain('arasul.schema_migrations');
      expect(namen).not.toContain('public.llm_model_catalog');
      expect(namen).not.toContain('public.system_settings');
    }
  });
});

describe('unbekannteTabellen', () => {
  beforeEach(() => db.query.mockReset());

  test('meldet, was in keinem Topf steht', async () => {
    tabellenInDerDatenbank([...ALLE, 'public.irgendwas_neues']);
    await expect(werksreset.unbekannteTabellen()).resolves.toEqual(['public.irgendwas_neues']);
  });

  test('ist leer, wenn die Klassifikation die Datenbank abdeckt', async () => {
    tabellenInDerDatenbank(ALLE);
    await expect(werksreset.unbekannteTabellen()).resolves.toEqual([]);
  });
});

describe('ausfuehren', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.transaction.mockReset();
  });

  test('verweigert, solange eine Tabelle nicht eingeordnet ist', async () => {
    tabellenInDerDatenbank([...ALLE, 'public.spaeter_dazugekommen']);

    await expect(
      werksreset.ausfuehren({ stufe: 'inhalte', bestaetigung: 'orin-vorfuehrer' })
    ).rejects.toThrow(/spaeter_dazugekommen/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test('verweigert bei falschem Gerätenamen', async () => {
    tabellenInDerDatenbank(ALLE);

    await expect(
      werksreset.ausfuehren({ stufe: 'inhalte', bestaetigung: 'irgendwas' })
    ).rejects.toThrow(/Gerätename/);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  test('verweigert eine unbekannte Stufe, bevor irgendetwas gelesen wird', async () => {
    await expect(
      werksreset.ausfuehren({ stufe: 'halb', bestaetigung: 'orin-vorfuehrer' })
    ).rejects.toThrow(/Unbekannte Stufe/);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('leereTabellen', () => {
  /** Ein Client, der bei bestimmten Tabellen erst beim zweiten Anlauf löscht. */
  function clientMit({ blockiertBis = {} } = {}) {
    const versuche = {};
    const geloescht = [];
    return {
      geloescht,
      query: jest.fn(async sql => {
        if (/^(SAVEPOINT|RELEASE|ROLLBACK)/.test(sql)) return { rowCount: 0 };
        const treffer = /DELETE FROM "([a-z]+)"\."([a-z_]+)"/.exec(sql);
        if (!treffer) return { rowCount: 0 };
        const name = `${treffer[1]}.${treffer[2]}`;
        versuche[name] = (versuche[name] || 0) + 1;
        if (versuche[name] <= (blockiertBis[name] || 0)) {
          throw new Error(`update or delete on table "${treffer[2]}" violates foreign key`);
        }
        geloescht.push(name);
        return { rowCount: 3 };
      }),
    };
  }

  test('löst die Reihenfolge über Wiederholung auf, statt sie zu kennen', async () => {
    const client = clientMit({ blockiertBis: { 'public.documents': 1 } });
    const ergebnis = await werksreset._leereTabellen(client, [
      'public.documents',
      'public.document_chunks',
    ]);

    expect(Object.keys(ergebnis).sort()).toEqual(['public.document_chunks', 'public.documents']);
    // Das Kind zuerst, obwohl der Elternteil vorn in der Liste stand.
    expect(client.geloescht[0]).toBe('public.document_chunks');
  });

  test('bricht ab, wenn eine ganze Runde nichts löschen kann', async () => {
    const client = clientMit({ blockiertBis: { 'public.documents': 99, 'public.documents2': 99 } });
    client.query.mockImplementation(async sql => {
      if (/^(SAVEPOINT|RELEASE|ROLLBACK)/.test(sql)) return { rowCount: 0 };
      throw new Error('Tabelle ist gesperrt');
    });

    await expect(
      werksreset._leereTabellen(client, ['public.documents', 'public.chat_messages'])
    ).rejects.toThrow(/lassen sich nicht leeren/);
  });
});

describe('werkseinstellungen', () => {
  test('setzt auf die Spalten-Vorgaben statt zu löschen', async () => {
    const gestellt = [];
    const client = {
      query: jest.fn(async sql => {
        gestellt.push(sql);
        if (sql.includes('information_schema.columns')) {
          return {
            rows: [
              { column_name: 'setup_completed', is_nullable: 'NO', column_default: 'false' },
              { column_name: 'hostname', is_nullable: 'YES', column_default: null },
              {
                column_name: 'gezaehlt',
                is_nullable: 'NO',
                column_default: "nextval('x_seq'::regclass)",
              },
            ],
          };
        }
        return { rowCount: 1 };
      }),
    };

    await werksreset._werkseinstellungen(client);

    const update = gestellt.find(s => s.startsWith('UPDATE system_settings'));
    expect(update).toContain('"setup_completed" = false');
    expect(update).toContain('"hostname" = NULL');
    // Ein Sequenz-Aufruf ist kein Werkswert und darf nicht in das UPDATE wandern.
    expect(update).toContain('"gezaehlt" = NULL');
    expect(update).not.toContain('nextval');
    expect(update).toContain('WHERE id = 1');
    expect(gestellt.some(s => /DELETE FROM system_settings/.test(s))).toBe(false);
  });
});

/**
 * Der teuerste Fehler waere ein Werksreset, der wie einer aussieht und keiner
 * ist. Zwei Wege dorthin sind hier abgesichert: das alte Passwort ueberlebt,
 * weil bootstrap.js es beim naechsten Start aus der .env wieder einsetzt, und
 * n8n behaelt seine Workflows, weil nur die eigene Datenbank geleert wurde.
 */
describe('ausfuehren, ganzer Durchlauf', () => {
  const fs = require('fs');
  const envManager = require('../../src/utils/envManager');
  const docker = require('../../src/services/core/docker');

  let clientAbfragen;

  beforeEach(() => {
    db.query.mockReset();
    db.transaction.mockReset();
    clientAbfragen = [];

    tabellenInDerDatenbank(ALLE);

    db.transaction.mockImplementation(async rueckruf =>
      rueckruf({
        query: jest.fn(async sql => {
          clientAbfragen.push(sql);
          if (sql.includes('information_schema.columns')) {
            return { rows: [{ column_name: 'setup_completed', column_default: 'false' }] };
          }
          return { rowCount: 1 };
        }),
      })
    );

    fs.promises.readdir.mockResolvedValue(['eintrag']);
    fs.promises.readFile.mockResolvedValue('ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP\n');
    fs.promises.rm.mockResolvedValue(undefined);
    envManager.updateEnvVariable.mockResolvedValue(true);
    docker.restartContainer.mockResolvedValue(true);
    require('../../src/middleware/auth').clearUserCache.mockClear();
  });

  test('Auslieferung entwertet das Erstpasswort und setzt n8n neu auf', async () => {
    const bericht = await werksreset.ausfuehren({
      stufe: 'auslieferung',
      bestaetigung: 'orin-vorfuehrer',
    });

    expect(envManager.updateEnvVariable).toHaveBeenCalledWith(
      'ADMIN_PASSWORD',
      'REDACTED_AFTER_BOOTSTRAP'
    );
    // Reihenfolge: erst entwerten, dann loeschen. Andersherum gaebe es ein
    // Fenster, in dem admin_users leer ist und das alte Passwort noch gilt.
    expect(envManager.updateEnvVariable.mock.invocationCallOrder[0]).toBeLessThan(
      db.transaction.mock.invocationCallOrder[0]
    );
    expect(clientAbfragen).toContain('DROP SCHEMA IF EXISTS n8n CASCADE');
    // Der Merker, ohne den bootstrap.js beim naechsten Start den alten Zugang
    // aus dem Docker-Secret wieder anlegt.
    expect(clientAbfragen.some(s => /INSERT INTO arasul\.geraet/.test(s))).toBe(true);
    expect(clientAbfragen).toContain('CREATE SCHEMA n8n');
    expect(docker.restartContainer).toHaveBeenCalledWith('n8n');
    // admin_users ist leer, aber requireAuth haelt Identitaeten bis zu 60 s im
    // Speicher. Ohne das Leeren kaeme die ausloesende Sitzung danach noch eine
    // Minute lang durch, gegen eine Datenbank ohne einen Administrator.
    expect(require('../../src/middleware/auth').clearUserCache).toHaveBeenCalled();
    expect(bericht.ordner.map(o => o.pfad)).toContain('/arasul/flows');
  });

  test('Inhalte lässt Passwort, n8n und Flows in Ruhe', async () => {
    const bericht = await werksreset.ausfuehren({
      stufe: 'inhalte',
      bestaetigung: 'orin-vorfuehrer',
    });

    expect(envManager.updateEnvVariable).not.toHaveBeenCalled();
    expect(clientAbfragen.some(s => s.includes('DROP SCHEMA'))).toBe(false);
    expect(clientAbfragen.some(s => /arasul\.geraet/.test(s))).toBe(false);
    expect(docker.restartContainer).not.toHaveBeenCalled();
    expect(require('../../src/middleware/auth').clearUserCache).not.toHaveBeenCalled();
    expect(bericht.ordner.map(o => o.pfad)).not.toContain('/arasul/flows');
  });

  test('ein nicht erreichbarer Nachbardienst nimmt den Reset nicht zurück', async () => {
    // Der Fall hing bis zum 24.08.2026 an Qdrant, bis zum 26.08.2026 an
    // MinIO. Beide sind ausgebaut, die Frage bleibt dieselbe: die Datenbank
    // ist zu diesem Zeitpunkt geleert, und ein toter Nachbardienst darf das
    // nicht zurücknehmen — er wird gemeldet, nicht verschwiegen.
    docker.restartContainer.mockRejectedValue(new Error('n8n antwortet nicht'));

    const bericht = await werksreset.ausfuehren({
      stufe: 'auslieferung',
      bestaetigung: 'orin-vorfuehrer',
    });

    expect(bericht.n8n).toEqual({ ok: false, fehler: 'n8n antwortet nicht' });
    expect(bericht.zeilenGesamt).toBeGreaterThan(0);
  });
});

describe('werkswert', () => {
  test('laesst einfache Literalwerte durch', () => {
    for (const wert of ["'arasul'", 'true', 'false', '10', '0.30', 'now()', "'{}'::jsonb"]) {
      expect(werksreset._werkswert(wert)).toBe(wert);
    }
  });

  test('macht aus allem anderen NULL, statt es zu uebernehmen', () => {
    for (const wert of [
      "nextval('x_seq'::regclass)",
      'gen_random_uuid()',
      "(SELECT id FROM admin_users LIMIT 1)",
      null,
    ]) {
      expect(werksreset._werkswert(wert)).toBe('NULL');
    }
  });
});

/**
 * Das Entwerten des Erstpassworts laeuft VOR der Transaktion. Scheitert es,
 * darf nichts geloescht werden: entwertetes Passwort bei heiler Datenbank ist
 * harmlos, leere Datenbank bei gueltigem Passwort ist die Luege, gegen die der
 * ganze Schritt gebaut ist.
 */
describe('Erstpasswort als Vorbedingung', () => {
  const fs = require('fs');
  const envManager = require('../../src/utils/envManager');

  beforeEach(() => {
    db.query.mockReset();
    db.transaction.mockReset();
    tabellenInDerDatenbank(ALLE);
    db.transaction.mockResolvedValue({});
    fs.promises.readdir.mockResolvedValue([]);
    fs.promises.readFile.mockResolvedValue('ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP\n');
    envManager.updateEnvVariable.mockReset();
  });

  test('ein nicht schreibbares .env bricht den Reset ab, bevor etwas weg ist', async () => {
    envManager.updateEnvVariable.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(
      werksreset.ausfuehren({ stufe: 'auslieferung', bestaetigung: 'orin-vorfuehrer' })
    ).rejects.toThrow(/bevor etwas geloescht wurde/);

    expect(db.transaction).not.toHaveBeenCalled();
  });

  test('Stufe "inhalte" fasst die .env gar nicht an', async () => {
    envManager.updateEnvVariable.mockRejectedValue(new Error('EACCES: permission denied'));

    await expect(
      werksreset.ausfuehren({ stufe: 'inhalte', bestaetigung: 'orin-vorfuehrer' })
    ).resolves.toBeDefined();

    expect(envManager.updateEnvVariable).not.toHaveBeenCalled();
  });

  test('eine gescheiterte Transaktion laesst die .env entwertet zurueck', async () => {
    // Festgehalten, nicht behoben: harmlos, weil die Anmeldung gegen den Hash
    // in der Datenbank laeuft. ADMIN_PASSWORD interessiert nur bootstrap.js,
    // und den nur, solange kein Administrator existiert.
    const envManager = require('../../src/utils/envManager');
    envManager.updateEnvVariable.mockReset();
    envManager.updateEnvVariable.mockResolvedValue(true);
    db.query.mockReset();
    db.transaction.mockReset();
    tabellenInDerDatenbank(ALLE);
    db.transaction.mockRejectedValue(new Error('Tabellen lassen sich nicht leeren'));

    await expect(
      werksreset.ausfuehren({ stufe: 'auslieferung', bestaetigung: 'orin-vorfuehrer' })
    ).rejects.toThrow(/nicht leeren/);

    expect(envManager.updateEnvVariable).toHaveBeenCalledWith(
      'ADMIN_PASSWORD',
      'REDACTED_AFTER_BOOTSTRAP'
    );
  });
});

describe('Entwertung nachlesen', () => {
  const fs = require('fs');
  const envManager = require('../../src/utils/envManager');

  test('ein zweites, nicht entwertetes ADMIN_PASSWORD bricht den Reset ab', async () => {
    db.query.mockReset();
    db.transaction.mockReset();
    tabellenInDerDatenbank(ALLE);
    db.transaction.mockResolvedValue({});
    envManager.updateEnvVariable.mockReset();
    envManager.updateEnvVariable.mockResolvedValue(true);
    // Genau der Fund vom 19.08.2026: zwei Zeilen, nur die erste ersetzt.
    fs.promises.readFile.mockResolvedValue(
      'ADMIN_PASSWORD=REDACTED_AFTER_BOOTSTRAP\nADMIN_PASSWORD=nochdas-alte\n'
    );

    await expect(
      werksreset.ausfuehren({ stufe: 'auslieferung', bestaetigung: 'orin-vorfuehrer' })
    ).rejects.toThrow(/bevor etwas geloescht wurde/);

    expect(db.transaction).not.toHaveBeenCalled();
  });
});

