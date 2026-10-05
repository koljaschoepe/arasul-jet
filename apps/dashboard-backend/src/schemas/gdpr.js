const { z } = require('zod');

// `?benutzer=<id>`: über wen die Auskunft geht (M5). Leer oder fehlend ist der
// Aufrufer selbst. Nur eine Ziffernfolge ohne fuehrende Null zaehlt als Nummer:
// `Number()` liesse auch `0x7` und `1e1` durch.
const GdprExportQuery = z.object({
  benutzer: z
    .union([
      z.literal('').transform(() => undefined),
      z
        .string()
        .regex(/^[1-9]\d{0,9}$/, '`benutzer` muss die Nummer einer Person sein.')
        .transform(Number),
    ])
    .optional(),
});

module.exports = { GdprExportQuery };
