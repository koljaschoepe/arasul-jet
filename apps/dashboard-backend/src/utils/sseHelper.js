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
}

/**
 * Track client connection state via res close/error events
 * @param {import('express').Response} res - Express response object
 * @returns {{ isConnected: () => boolean, onClose: (callback: Function) => void }}
 */
function trackConnection(res) {
  let connected = true;
  let closeCallback = null;

  const cleanup = () => {
    connected = false;
    if (closeCallback) {
      closeCallback();
    }
  };

  res.on('close', cleanup);
  res.on('error', error => {
    logger.debug(`SSE response error: ${error.message}`);
    cleanup();
  });

  return {
    isConnected: () => connected,
    onClose: callback => {
      closeCallback = callback;
    },
  };
}

module.exports = { initSSE, trackConnection };
