/**
 * Context Budget Manager
 * Heart of the context management system.
 *
 * Called before every LLM request to:
 *  1. Calculate token budget based on model's context window
 *  2. Prune messages (remove thinking blocks, truncate old tool results)
 *  3. Window conversation history to fit budget
 *  4. Trigger compaction when needed (>70% + dropped messages)
 *  5. Inject Tier 3 summary from previous compactions
 */

const logger = require('../../utils/logger');
const { estimateTokens, truncateToTokens } = require('../core/tokenService');
const modelContextService = require('./modelContextService');
const compactionService = require('../memory/compactionService');

/**
 * Build an optimized prompt that fits within the model's context window.
 *
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.messages - All conversation messages
 * @param {string} params.systemPrompt - System prompt (company context etc.)
 * @param {string} params.model - Model name for budget lookup
 * @param {number|null} params.conversationId - For compaction lookup
 * @param {string|null} params.ragContext - Optional RAG context
 * @returns {Promise<Object>} Optimized prompt with token breakdown
 */
async function buildOptimizedPrompt({
  messages = [],
  systemPrompt = '',
  model,
  conversationId = null,
  ragContext = null,
}) {
  const budget = await modelContextService.getTokenBudget(model);
  const recommendedCtx = await modelContextService.getRecommendedCtx(model);

  // Step 1: Calculate fixed token costs
  const systemTokens = estimateTokens(systemPrompt);
  const ragTokens = ragContext ? estimateTokens(ragContext) : 0;

  // Step 2: Tier 3 - Load existing compaction summary
  let tier3Content = '';
  let tier3Tokens = 0;
  let compactionResult = null;

  if (conversationId) {
    const existing = await compactionService.getCompactionSummary(conversationId);
    if (existing.summary) {
      tier3Content = existing.summary;
      tier3Tokens = estimateTokens(tier3Content);
    }
  }

  // Step 3: Calculate available budget for conversation history
  const fixedCost = systemTokens + tier3Tokens + ragTokens;
  const historyBudget = budget.contextWindow - budget.responseReserve - fixedCost;

  // Step 4: Prune messages (transient, doesn't modify originals)
  const prunedMessages = pruneMessages(messages);

  // Step 5: Window messages (newest first) to fit budget
  const { includedMessages, droppedCount, historyTokens } = windowMessages(
    prunedMessages,
    historyBudget
  );

  // Step 6: Trigger compaction if messages were dropped
  if (droppedCount > 0 && conversationId) {
    // Collect the dropped messages (oldest ones that didn't fit)
    const droppedMessages = prunedMessages.slice(0, droppedCount);

    try {
      compactionResult = await compactionService.compactMessages({
        conversationId,
        messagesToCompact: droppedMessages,
        existingSummary: tier3Content || null,
        model,
        targetTokens: budget.tier3Summary,
      });

      // Update tier3 with new summary
      tier3Content = compactionResult.summary;
      tier3Tokens = estimateTokens(tier3Content);

      logger.info(
        `[ContextBudget] Compaction complete: ${compactionResult.tokensBefore} → ${compactionResult.tokensAfter} tokens`
      );
    } catch (compErr) {
      logger.error(`[ContextBudget] Compaction failed: ${compErr.message}`);
      // Continue without compaction - messages are still windowed
    }
  }

  // Step 7: Recalculate total after potential compaction
  const totalUsed = systemTokens + tier3Tokens + ragTokens + historyTokens;
  const utilization = budget.contextWindow > 0 ? totalUsed / budget.contextWindow : 0;

  // Step 8: Build the final prompt string
  // Prepend Tier 3 summary if available
  const promptParts = [];
  if (tier3Content) {
    promptParts.push(
      `[Zusammenfassung frueherer Nachrichten]\n${tier3Content}\n[Ende Zusammenfassung]`
    );
  }
  promptParts.push(includedMessages.map(m => `${m.role}: ${m.content}`).join('\n'));
  const prompt = promptParts.join('\n\n');

  const tokenBreakdown = {
    system: systemTokens,
    tier3: tier3Tokens,
    rag: ragTokens,
    history: historyTokens,
    total: totalUsed,
    budget: budget.contextWindow,
    responseReserve: budget.responseReserve,
    utilization: Math.round(utilization * 100) / 100,
    messagesIncluded: includedMessages.length,
    messagesDropped: droppedCount,
    compacted: !!compactionResult,
  };

  if (droppedCount > 0 || compactionResult) {
    logger.info(
      `[ContextBudget] ${model}: ${includedMessages.length}/${messages.length} messages, ` +
        `${totalUsed}/${budget.contextWindow} tokens (${Math.round(utilization * 100)}%)` +
        (compactionResult
          ? ` [compacted ${compactionResult.tokensBefore}→${compactionResult.tokensAfter}]`
          : ` [${droppedCount} dropped]`)
    );
  }

  // Dynamic num_ctx: size KV cache to actual prompt + response reserve, not fixed maximum.
  // Smaller num_ctx = faster prefill, less GPU memory. Round up to next power of 2.
  const dynamicNumCtx = Math.max(
    4096, // Minimum for KV cache efficiency
    Math.min(
      Math.pow(2, Math.ceil(Math.log2(totalUsed + budget.responseReserve))),
      recommendedCtx // Never exceed model's recommended maximum
    )
  );

  return {
    prompt,
    systemPrompt,
    messages: includedMessages,
    numCtx: dynamicNumCtx,
    compactionNeeded: false, // Already handled
    compactionResult,
    droppedMessages: droppedCount,
    tokenBreakdown,
  };
}

