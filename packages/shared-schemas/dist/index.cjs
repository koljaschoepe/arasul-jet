"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ChatBody: () => ChatBody,
  PrioritizeJobBody: () => PrioritizeJobBody
});
module.exports = __toCommonJS(index_exports);

// src/llm.ts
var import_zod = require("zod");
var PrioritizeJobBody = import_zod.z.object({
  job_id: import_zod.z.string().trim().min(1).max(128)
}).strict();
var ChatBody = import_zod.z.object({
  messages: import_zod.z.array(import_zod.z.record(import_zod.z.string(), import_zod.z.unknown()), {
    error: "Messages array is required"
  }),
  conversation_id: import_zod.z.union([import_zod.z.string().min(1), import_zod.z.number().int().positive()], {
    error: "conversation_id is required for chat streaming"
  }),
  temperature: import_zod.z.number().optional(),
  max_tokens: import_zod.z.number().int().positive().optional(),
  stream: import_zod.z.boolean().optional(),
  thinking: import_zod.z.boolean().optional(),
  model: import_zod.z.string().max(200).optional().nullable(),
  model_sequence: import_zod.z.array(import_zod.z.string().max(200)).max(10).optional().nullable(),
  priority: import_zod.z.number().int().min(0).max(10).optional(),
  images: import_zod.z.array(import_zod.z.string()).max(5, "Maximal 5 Bilder pro Nachricht erlaubt").optional().nullable()
}).strict();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ChatBody,
  PrioritizeJobBody
});
