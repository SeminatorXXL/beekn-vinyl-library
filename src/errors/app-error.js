class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = options.code;
    this.expose = options.expose ?? statusCode < 500;
  }
}

class BadRequestError extends AppError {
  constructor(message = "Bad request") {
    super(400, message);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message);
  }
}

class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, message);
  }
}

class ExternalServiceError extends AppError {
  constructor(message = "Upstream service error") {
    super(502, message);
  }
}

module.exports = {
  AppError,
  BadRequestError,
  UnauthorizedError,
  NotFoundError,
  ExternalServiceError,
};
