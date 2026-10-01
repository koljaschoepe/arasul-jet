/**
 * Spark und Thor auseinanderhalten (J4, 01.10.2026).
 *
 * Ein DGX Spark hat 20 Kerne und 128 GB -- dieselben Zahlen, an denen der
 * Rueckfall in `utils/hardware.js` einen Thor erkennt. Vor J4 hielt das
 * Backend ihn deshalb fuer einen Thor und rechnete die GPU aus dem
 * Arbeitsspeicher. Gemessen wird hier ohne Geraet: Dateien, Kerne und
 * nvidia-smi sind gespielt, und jeder Fall laedt das Modul neu, weil es die
 * Erkennung zwischenspeichert.
 */

const GB = 1024 * 1024 * 1024;

const CPUINFO_SPARK = [
  'processor\t: 0',
  'CPU implementer\t: 0x41',
  'CPU part\t: 0xd85',
  '',
  'processor\t: 10',
  'CPU part\t: 0xd87',
].join('\n');
const CPUINFO_THOR = 'processor\t: 0\nCPU implementer\t: 0x41\nCPU part\t: 0xd83\n';
const CPUINFO_ORIN = 'processor\t: 0\nCPU implementer\t: 0x41\nCPU part\t: 0xd42\n';

/**
 * Laedt hardware.js mit einem gespielten Rechner.
 * @param {object} p
 * @param {Record<string,string>} p.dateien  Pfad -> Inhalt; fehlende werfen ENOENT
 * @param {number} p.kerne
 * @param {number} p.speicherGB
 * @param {string|null} p.smi  Ausgabe von nvidia-smi im Container, null = keins
 * @param {object|null} p.llm  Antwort von llm-service /api/gpu, null = nicht erreichbar
 */
function laden({
  dateien = {},
  kerne = 20,
  speicherGB = 128,
  smi = null,
  llm = null,
  arch = 'arm64',
}) {
  let modul;
  const fetchAufrufe = [];
  jest.isolateModules(() => {
    jest.doMock('os', () => {
      const echt = jest.requireActual('os');
      return {
        ...echt,
        arch: () => arch,
        cpus: () => Array.from({ length: kerne }, () => ({ model: '' })),
        totalmem: () => speicherGB * GB,
        freemem: () => 100 * GB,
      };
    });
    jest.doMock('fs', () => {
      const echt = jest.requireActual('fs');
      return {
        ...echt,
        promises: {
          ...echt.promises,
          readFile: jest.fn(async pfad => {
            if (Object.prototype.hasOwnProperty.call(dateien, pfad)) {
              return dateien[pfad];
            }
            const fehler = new Error(`ENOENT: ${pfad}`);
            fehler.code = 'ENOENT';
            throw fehler;
          }),
        },
      };
    });
    jest.doMock('child_process', () => ({
      execFile: jest.fn((befehl, argumente, optionen, rueckruf) => {
        const fertig = typeof optionen === 'function' ? optionen : rueckruf;
        if (befehl === 'nvidia-smi' && smi !== null) {
          fertig(null, { stdout: smi, stderr: '' });
        } else {
          fertig(Object.assign(new Error('spawn nvidia-smi ENOENT'), { code: 'ENOENT' }));
        }
      }),
    }));
    global.fetch = jest.fn(async url => {
      fetchAufrufe.push(url);
      if (llm === null) {
        throw new Error('ECONNREFUSED');
      }
      return { json: async () => llm };
    });
    modul = require('../../src/utils/hardware');
  });
  return { hw: modul, fetchAufrufe };
}

