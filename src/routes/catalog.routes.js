const express = require("express");
const { createCatalogController } = require("../controllers/catalog.controller");
const { requireApiKey } = require("../middleware/auth.middleware");

function createCatalogRouter(dependencies) {
  const router = express.Router();
  const controller = createCatalogController(dependencies);

  router.use(requireApiKey);
  router.get("/search", controller.searchCatalog);
  router.get("/releases/:id", controller.getReleaseById);

  return router;
}

module.exports = {
  createCatalogRouter,
};
