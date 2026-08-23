const { z } = require('zod');

const ModelIdField = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/, {
    message: 'Ungültige model_id (erlaubt: Buchstaben, Ziffern, . : - _ /)',
  });

const DownloadBody = z
  .object({
    model_id: ModelIdField,
  })
  .strict();

const DefaultModelBody = z
  .object({
    model_id: ModelIdField,
  })
  .strict();

// Was ein Mensch einfuegt, wenn er ein Modell hinzufuegen will: eine Adresse,
// eine Kurzform oder ein Ollama-Name. Die Feinpruefung macht `modellQuelle`,
// hier steht nur die Grenze, hinter der es sicher kein Link mehr ist.
const QuelleField = z.string().trim().min(1).max(300);

const QuellePruefenBody = z
  .object({
    quelle: QuelleField,
  })
  .strict();

const KatalogHinzufuegenBody = z
  .object({
    quelle: QuelleField,
    // Die Quantisierung, zum Beispiel `IQ4_XS`. Bei Ollama-Modellen steckt sie
    // schon im Namen (`llama3.2:3b`) und darf hier fehlen.
    variante: z
      .string()
      .trim()
      .max(60)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, { message: 'Ungültige Variante' })
      .optional(),
    name: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

module.exports = {
  ModelIdField,
  DownloadBody,
  DefaultModelBody,
  QuellePruefenBody,
  KatalogHinzufuegenBody,
};
