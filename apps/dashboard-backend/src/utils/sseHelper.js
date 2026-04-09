/**
 * SSE (Server-Sent Events) helper utilities
 * Eliminates duplicate header setup and connection tracking across routes
 */

const logger = require('./logger');

/**
 * Set the 4 standard SSE headers on a response
 * @param {import('express').Response} res - Express response object
 */
function initSSE(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  // Flush headers immediately so the browser opens the stream without delay
  res.flushHeaders();

  // SSE-KEEPALIVE: Send comment every 15s to prevent proxy idle-timeout kills (Traefik default: 60s)
  const keepaliveId = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keepalive\n\n');
    } else {
      clearInterval(keepaliveId);
    }
  }, 15000);
  res.on('close', () => clearInterval(keepaliveId));
}

/**
 * Track client connection state via res close/error events
 * BE7: Properly remove event listeners after cleanup to prevent memory leaks
 * @param {import('express').Response} res - Express response object
 * @returns {{ isConnected: () => boolean, onClose: (callback: Function) => void }}
 */
function trackConnection(res) {
  let connected = true;
  let closeCallback = null;

  const cleanup = () => {
    if (!connected) {
      return;
    } // Prevent double cleanup
    connected = false;
    res.removeListener('close', cleanup);
    res.removeListener('error', onError);
    if (closeCallback) {
      closeCallback();
    }
  };

  const onError = error => {
    logger.debug(`SSE connection error: ${error.message}`);
    cleanup();
    if (!res.writableEnded) {
      res.end();
    }
  };

  res.on('close', cleanup);
  res.on('error', onError);

  return {
    isConnected: () => connected,
    onClose: callback => {
      closeCallback = callback;
    },
  };
}

module.exports = { initSSE, trackConnection };
