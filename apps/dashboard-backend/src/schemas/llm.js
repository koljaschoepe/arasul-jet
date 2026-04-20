const { z } = require('zod');

const PrioritizeJobBody = z
  .object({
    job_id: z.string().trim().min(1).max(128),
  })
  .strict();

module.exports = {
  PrioritizeJobBody,
};
