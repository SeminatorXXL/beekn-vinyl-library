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

  function normalizeIdentityToken(value) {
    return String(value || "")
      .trim()
      .replace(/&/g, " and ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function createAlbumIdentityKey(release) {
    const artistNames = (Array.isArray(release && release.mainArtists) ? release.mainArtists : [])
      .map((artist) => normalizeIdentityToken(artist && artist.name))
      .filter(Boolean)
      .sort()
      .join("|");

    return `${normalizeIdentityToken(release && release.title)}|${artistNames}`;
  }

  function mergeUniqueResults(releases) {
    const byAlbumIdentity = new Map();

    for (const release of releases) {
      if (!release || release.isVinyl === false) {
        continue;
      }

      const identityKey = createAlbumIdentityKey(release);
      if (!identityKey) {
        continue;
      }

      if (!byAlbumIdentity.has(identityKey)) {
        byAlbumIdentity.set(identityKey, release);
      }
    }

    return Array.from(byAlbumIdentity.values());
  }

  async function search(query) {
    const localResults = mergeUniqueResults(
      (await catalogRepository.searchLocalReleases(query, targetResultCount * 3)).filter(
        (release) => release.isVinyl !== false
      )
    );

    if (localResults.length >= targetResultCount) {
      return localResults.slice(0, targetResultCount).map(toAlbumOverview);
    }

    const discogsSearch = await discogsService.searchReleases(query, {
      perPage: discogsSearchPageSize,
      reason: "album search fallback",
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

      const discogsRelease = await discogsService.fetchRelease(candidate.sourceId, {
        title: candidate.title,
        artistName: candidate.artistName,
        reason: "album search candidate fetch",
      });
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
