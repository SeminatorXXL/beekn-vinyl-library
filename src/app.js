const express = require("express");
const helmet = require("helmet");
const db = require("./db");
const { createCatalogRepository } = require("./repositories/catalog.repository");
const { createDiscogsService } = require("./services/discogs.service");
const { createTransformService } = require("./services/transform.service");
const { createIngestService } = require("./services/ingest.service");
const { createSearchService } = require("./services/search.service");
const { createCatalogService } = require("./services/catalog.service");
const { createCatalogRouter } = require("./routes/catalog.routes");
const { createCorsMiddleware } = require("./middleware/cors.middleware");
const { createRateLimitMiddleware } = require("./middleware/rate-limit.middleware");
const { errorHandler, notFoundHandler } = require("./middleware/error.middleware");

function createApp() {
  const app = express();
  app.set("trust proxy", process.env.TRUST_PROXY === "true");

  const catalogRepository = createCatalogRepository(db);
  const discogsService = createDiscogsService();
  const transformService = createTransformService();
  const ingestService = createIngestService({
    db,
    catalogRepository,
  });
  const searchService = createSearchService({
    catalogRepository,
    discogsService,
    transformService,
    ingestService,
  });
  const catalogService = createCatalogService({
    catalogRepository,
    discogsService,
    transformService,
    ingestService,
    searchService,
  });

  app.use(createCorsMiddleware());
  app.use(helmet());
  app.use(createRateLimitMiddleware());
  app.use(express.json());

  app.use(
    "/catalog",
    createCatalogRouter({
      catalogService,
    })
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
};
