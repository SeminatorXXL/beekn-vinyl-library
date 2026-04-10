const { AppError, UnauthorizedError } = require("../errors/app-error");

function requireApiKey(req, res, next) {
  const configuredKey = process.env.INTERNAL_API_KEY;

  if (!configuredKey) {
    return next(new AppError(500, "Internal server error", { expose: false }));
  }

  const authorization = req.get("authorization");
  if (authorization !== `Bearer ${configuredKey}`) {
    return next(new UnauthorizedError());
  }

  return next();
}

module.exports = {
  requireApiKey,
};
