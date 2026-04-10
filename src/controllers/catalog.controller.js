const { z } = require("zod");
const { BadRequestError } = require("../errors/app-error");

const entityIdSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^\d+$/, "Id must be a positive integer")
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isSafeInteger(value) && value > 0, "Id must be a positive integer"),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required"),
});

function createCatalogController({ catalogService }) {
  async function getReleaseById(req, res, next) {
    try {
      const parsedParams = entityIdSchema.safeParse(req.params);

      if (!parsedParams.success) {
        throw new BadRequestError("Invalid release id");
      }

      const release = await catalogService.getAlbumDetailByReleaseId(parsedParams.data.id);
      res.status(200).json({ data: release });
    } catch (error) {
      next(error);
    }
  }

  async function searchAlbums(req, res, next) {
    try {
      const parsedQuery = searchQuerySchema.safeParse(req.query);

      if (!parsedQuery.success) {
        throw new BadRequestError("Invalid search query");
      }

      const results = await catalogService.searchAlbums(parsedQuery.data.q);
      res.status(200).json({
        data: {
          query: parsedQuery.data.q,
          count: results.length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async function searchTracks(req, res, next) {
    try {
      const parsedQuery = searchQuerySchema.safeParse(req.query);

      if (!parsedQuery.success) {
        throw new BadRequestError("Invalid search query");
      }

      const results = await catalogService.searchTracks(parsedQuery.data.q);
      res.status(200).json({
        data: {
          query: parsedQuery.data.q,
          count: results.length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async function getTrackById(req, res, next) {
    try {
      const parsedParams = entityIdSchema.safeParse(req.params);

      if (!parsedParams.success) {
        throw new BadRequestError("Invalid track id");
      }

      const track = await catalogService.getTrackDetail(parsedParams.data.id);
      res.status(200).json({ data: track });
    } catch (error) {
      next(error);
    }
  }

  async function searchArtists(req, res, next) {
    try {
      const parsedQuery = searchQuerySchema.safeParse(req.query);

      if (!parsedQuery.success) {
        throw new BadRequestError("Invalid search query");
      }

      const results = await catalogService.searchArtists(parsedQuery.data.q);
      res.status(200).json({
        data: {
          query: parsedQuery.data.q,
          count: results.length,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async function getArtistById(req, res, next) {
    try {
      const parsedParams = entityIdSchema.safeParse(req.params);

      if (!parsedParams.success) {
        throw new BadRequestError("Invalid artist id");
      }

      const artist = await catalogService.getArtistDetail(parsedParams.data.id);
      res.status(200).json({ data: artist });
    } catch (error) {
      next(error);
    }
  }

  return {
    getReleaseById,
    searchAlbums,
    searchTracks,
    getTrackById,
    searchArtists,
    getArtistById,
  };
}

module.exports = {
  createCatalogController,
};