describe('hardware.js: DGX Spark, Thor und Orin', () => {
  const alteUmgebung = process.env.JETSON_PROFILE;
  const altesFetch = global.fetch;

  beforeEach(() => {
    delete process.env.JETSON_PROFILE;
  });

  afterEach(() => {
    jest.resetModules();
    global.fetch = altesFetch;
    if (alteUmgebung === undefined) {
      delete process.env.JETSON_PROFILE;
    } else {
      process.env.JETSON_PROFILE = alteUmgebung;
    }
  });

  test('ein Spark mit 20 Kernen und 128 GB ist ein Spark, kein Thor', async () => {
    const { hw } = laden({ dateien: { '/proc/cpuinfo': CPUINFO_SPARK } });
    const geraet = await hw.detectDevice();
    expect(geraet.type).toBe('dgx_spark');
    expect(geraet.name).toBe('NVIDIA DGX Spark');
  });

  test('JETSON_PROFILE=dgx_spark genuegt, auch ohne lesbare cpuinfo', async () => {
    process.env.JETSON_PROFILE = 'dgx_spark';
    const { hw } = laden({});
    expect((await hw.detectDevice()).type).toBe('dgx_spark');
  });

  test('ein Thor mit denselben Zahlen bleibt ein Thor', async () => {
    const { hw } = laden({ dateien: { '/proc/cpuinfo': CPUINFO_THOR } });
    expect((await hw.detectDevice()).type).toBe('thor_128gb');
  });

  test('ein Geraet mit Tegra-Marker ist nie ein Spark, auch mit X925 in der cpuinfo', async () => {
    const { hw } = laden({
      dateien: {
        '/etc/nv_tegra_release': '# R36 (release), REVISION: 4.7, TEGRA ...',
        '/proc/cpuinfo': CPUINFO_SPARK,
      },
    });
    expect((await hw.detectDevice()).type).toBe('thor_128gb');
  });

  test('der Orin ist unveraendert ein Orin, GPU wie bisher aus dem Arbeitsspeicher', async () => {
    const { hw, fetchAufrufe } = laden({
      kerne: 12,
      speicherGB: 64,
      dateien: {
        '/etc/nv_tegra_release': '# R36 (release), REVISION: 4.7, TEGRA ...',
        '/proc/device-tree/model': 'NVIDIA Jetson AGX Orin Developer Kit\0',
        '/proc/cpuinfo': CPUINFO_ORIN,
      },
    });
    expect((await hw.detectDevice()).type).toBe('jetson_agx_orin_64gb');
    const gpu = await hw.getGpuInfo();
    expect(gpu.available).toBe(true);
    expect(gpu.unified).toBe(true);
    expect(gpu.memoryTotalMB).toBe(64 * 1024);
    expect(gpu.name).toBe('NVIDIA Jetson AGX Orin 64GB (Unified Memory)');
    expect(fetchAufrufe).toHaveLength(0);
  });

  test('am Spark kommen GPU-Name und Speicher aus nvidia-smi', async () => {
    const { hw } = laden({
      dateien: { '/proc/cpuinfo': CPUINFO_SPARK },
      smi: 'NVIDIA GB10, 122880, 110000, 580.95.05\n',
    });
    const gpu = await hw.getGpuInfo();
    expect(gpu).toMatchObject({
      available: true,
      name: 'NVIDIA GB10',
      memoryTotalMB: 122880,
      memoryFreeMB: 110000,
      driverVersion: '580.95.05',
      memorySource: 'nvidia-smi',
      unified: true,
    });
  });

  test('ohne nvidia-smi im Container fragt das Backend den llm-service', async () => {
    const { hw, fetchAufrufe } = laden({
      dateien: { '/proc/cpuinfo': CPUINFO_SPARK },
      llm: {
        available: true,
        name: 'NVIDIA GB10',
        memory_total_mb: 122880,
        memory_free_mb: 90000,
        driver_version: '580.95.05',
      },
    });
    const gpu = await hw.getGpuInfo();
    expect(fetchAufrufe[0]).toMatch(/:11436\/api\/gpu$/);
    expect(gpu).toMatchObject({ name: 'NVIDIA GB10', memoryTotalMB: 122880, memoryFreeMB: 90000 });
  });

  test('nennt nvidia-smi keinen Speicher ([N/A]), gilt der Arbeitsspeicher', async () => {
    const { hw } = laden({
      dateien: { '/proc/cpuinfo': CPUINFO_SPARK },
      smi: 'NVIDIA GB10, [N/A], [N/A], 580.95.05\n',
    });
    const gpu = await hw.getGpuInfo();
    expect(gpu).toMatchObject({
      available: true,
      name: 'NVIDIA GB10',
      memoryTotalMB: 128 * 1024,
      memorySource: 'arbeitsspeicher',
    });
  });

  test('ist nvidia-smi nirgends lesbar, meldet der Spark keine GPU statt eines Thor', async () => {
    const { hw } = laden({ dateien: { '/proc/cpuinfo': CPUINFO_SPARK } });
    expect(await hw.getGpuInfo()).toEqual({ available: false });
  });

  test('die Empfehlung am Spark ist das Standardmodell der Kurzliste', async () => {
    process.env.JETSON_PROFILE = 'dgx_spark';
    const { hw } = laden({});
    const empfehlung = await hw.getRecommendedModel();
    expect(empfehlung.profile).toBe('dgx_spark');
    expect(empfehlung.model).toBe('qwen3.8:27b-q4_K_M');
  });
});