/**
 * Prune messages to reduce token usage without losing meaning.
 * This is TRANSIENT - does NOT modify the database.
 *
 * Pruning rules:
 *  1. Remove thinking blocks from assistant messages
 *  2. Truncate old tool results (older than 4 messages from end)
 *  3. Truncate extremely long messages (>500 tokens, except the last one)
 *  4. Remove system compaction banners
 *
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Array<{role: string, content: string}>}
 */
function pruneMessages(messages) {
  if (!messages || messages.length === 0) {
    return [];
  }

  const lastIdx = messages.length - 1;

  return messages
    .map((msg, idx) => {
      let content = msg.content || '';

      // 1. Strip thinking blocks (<think>...</think>)
      content = content.replace(/<think>[\s\S]*?<\/think>/g, '');

      // 2. Truncate old tool results (more than 4 messages from the end)
      if (idx < lastIdx - 4 && msg.role === 'assistant' && hasToolResult(content)) {
        content = truncateToolResults(content, 200);
      }

      // 3. Truncate extremely long messages (except the latest user message)
      if (idx < lastIdx) {
        const msgTokens = estimateTokens(content);
        if (msgTokens > 500) {
          content = truncateToTokens(content, 500) + '\n[... gekuerzt]';
        }
      }

      // 4. Remove compaction banner messages
      if (msg.role === 'system' && msg.type === 'compaction') {
        return null; // Will be filtered out
      }

      return { ...msg, content: content.trim() };
    })
    .filter(Boolean); // Remove nulls from compaction banners
}

/**
 * Check if a message content likely contains tool/function results.
 * @param {string} content
 * @returns {boolean}
 */
function hasToolResult(content) {
  return (
    content.includes('```json') ||
    content.includes('Ergebnis:') ||
    content.includes('Result:') ||
    content.includes('Output:') ||
    content.includes('{"') ||
    content.includes('[{"')
  );
}

/**
 * Truncate tool results in a message while keeping the surrounding text.
 * @param {string} content
 * @param {number} maxTokens - Max tokens for tool result portions
 * @returns {string}
 */
function truncateToolResults(content, maxTokens) {
  // Truncate JSON blocks
  const truncated = content.replace(/```(?:json|javascript|js)?\n([\s\S]*?)```/g, (match, code) => {
    if (estimateTokens(code) > maxTokens) {
      return '```\n' + truncateToTokens(code, maxTokens) + '\n[... gekuerzt]\n```';
    }
    return match;
  });

  // Truncate inline JSON objects/arrays
  return truncated.replace(/(\{[\s\S]{800,}?\}|\[[\s\S]{800,}?\])/g, match => {
    if (estimateTokens(match) > maxTokens) {
      return truncateToTokens(match, maxTokens) + '... [gekuerzt]';
    }
    return match;
  });
}

/**
 * Window messages to fit within a token budget.
 * Keeps newest messages, drops oldest.
 *
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} budgetTokens - Max tokens for history
 * @returns {{includedMessages: Array, droppedCount: number, historyTokens: number}}
 */
function windowMessages(messages, budgetTokens) {
  if (!messages || messages.length === 0) {
    return { includedMessages: [], droppedCount: 0, historyTokens: 0 };
  }

  // If budget is very small, include at least the last message
  if (budgetTokens <= 0) {
    const lastMsg = messages[messages.length - 1];
    return {
      includedMessages: [lastMsg],
      droppedCount: messages.length - 1,
      historyTokens: estimateTokens(lastMsg.content) + 4,
    };
  }

  const included = [];
  let runningTokens = 0;

  // Walk from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const msgTokens = estimateTokens(msg.content) + 4; // +4 for role/formatting overhead

    if (runningTokens + msgTokens > budgetTokens && included.length > 0) {
      // Budget exceeded - stop including older messages
      break;
    }

    included.unshift(msg);
    runningTokens += msgTokens;
  }

  return {
    includedMessages: included,
    droppedCount: messages.length - included.length,
    historyTokens: runningTokens,
  };
}

module.exports = {
  buildOptimizedPrompt,
  // Exported for testing
  pruneMessages,
  windowMessages,
};
