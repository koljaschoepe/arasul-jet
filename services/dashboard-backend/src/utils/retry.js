/**
 * Retry utility for handling service failures gracefully
 * Implements exponential backoff with jitter
 */

const logger = require('./logger');

/**
 * Retry options
 * @typedef {Object} RetryOptions
 * @property {number} maxAttempts - Maximum number of retry attempts (default: 3)
 * @property {number} initialDelay - Initial delay in ms (default: 1000)
 * @property {number} maxDelay - Maximum delay in ms (default: 30000)
 * @property {number} backoffMultiplier - Backoff multiplier (default: 2)
 * @property {boolean} jitter - Add random jitter to delay (default: true)
 * @property {Function} onRetry - Callback on retry (attempt, error, delay)
 * @property {Function} shouldRetry - Function to determine if error is retryable
 */

/**
 * Default retry options
 */
const DEFAULT_OPTIONS = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    onRetry: null,
    shouldRetry: (error) => {
        // Retry on network errors, timeouts, and 5xx errors
        if (error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNRESET') {
            return true;
        }

        // Retry on 503 Service Unavailable and 502 Bad Gateway
        if (error.response && (error.response.status === 503 || error.response.status === 502)) {
            return true;
        }

        // Don't retry on 4xx errors (except 429 Too Many Requests)
        if (error.response && error.response.status >= 400 && error.response.status < 500) {
            return error.response.status === 429;
        }

        return false;
    }
};

/**
 * Calculate delay with exponential backoff and optional jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {RetryOptions} options - Retry options
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, options) {
    let delay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);

    // Apply max delay cap
    delay = Math.min(delay, options.maxDelay);

    // Add jitter if enabled (±25% randomness)
    if (options.jitter) {
        const jitterFactor = 0.25;
        const jitterAmount = delay * jitterFactor;
        delay = delay + (Math.random() * 2 - 1) * jitterAmount;
    }

    return Math.floor(delay);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {RetryOptions} options - Retry options
 * @returns {Promise<any>} Result from function
 * @throws {Error} Last error if all retries fail
 */
async function retry(fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;

    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Check if we should retry this error
            if (!opts.shouldRetry(error)) {
                logger.debug(`Error is not retryable: ${error.message}`);
                throw error;
            }

            // Don't retry if this was the last attempt
            if (attempt === opts.maxAttempts - 1) {
                logger.error(`All ${opts.maxAttempts} retry attempts failed`);
                break;
            }

            // Calculate delay for next retry
            const delay = calculateDelay(attempt, opts);

            logger.warn(`Attempt ${attempt + 1}/${opts.maxAttempts} failed: ${error.message}. Retrying in ${delay}ms...`);

            // Call onRetry callback if provided
            if (opts.onRetry) {
                try {
                    opts.onRetry(attempt + 1, error, delay);
                } catch (callbackError) {
                    logger.error(`onRetry callback failed: ${callbackError.message}`);
                }
            }

            // Wait before retrying
            await sleep(delay);
        }
    }

    // All retries failed
    throw lastError;
}

/**
 * Create a retryable version of an axios instance
 * @param {Object} axiosInstance - Axios instance
 * @param {RetryOptions} options - Retry options
 * @returns {Object} Axios instance with retry interceptor
 */
function addRetryToAxios(axiosInstance, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Add response interceptor for retries
    axiosInstance.interceptors.response.use(
        response => response,
        async (error) => {
            const config = error.config;

            // Initialize retry count
            if (!config.__retryCount) {
                config.__retryCount = 0;
            }

            // Check if we should retry
            if (config.__retryCount >= opts.maxAttempts || !opts.shouldRetry(error)) {
                return Promise.reject(error);
            }

            // Increment retry count
            config.__retryCount += 1;

            // Calculate delay
            const delay = calculateDelay(config.__retryCount - 1, opts);

            logger.warn(`Axios request retry ${config.__retryCount}/${opts.maxAttempts} for ${config.url}. Delay: ${delay}ms`);

            // Call onRetry callback if provided
            if (opts.onRetry) {
                try {
                    opts.onRetry(config.__retryCount, error, delay);
                } catch (callbackError) {
                    logger.error(`onRetry callback failed: ${callbackError.message}`);
                }
            }

            // Wait before retrying
            await sleep(delay);

            // Retry the request
            return axiosInstance(config);
        }
    );

    return axiosInstance;
}

/**
 * Retry wrapper for database queries
 * Specialized for PostgreSQL connection errors
 * @param {Function} queryFn - Async query function
 * @param {Object} options - Retry options
 * @returns {Promise<any>} Query result
 */
async function retryDatabaseQuery(queryFn, options = {}) {
    const dbOptions = {
        maxAttempts: 3,
        initialDelay: 500,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitter: true,
        shouldRetry: (error) => {
            // Retry on connection errors
            const retryableCodes = [
                'ECONNREFUSED',
                'ETIMEDOUT',
                'ENOTFOUND',
                'ECONNRESET',
                '57P03', // PostgreSQL: cannot_connect_now
                '08006', // PostgreSQL: connection_failure
                '08001', // PostgreSQL: sqlclient_unable_to_establish_sqlconnection
                '08003', // PostgreSQL: connection_does_not_exist
                '08000', // PostgreSQL: connection_exception
            ];

            return retryableCodes.includes(error.code) ||
                   error.message?.includes('Connection terminated') ||
                   error.message?.includes('Connection lost');
        },
        ...options
    };

    return retry(queryFn, dbOptions);
}

/**
 * Circuit breaker state
 */
class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 5;
        this.successThreshold = options.successThreshold || 2;
        this.timeout = options.timeout || 60000; // 1 minute
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failureCount = 0;
        this.successCount = 0;
        this.nextAttempt = Date.now();
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error('Circuit breaker is OPEN');
            }
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure();
            throw error;
        }
    }

    onSuccess() {
        this.failureCount = 0;

        if (this.state === 'HALF_OPEN') {
            this.successCount++;
            if (this.successCount >= this.successThreshold) {
                this.state = 'CLOSED';
                this.successCount = 0;
                logger.info('Circuit breaker closed');
            }
        }
    }

    onFailure() {
        this.failureCount++;
        this.successCount = 0;

        if (this.failureCount >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.timeout;
            logger.warn(`Circuit breaker opened. Will retry in ${this.timeout}ms`);
        }
    }

    getState() {
        return this.state;
    }
}

module.exports = {
    retry,
    retryDatabaseQuery,
    addRetryToAxios,
    CircuitBreaker,
    calculateDelay,
    sleep
};
