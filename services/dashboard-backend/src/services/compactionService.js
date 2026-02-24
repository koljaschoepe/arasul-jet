/**
 * Compaction Service
 * Auto-summarizes older messages when the context window fills up.
 *
 * Features:
 *  - Incremental compaction (existing summary + new messages → updated summary)
 *  - /no_think prefix to disable thinking mode during compaction
 *  - Low temperature (0.3) for factual summaries
 *  - Stores summary in chat_conversations table
 *  - Logs compaction stats in compaction_log table
 *  - Pre-compaction memory flush placeholder (Phase 5 connects memoryService)
 */

const logger = require('../utils/logger');
const database = require('../database');
const services = require('../config/services');
const { estimateTokens } = require('./tokenService');

const LLM_SERVICE_URL = services.llm.url;

/**
 * Compact older messages into a summary.
 *
 * @param {Object} params
 * @param {number} params.conversationId - Conversation to compact
 * @param {Array<{role: string, content: string}>} params.messagesToCompact - Older messages to summarize
 * @param {string|null} params.existingSummary - Previous summary for incremental update
 * @param {string} params.model - Model to use for summarization
 * @param {number} params.targetTokens - Target token count for the summary
 * @returns {Promise<{summary: string, tokensBefore: number, tokensAfter: number, memoriesExtracted: number}>}
 */
async function compactMessages({
  conversationId,
  messagesToCompact,
  existingSummary = null,
  model,
  targetTokens = 400,
}) {
  const startTime = Date.now();

  if (!messagesToCompact || messagesToCompact.length === 0) {
    return {
      summary: existingSummary || '',
      tokensBefore: 0,
      tokensAfter: 0,
      memoriesExtracted: 0,
    };
  }

  // STEP 1: Pre-Compaction Memory Flush - extract important facts BEFORE summarizing
  let memoriesExtracted = 0;
  try {
    const memoryService = require('./memoryService');
    const extracted = await memoryService.extractMemories(messagesToCompact, model);
    if (extracted.length > 0) {
      memoriesExtracted = await memoryService.saveMemories(extracted, conversationId);
      logger.info(
        `[Compaction] Pre-flush: ${memoriesExtracted} memories extracted from ${messagesToCompact.length} messages`
      );
    }
  } catch (memErr) {
    logger.warn(`[Compaction] Memory flush failed (non-critical): ${memErr.message}`);
  }

  // STEP 2: Compaction - summarize the messages
  // Calculate tokens before compaction
  const tokensBefore = messagesToCompact.reduce(
    (sum, msg) => sum + estimateTokens(msg.content || ''),
    0
  );

  // Format messages for the compaction prompt
  const formattedMessages = messagesToCompact
    .map(m => `${m.role === 'user' ? 'Benutzer' : 'Assistent'}: ${m.content}`)
    .join('\n\n');

  // Build the compaction prompt
  const prompt = buildCompactionPrompt(formattedMessages, existingSummary, targetTokens);

  // Call Ollama (non-streaming, low temperature)
  let summary;
  try {
    summary = await callOllamaNonStreaming(model, prompt, targetTokens);
  } catch (err) {
    logger.error(`[Compaction] Failed to generate summary: ${err.message}`);
    // Fallback: use a simple truncation
    summary = buildFallbackSummary(messagesToCompact, targetTokens);
  }

  // Clean up the summary (remove thinking blocks if any leaked through)
  summary = summary.replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\n]+|[\s\n]+$/g, '');

  const tokensAfter = estimateTokens(summary);
  const compressionRatio =
    tokensBefore > 0 ? Math.round((1 - tokensAfter / tokensBefore) * 100) : 0;

  const duration = Date.now() - startTime;

  logger.info(
    `[Compaction] Conv ${conversationId}: ${messagesToCompact.length} messages, ` +
      `${tokensBefore} → ${tokensAfter} tokens (${compressionRatio}% reduction) in ${duration}ms`
  );

  // Save compaction summary to conversation
  await saveCompactionSummary(conversationId, summary, {
    messageCount: messagesToCompact.length,
    tokenCount: tokensAfter,
  });

  // Log compaction stats
  try {
    await database.query(
      `INSERT INTO compaction_log
        (conversation_id, messages_compacted, tokens_before, tokens_after, compression_ratio, memories_extracted, model_used, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        conversationId,
        messagesToCompact.length,
        tokensBefore,
        tokensAfter,
        compressionRatio,
        memoriesExtracted,
        model,
        duration,
      ]
    );
  } catch (logErr) {
    logger.debug(`[Compaction] Failed to log stats: ${logErr.message}`);
  }

  return {
    summary,
    tokensBefore,
    tokensAfter,
    memoriesExtracted,
  };
}

/**
 * Build the compaction prompt optimized for local German models.
 */
function buildCompactionPrompt(formattedMessages, existingSummary, targetTokens) {
  const existingPart = existingSummary
    ? `Bisherige Zusammenfassung:\n${existingSummary}\n\nNeue Nachrichten:\n`
    : '';

  return `/no_think
Fasse das folgende Gespraech praezise zusammen.

BEHALTE:
- Hauptthema und Ziel
- Konkrete Fakten, Zahlen, Dateinamen, URLs
- Getroffene Entscheidungen
- Offene Fragen und naechste Schritte

IGNORIERE:
- Hoeflichkeitsfloskeln und Smalltalk
- Wiederholungen
- Fehlgeschlagene Versuche (nur das Endergebnis)

${existingPart}${formattedMessages}

Zusammenfassung (maximal ${Math.round(targetTokens * 0.75)} Woerter):`;
}

/**
 * Call Ollama with non-streaming request (for compaction/summarization).
 *
 * @param {string} model - Model name
 * @param {string} prompt - Prompt text
 * @param {number} maxTokens - Max response tokens
 * @returns {Promise<string>} Generated text
 */
async function callOllamaNonStreaming(model, prompt, maxTokens) {
  // Resolve ollama_name from catalog
  let ollamaName = model;
  try {
    const result = await database.query(
      `SELECT COALESCE(ollama_name, id) as effective_ollama_name FROM llm_model_catalog WHERE id = $1`,
      [model]
    );
    if (result.rows.length > 0) {
      ollamaName = result.rows[0].effective_ollama_name;
    }
  } catch {
    // Use model as-is
  }

  const response = await fetch(`${LLM_SERVICE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaName,
      prompt,
      stream: false,
      keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),
      options: {
        temperature: 0.3,
        num_predict: maxTokens * 2, // Allow some headroom
      },
    }),
    signal: AbortSignal.timeout(60000), // 60s timeout for compaction
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();
  return data.response || '';
}

