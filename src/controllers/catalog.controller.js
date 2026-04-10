const { z } = require("zod");
const { BadRequestError } = require("../errors/app-error");

const releaseIdSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(/^\d+$/, "Release id must be a positive integer")
    .transform((value) => Number.parseInt(value, 10))
    .refine((value) => Number.isSafeInteger(value) && value > 0, "Release id must be a positive integer"),
});

const searchQuerySchema = z.object({
  q: z.string().trim().min(1, "Search query is required"),
});

function createCatalogController({
  catalogRepository,
  discogsService,
  transformService,
  ingestService,
  searchService,
}) {
  async function getReleaseById(req, res, next) {
    try {
      const parsedParams = releaseIdSchema.safeParse(req.params);

      if (!parsedParams.success) {
        throw new BadRequestError("Invalid release id");
      }

      const releaseId = parsedParams.data.id;
      let release = await catalogRepository.findReleaseBySourceId("discogs", String(releaseId));

      if (!release) {
        const discogsRelease = await discogsService.fetchRelease(releaseId);
        const mappedRelease = transformService.mapRelease(discogsRelease);
        release = await ingestService.saveRelease(mappedRelease);
      }

      res.status(200).json({ data: release });
    } catch (error) {
      next(error);
    }
  }

  async function searchCatalog(req, res, next) {
    try {
      const parsedQuery = searchQuerySchema.safeParse(req.query);

      if (!parsedQuery.success) {
        throw new BadRequestError("Invalid search query");
      }

      const results = await searchService.search(parsedQuery.data.q);

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

  return {
    getReleaseById,
    searchCatalog,
  };
}

module.exports = {
  createCatalogController,
};
