/**
 * Flow-Agent-Tool: `minio` — liest/schreibt Dateien im Dokumente-Bucket.
 *
 * WICHTIG (Isolation): Jeder Agent ist auf ein NUTZER-eigenes Präfix
 * `flow-agents/<userId>/…` beschränkt. Er kann damit weder fremde Dokumente
 * noch die allgemeinen Upload-Objekte lesen oder überschreiben — nur seine
 * eigenen Agenten-Dateien. Der vom Modell gelieferte Pfad wird zusätzlich über
 * die bestehenden MinIO-Sicherheits-Helfer (isValidMinioPath) gegen
 * Path-Traversal gejailt. Größen sind gedeckelt. Rein lokal (interner MinIO).
 */

const BaseTool = require('../../../tools/baseTool');
const minioService = require('../../documents/minioService');
const logger = require('../../../utils/logger');

const MAX_READ_BYTES = 256 * 1024; // 256 KiB Text
const MAX_WRITE_BYTES = 256 * 1024;

// Liest bis zu `cap` Bytes; signalisiert Abschneiden über ein Flag statt Wurf
// (Backend-Konvention: keine rohen Error in Service-Code).
async function streamToBuffer(stream, cap) {
  const chunks = [];
  let total = 0;
  let truncated = false;
  for await (const chunk of stream) {
    if (total + chunk.length > cap) {
      chunks.push(chunk.subarray(0, cap - total));
      truncated = true;
      break;
    }
    chunks.push(chunk);
    total += chunk.length;
  }
  return { buffer: Buffer.concat(chunks), truncated };
}

class MinioTool extends BaseTool {
  get name() {
    return 'minio';
  }

  get description() {
    return 'Liest oder schreibt eine Datei im lokalen Dokumente-Speicher (MinIO)';
  }

  get parameters() {
    return {
      aktion: {
        type: 'string',
        description: 'read (lesen) oder write (schreiben)',
        enum: ['read', 'write'],
        required: true,
      },
      pfad: {
        type: 'string',
        description: 'Objekt-/Dateiname im Dokumente-Bucket',
        required: true,
      },
      inhalt: {
        type: 'string',
        description: 'Nur bei write: der zu schreibende Textinhalt',
      },
    };
  }

  async execute(params = {}, context = {}) {
    const aktion = String(params.aktion || '').trim();
    const pfad = String(params.pfad || '').trim();
    const userId = context.userId;

    if (!userId) {
      // Ohne Nutzer-Scope kein Datei-Zugriff (Fail-closed).
      return 'Fehler: Datei-Tool ohne Nutzer-Kontext nicht verfügbar.';
    }
    if (!pfad || !minioService.isValidMinioPath(pfad)) {
      return 'Fehler: ungültiger oder unsicherer Pfad.';
    }

    // Auf das nutzer-eigene Agenten-Präfix beschränken — nie fremde Objekte.
    const key = `flow-agents/${userId}/${pfad}`;

    try {
      if (aktion === 'read') {
        const stream = await minioService.getObject(key);
        const { buffer, truncated } = await streamToBuffer(stream, MAX_READ_BYTES);
        const suffix = truncated ? '\n… (gekürzt)' : '';
        return `Inhalt von "${pfad}":\n${buffer.toString('utf8')}${suffix}`;
      }
      if (aktion === 'write') {
        const inhalt = String(params.inhalt ?? '');
        const buf = Buffer.from(inhalt, 'utf8');
        if (buf.length > MAX_WRITE_BYTES) {
          return `Fehler: Inhalt größer als ${Math.round(MAX_WRITE_BYTES / 1024)} KiB.`;
        }
        await minioService.enforceQuota(buf.length);
        await minioService.uploadObject(key, buf, buf.length, {
          'Content-Type': 'text/plain; charset=utf-8',
        });
        return `Datei "${pfad}" geschrieben (${buf.length} Bytes).`;
      }
      return 'Fehler: "aktion" muss "read" oder "write" sein.';
    } catch (err) {
      logger.warn(`Flow-Agent minio-Tool (${aktion} ${pfad}): ${err.message}`);
      return `MinIO-Fehler: ${err.message}`;
    }
  }
}

module.exports = MinioTool;