/**
 * Build a simple fallback summary when LLM compaction fails.
 * Takes the first and last message as anchors.
 */
function buildFallbackSummary(messages, targetTokens) {
  if (messages.length === 0) {return '';}

  const parts = [];
  const first = messages[0];
  parts.push(
    `Beginn: ${first.role === 'user' ? 'Benutzer' : 'Assistent'} - ${(first.content || '').substring(0, 200)}`
  );

  if (messages.length > 1) {
    const last = messages[messages.length - 1];
    parts.push(
      `Ende: ${last.role === 'user' ? 'Benutzer' : 'Assistent'} - ${(last.content || '').substring(0, 200)}`
    );
  }

  parts.push(`(${messages.length} Nachrichten zusammengefasst)`);
  return parts.join('\n');
}

/**
 * Get the existing compaction summary for a conversation.
 *
 * @param {number} conversationId
 * @returns {Promise<{summary: string|null, tokenCount: number, messageCount: number}>}
 */
async function getCompactionSummary(conversationId) {
  try {
    const result = await database.query(
      `SELECT compaction_summary, compaction_token_count, compaction_message_count
       FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );

    if (result.rows.length === 0) {
      return { summary: null, tokenCount: 0, messageCount: 0 };
    }

    const row = result.rows[0];
    return {
      summary: row.compaction_summary,
      tokenCount: row.compaction_token_count || 0,
      messageCount: row.compaction_message_count || 0,
    };
  } catch (err) {
    logger.error(`[Compaction] Failed to get summary for conv ${conversationId}: ${err.message}`);
    return { summary: null, tokenCount: 0, messageCount: 0 };
  }
}

/**
 * Save compaction summary to the conversation.
 *
 * @param {number} conversationId
 * @param {string} summary
 * @param {Object} metadata
 * @param {number} metadata.messageCount - Number of messages compacted
 * @param {number} metadata.tokenCount - Token count of summary
 */
async function saveCompactionSummary(conversationId, summary, { messageCount, tokenCount }) {
  try {
    await database.query(
      `UPDATE chat_conversations
       SET compaction_summary = $1,
           compaction_token_count = $2,
           compaction_message_count = COALESCE(compaction_message_count, 0) + $3,
           last_compacted_at = NOW()
       WHERE id = $4`,
      [summary, tokenCount, messageCount, conversationId]
    );
  } catch (err) {
    logger.error(`[Compaction] Failed to save summary for conv ${conversationId}: ${err.message}`);
  }
}

module.exports = {
  compactMessages,
  getCompactionSummary,
  saveCompactionSummary,
  // Exported for testing
  buildCompactionPrompt,
  buildFallbackSummary,
};
