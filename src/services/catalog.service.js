const { NotFoundError } = require("../errors/app-error");

function createCatalogService({
  catalogRepository,
  discogsService,
  transformService,
  ingestService,
  searchService,
}) {
  const artistProfileCache = new Map();
  const trackSearchLimit = 50;
  const artistSearchLimit = 10;

  function cleanText(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  function normalizeIdentityValue(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function toArtistSummary(artist) {
    return {
      id: artist.id,
      name: artist.name,
    };
  }

  function toArtistDetailSummary(artist) {
    return {
      id: artist.id,
      name: artist.name,
      sortName: artist.sortName,
      role: artist.role,
      sortOrder: artist.sortOrder,
    };
  }

  function toAlbumOverview(release) {
    return {
      id: release.id,
      title: release.title,
      coverUrl: release.coverUrl,
      mainArtists: release.mainArtists.map(toArtistSummary),
    };
  }

  function toAlbumDetail(release) {
    return {
      id: release.id,
      title: release.title,
      year: release.year,
      coverUrl: release.coverUrl,
      isVinyl: release.isVinyl !== false,
      formats: release.formats,
      createdAt: release.createdAt,
      source: release.source,
      mainArtists: release.mainArtists.map(toArtistDetailSummary),
      supportArtists: release.supportArtists.map(toArtistDetailSummary),
      genres: release.genres,
      tracks: release.tracks.map((track) => ({
        id: track.id,
        position: track.position,
        trackNumber: track.trackNumber,
        title: track.title,
        duration: track.duration,
        mainArtists: track.mainArtists.map(toArtistDetailSummary),
        supportArtists: track.supportArtists.map(toArtistDetailSummary),
      })),
    };
  }

  function createTrackIdentityKey(track) {
    const artistNames = track.artists.map((artist) => normalizeIdentityValue(artist.name)).join("|");
    return `${normalizeIdentityValue(track.title)}|${artistNames}`;
  }

  function sortTracksByEarliestAlbum(left, right) {
    const leftYear = Number.isInteger(left.album.year) ? left.album.year : Number.MAX_SAFE_INTEGER;
    const rightYear = Number.isInteger(right.album.year) ? right.album.year : Number.MAX_SAFE_INTEGER;

    if (leftYear !== rightYear) {
      return leftYear - rightYear;
    }

    if (left.album.id !== right.album.id) {
      return left.album.id - right.album.id;
    }

    return left.id - right.id;
  }

  function extractArtistSourceIdFromResourceUrl(resourceUrl) {
    if (typeof resourceUrl !== "string") {
      return null;
    }

    const match = resourceUrl.match(/\/artists\/(\d+)(?:$|[/?#])/);
    return match ? match[1] : null;
  }

  function findArtistSourceReference(artistName, payloads) {
    const normalizedArtistName = normalizeIdentityValue(artistName);

    function findCandidate(candidates) {
      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        const candidateName = normalizeIdentityValue(candidate && candidate.name);

        if (candidateName !== normalizedArtistName) {
          continue;
        }

        const sourceId =
          (candidate && candidate.id && String(candidate.id)) ||
          extractArtistSourceIdFromResourceUrl(candidate && candidate.resource_url);

        if (sourceId) {
          return sourceId;
        }
      }

      return null;
    }

    for (const payload of payloads) {
      const directArtists = findCandidate(payload && payload.artists);
      if (directArtists) {
        return directArtists;
      }

      const extraArtists = findCandidate(payload && payload.extraartists);
      if (extraArtists) {
        return extraArtists;
      }

      for (const track of Array.isArray(payload && payload.tracklist) ? payload.tracklist : []) {
        const trackArtists = findCandidate(track && track.artists);
        if (trackArtists) {
          return trackArtists;
        }

        const trackExtraArtists = findCandidate(track && track.extraartists);
        if (trackExtraArtists) {
          return trackExtraArtists;
        }
      }
    }

    return null;
  }

  function mapStoredArtistProfile(artist) {
    return {
      imageUrl: cleanText(artist && artist.imageUrl),
      realName: cleanText(artist && artist.realName),
      socials: Array.isArray(artist && artist.socials)
        ? artist.socials.map((url) => cleanText(url)).filter(Boolean)
        : [],
    };
  }

  function hasStoredArtistProfile(artist) {
    return Boolean(artist && artist.profileUpdatedAt);
  }

  async function getArtistProfile(artist) {
    if (artistProfileCache.has(artist.id) && hasStoredArtistProfile(artist)) {
      return artistProfileCache.get(artist.id);
    }

    if (hasStoredArtistProfile(artist)) {
      const storedProfile = mapStoredArtistProfile(artist);
      artistProfileCache.set(artist.id, storedProfile);
      return storedProfile;
    }

    let sourceId = artist.discogsSourceId;

    if (!sourceId) {
      const payloads = await catalogRepository.findArtistSourcePayloads(artist.id);
      sourceId = findArtistSourceReference(artist.name, payloads);

      if (sourceId) {
        const updatedArtist = await catalogRepository.updateArtistSourceId(artist.id, sourceId);
        if (updatedArtist) {
          artist.discogsSourceId = updatedArtist.discogsSourceId;
        }
      }
    }

    if (!sourceId) {
      const emptyProfile = {
        imageUrl: null,
        realName: null,
        socials: [],
      };
      artistProfileCache.set(artist.id, emptyProfile);
      return emptyProfile;
    }

    const fetchedProfile = transformService.mapArtistProfile(await discogsService.fetchArtist(sourceId));
    const storedArtist = await catalogRepository.saveArtistProfile(artist.id, fetchedProfile);
    const storedProfile = storedArtist ? mapStoredArtistProfile(storedArtist) : mapStoredArtistProfile(fetchedProfile);

    artistProfileCache.set(artist.id, storedProfile);
    return storedProfile;
  }

  async function getAlbumDetailById(albumId) {
    const album = await catalogRepository.getReleaseByAlbumId(albumId);

    if (!album || album.isVinyl === false) {
      throw new NotFoundError("Album not found");
    }

    return toAlbumDetail(album);
  }

  async function searchAlbums(query) {
    return searchService.search(query);
  }

  async function searchTracks(query) {
    const candidateTracks = await catalogRepository.searchTracksByQuery(query, trackSearchLimit);
    const groupedTracks = new Map();

    for (const track of candidateTracks) {
      const identityKey = createTrackIdentityKey(track);
      const current = groupedTracks.get(identityKey);

      if (!current || sortTracksByEarliestAlbum(track, current) < 0) {
        groupedTracks.set(identityKey, track);
      }
    }

    return Array.from(groupedTracks.values())
      .sort(sortTracksByEarliestAlbum)
      .slice(0, 10)
      .map((track) => ({
        id: track.id,
        title: track.title,
        coverUrl: track.album.coverUrl,
        artists: track.artists.map(toArtistSummary),
      }));
  }

  async function getTrackDetail(trackId) {
    const baseTrack = await catalogRepository.getTrackById(trackId);

    if (!baseTrack) {
      throw new NotFoundError("Track not found");
    }

    const matchingTracks = await catalogRepository.findTracksByNormalizedTitle(baseTrack.title, 100);
    const identityKey = createTrackIdentityKey(baseTrack);
    const appearances = matchingTracks
      .filter((track) => createTrackIdentityKey(track) === identityKey)
      .sort(sortTracksByEarliestAlbum);

    const earliestAppearance = appearances[0] || baseTrack;

    return {
      id: baseTrack.id,
      title: baseTrack.title,
      coverUrl: earliestAppearance.album.coverUrl,
      artists: baseTrack.artists.map(toArtistSummary),
      appearances: appearances.map((track) => ({
        trackId: track.id,
        albumId: track.album.id,
        albumTitle: track.album.title,
        albumYear: track.album.year,
        albumCoverUrl: track.album.coverUrl,
        albumMainArtists: track.album.mainArtists.map(toArtistSummary),
        position: track.position,
        trackNumber: track.trackNumber,
      })),
    };
  }

  async function searchArtists(query) {
    const artists = await catalogRepository.searchArtistsByQuery(query, artistSearchLimit);
    const results = [];

    for (const artist of artists) {
      const profile = await getArtistProfile(artist);
      results.push({
        id: artist.id,
        name: artist.name,
        imageUrl: profile.imageUrl,
      });
    }

    return results;
  }

  async function getArtistDetail(artistId) {
    const artist = await catalogRepository.getArtistById(artistId);

    if (!artist) {
      throw new NotFoundError("Artist not found");
    }

    const [profile, genres, mainAlbums, featuredAlbums] = await Promise.all([
      getArtistProfile(artist),
      catalogRepository.getGenresByArtistId(artistId),
      catalogRepository.getAlbumsByArtistRole(artistId, "main"),
      catalogRepository.getAlbumsByArtistRole(artistId, "featured"),
    ]);

    const mainAlbumIds = new Set(mainAlbums.map((album) => album.id));

    return {
      id: artist.id,
      name: artist.name,
      imageUrl: profile.imageUrl,
      realName: profile.realName,
      genres,
      socials: profile.socials,
      mainAlbums: mainAlbums.filter((album) => album.isVinyl !== false).map(toAlbumOverview),
      featuredAlbums: featuredAlbums
        .filter((album) => album.isVinyl !== false && !mainAlbumIds.has(album.id))
        .map(toAlbumOverview),
    };
  }

  return {
    getAlbumDetailById,
    searchAlbums,
    searchTracks,
    getTrackDetail,
    searchArtists,
    getArtistDetail,
  };
}

module.exports = {
  createCatalogService,
};
