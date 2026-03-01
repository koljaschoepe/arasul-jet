/**
 * P2-004: Simple async mutex for queue position protection
 * Prevents race conditions during burst enqueue operations
 */
class AsyncMutex {
  constructor() {
    this._locked = false;
    this._waiting = [];
  }

  acquire() {
    return new Promise(resolve => {
      if (!this._locked) {
        this._locked = true;
        resolve();
      } else {
        this._waiting.push(resolve);
      }
    });
  }

  release() {
    if (this._waiting.length > 0) {
      const next = this._waiting.shift();
      next();
    } else {
      this._locked = false;
    }
  }

  async withLock(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

module.exports = AsyncMutex;
