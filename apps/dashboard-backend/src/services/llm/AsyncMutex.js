/**
 * P2-004: Simple async mutex for queue position protection
 * Prevents race conditions during burst enqueue operations
 *
 * RACE-FIX: release() now atomically hands lock to next waiter,
 * preventing out-of-order execution when new acquires arrive
 * between the check and unlock.
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
    // RACE-FIX: Always hand lock directly to next waiter (if any)
    // before setting _locked = false. This prevents a new acquire()
    // from jumping ahead of queued waiters.
    const next = this._waiting.shift();
    if (next) {
      // Lock stays true, ownership transfers to next waiter
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
