const express = require("express");
const { createCatalogController } = require("../controllers/catalog.controller");
const { requireApiKey } = require("../middleware/auth.middleware");

function createCatalogRouter(dependencies) {
  const router = express.Router();
  const controller = createCatalogController(dependencies);

  router.use(requireApiKey);

  router.get("/albums/search", controller.searchAlbums);
  router.get("/albums/:id", controller.getAlbumById);

  router.get("/tracks/search", controller.searchTracks);
  router.get("/tracks/:id", controller.getTrackById);

  router.get("/artists/search", controller.searchArtists);
  router.get("/artists/:id", controller.getArtistById);

  return router;
}

module.exports = {
  createCatalogRouter,
};
