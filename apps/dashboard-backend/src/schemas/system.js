const { z } = require('zod');

// Bis Phase D4 standen hier `SetupStepBody` und `SetupCompleteBody`, die
// beiden Koerper des Einrichtungsassistenten. Der Assistent ist gestrichen
// (Begruendung in `routes/system/system.js` und Migration 179).

// POST /diagnostics
const DiagnosticsBody = z
  .object({
    days: z.number().int().min(1).max(14).optional(),
    includeLogs: z.boolean().optional(),
  })
  .strict();

module.exports = {
  DiagnosticsBody,
};
