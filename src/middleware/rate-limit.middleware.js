const { AppError } = require("../errors/app-error");

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function createRateLimitMiddleware(options = {}) {
  const windowMs = parsePositiveInteger(
    options.windowMs || process.env.API_RATE_LIMIT_WINDOW_MS,
    1000
  );
  const maxRequests = parsePositiveInteger(
    options.maxRequests || process.env.API_RATE_LIMIT_MAX_REQUESTS,
    10
  );
  const store = new Map();

  return function rateLimitMiddleware(req, res, next) {
    if (req.method === "OPTIONS") {
      return next();
    }

    const clientIp = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const currentEntry = store.get(clientIp);

    if (!currentEntry || currentEntry.expiresAt <= now) {
      store.set(clientIp, {
        count: 1,
        expiresAt: now + windowMs,
      });

      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", String(maxRequests - 1));
      return next();
    }

    if (currentEntry.count >= maxRequests) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((currentEntry.expiresAt - now) / 1000)
      );

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(maxRequests));
      res.setHeader("X-RateLimit-Remaining", "0");

      return next(new AppError(429, "Too many requests"));
    }

    currentEntry.count += 1;
    store.set(clientIp, currentEntry);

    res.setHeader("X-RateLimit-Limit", String(maxRequests));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(0, maxRequests - currentEntry.count))
    );

    return next();
  };
}

module.exports = {
  createRateLimitMiddleware,
};
