class FallbackProvider {
  constructor(primary, fallback, options = {}) {
    this.primary = primary;
    this.fallback = fallback;
    this.model = primary.model;
    this.name = "fallback";
    this.retryablePatterns = options.retryablePatterns || [
      /timeout/i,
      /timed out/i,
      /rate limit/i,
      /429/,
      /5\d\d/,
      /network/i,
      /econnreset/i,
      /socket hang up/i,
    ];
  }

  async chat(messages, tools = [], model = null, options = {}) {
    try {
      return await this.primary.chat(messages, tools, model, options);
    } catch (err) {
      if (!this._isRetryable(err)) {
        throw err;
      }

      console.warn(`[provider] Primary failed, switching to fallback: ${err.message}`);
      return this.fallback.chat(messages, tools, model, options);
    }
  }

  _isRetryable(err) {
    const msg = String(err && err.message ? err.message : err || "");
    return this.retryablePatterns.some((pattern) => pattern.test(msg));
  }
}

module.exports = { FallbackProvider };
