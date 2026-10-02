const { z } = require('zod');

// POST /ereignisse -- vom Ausgangs-Proxy (services/egress-proxy)
const EreignisseBody = z
  .object({
    ereignisse: z
      .array(
        z
          .object({
            app_id: z.string().min(1).max(64),
            stand: z.enum(['live', 'test']),
            host: z.string().min(1).max(253),
            ergebnis: z.enum(['erlaubt', 'abgewiesen']),
            anzahl: z.number().int().min(1),
            zuletzt: z.string().datetime(),
          })
          .strict()
      )
      .max(1000),
  })
  .strict();

module.exports = { EreignisseBody };
