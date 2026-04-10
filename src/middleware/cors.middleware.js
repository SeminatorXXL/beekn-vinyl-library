const cors = require("cors");
const { AppError } = require("../errors/app-error");

function parseAllowedOrigins() {
  const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || "";

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createCorsMiddleware() {
  const allowedOrigins = parseAllowedOrigins();

  return cors({
    origin(origin, callback) {
      // Allow server-to-server and local tooling requests without an Origin header.
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new AppError(403, "Origin not allowed"));
    },
    methods: ["GET", "HEAD", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  });
}

module.exports = {
  createCorsMiddleware,
  parseAllowedOrigins,
};
