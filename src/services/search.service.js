function createSearchService({
  catalogRepository,
  discogsService,
  transformService,
  ingestService,
}) {
  const targetResultCount = 5;
  const discogsSearchPageSize = 10;

  function toAlbumOverview(release) {
    return {
      id: release.id,
      title: release.title,
      coverUrl: release.coverUrl,
      mainArtists: release.mainArtists.map((artist) => ({
        id: artist.id,
        name: artist.name,
      })),
    };
  }

  function mergeUniqueResults(releases) {
    const byAlbumId = new Map();

    for (const release of releases) {
      if (!release || release.isVinyl === false) {
        continue;
      }

      byAlbumId.set(release.id, release);
    }

    return Array.from(byAlbumId.values());
  }

  async function search(query) {
    const localResults = (await catalogRepository.searchLocalReleases(query, targetResultCount)).filter(
      (release) => release.isVinyl !== false
    );

    if (localResults.length >= targetResultCount) {
      return localResults.map(toAlbumOverview);
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
        if (existingRelease.isVinyl !== false) {
          combinedReleases.push(existingRelease);
        }
        continue;
      }

      const discogsRelease = await discogsService.fetchRelease(candidate.sourceId);
      const mappedRelease = transformService.mapRelease(discogsRelease);

      if (!mappedRelease.album.isVinyl) {
        continue;
      }

      const storedRelease = await ingestService.saveRelease(mappedRelease);
      combinedReleases.push(storedRelease);
    }

    return mergeUniqueResults(combinedReleases)
      .slice(0, targetResultCount)
      .map(toAlbumOverview);
  }

  return {
    search,
  };
}

module.exports = {
  createSearchService,
};
