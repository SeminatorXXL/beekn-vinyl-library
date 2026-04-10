function createSearchService({
  catalogRepository,
  discogsService,
  transformService,
  ingestService,
}) {
  const targetResultCount = 5;
  const discogsSearchPageSize = 10;

  function toSearchResult(release) {
    return {
      id: release.id,
      title: release.title,
      year: release.year,
      coverUrl: release.coverUrl,
      source: release.source,
      artists: release.artists.map((artist) => ({
        id: artist.id,
        name: artist.name,
        role: artist.role,
      })),
      genres: release.genres.map((genre) => ({
        id: genre.id,
        name: genre.name,
      })),
      trackCount: Array.isArray(release.tracks) ? release.tracks.length : 0,
    };
  }

  function mergeUniqueResults(releases) {
    const byAlbumId = new Map();

    for (const release of releases) {
      if (!release) {
        continue;
      }

      byAlbumId.set(release.id, release);
    }

    return Array.from(byAlbumId.values());
  }

  async function search(query) {
    const localResults = await catalogRepository.searchLocalReleases(query, targetResultCount);

    if (localResults.length >= targetResultCount) {
      return localResults.map(toSearchResult);
    }

    const discogsSearch = await discogsService.searchReleases(query, {
      perPage: discogsSearchPageSize,
    });
    const externalCandidates = transformService.mapSearchResults(discogsSearch.results);
    const combinedReleases = [...localResults];

    for (const candidate of externalCandidates) {
      if (mergeUniqueResults(combinedReleases).length >= targetResultCount) {
        break;
      }

      const existingRelease = await catalogRepository.findReleaseBySourceId(
        candidate.source,
        candidate.sourceId
      );

      if (existingRelease) {
        combinedReleases.push(existingRelease);
        continue;
      }

      const discogsRelease = await discogsService.fetchRelease(candidate.sourceId);
      const mappedRelease = transformService.mapRelease(discogsRelease);
      const storedRelease = await ingestService.saveRelease(mappedRelease);
      combinedReleases.push(storedRelease);
    }

    return mergeUniqueResults(combinedReleases)
      .slice(0, targetResultCount)
      .map(toSearchResult);
  }

  return {
    search,
  };
}

module.exports = {
  createSearchService,
};
