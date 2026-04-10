const { ExternalServiceError } = require("../errors/app-error");

function createTransformService() {
  function cleanText(value) {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  function normalizeArtistName(name) {
    const cleaned = cleanText(name);
    return cleaned ? cleaned.replace(/\s+\(\d+\)$/, "") : null;
  }

  function parseYear(value) {
    if (!value) {
      return null;
    }

    const year = Number.parseInt(String(value), 10);
    return Number.isInteger(year) ? year : null;
  }

  function extractTrackNumber(position, index) {
    const match = String(position || "").match(/(\d+)(?!.*\d)/);
    if (match) {
      return Number.parseInt(match[1], 10);
    }

    return index + 1;
  }

  function normalizeDuration(duration) {
    const cleaned = cleanText(duration);
    return cleaned || null;
  }

  function mapArtist(artist, index) {
    const name = normalizeArtistName(artist && (artist.name || artist.anv));
    if (!name) {
      return null;
    }

    return {
      name,
      sortName: cleanText(artist.sort_name || artist.anv || name) || name,
      role: cleanText(artist.role) || "Primary",
      sortOrder: index + 1,
    };
  }

  function mapArtists(artists, fallbackArtists = []) {
    const sourceArtists = Array.isArray(artists) && artists.length > 0 ? artists : fallbackArtists;
    return sourceArtists.map(mapArtist).filter(Boolean);
  }

  function flattenTracklist(tracklist) {
    const flattened = [];

    for (const item of Array.isArray(tracklist) ? tracklist : []) {
      if (!item) {
        continue;
      }

      if (Array.isArray(item.sub_tracks) && item.sub_tracks.length > 0) {
        for (const subTrack of item.sub_tracks) {
          flattened.push({
            ...subTrack,
            position: subTrack.position || item.position,
            artists: subTrack.artists && subTrack.artists.length > 0 ? subTrack.artists : item.artists,
          });
        }
        continue;
      }

      flattened.push(item);
    }

    return flattened.filter((track) => track.type_ === "track" || (!track.type_ && track.title));
  }

  function extractReleaseIdFromUrl(resourceUrl) {
    if (typeof resourceUrl !== "string") {
      return null;
    }

    const match = resourceUrl.match(/\/releases\/(\d+)(?:$|[/?#])/);
    return match ? match[1] : null;
  }

  function parseSearchResultTitle(value) {
    const cleaned = cleanText(value);
    if (!cleaned) {
      return {
        artistName: null,
        releaseTitle: null,
      };
    }

    const separatorIndex = cleaned.indexOf(" - ");
    if (separatorIndex === -1) {
      return {
        artistName: null,
        releaseTitle: cleaned,
      };
    }

    return {
      artistName: cleanText(cleaned.slice(0, separatorIndex)),
      releaseTitle: cleanText(cleaned.slice(separatorIndex + 3)),
    };
  }

  function createSearchCandidateKey(candidate) {
    return [candidate.artistName || "", candidate.title || "", candidate.year || ""]
      .map((part) => String(part).trim().toLowerCase())
      .join("|");
  }

  function mapRelease(release) {
    const releaseArtists = mapArtists(release.artists);
    const coverUrl =
      release.images && release.images.length > 0
        ? release.images.find((image) => image.type === "primary")?.uri150 ||
          release.images[0].uri150 ||
          release.images[0].uri ||
          null
        : release.thumb || null;

    const tracks = flattenTracklist(release.tracklist).map((track, index) => ({
      position: cleanText(track.position) || String(index + 1),
      trackNumber: extractTrackNumber(track.position, index),
      title: cleanText(track.title),
      duration: normalizeDuration(track.duration),
      artists: mapArtists(track.artists, release.artists),
    })).filter((track) => track.title);

    const title = cleanText(release.title);

    if (!title) {
      throw new ExternalServiceError("Discogs release payload is missing a title");
    }

    return {
      album: {
        title,
        year: parseYear(release.year),
        coverUrl,
      },
      source: {
        source: "discogs",
        sourceId: String(release.id),
        sourceUrl: cleanText(release.uri) || `https://www.discogs.com/release/${release.id}`,
        rawJson: release,
      },
      artists: releaseArtists,
      genres: Array.from(
        new Set([...(Array.isArray(release.genres) ? release.genres : []), ...(Array.isArray(release.styles) ? release.styles : [])].map((genre) => cleanText(genre)).filter(Boolean))
      ),
      tracks,
    };
  }

  function mapSearchResult(result) {
    const directId =
      Number.isSafeInteger(result && result.id) || (typeof result?.id === "string" && /^\d+$/.test(result.id))
        ? String(result.id)
        : null;
    const sourceId = directId || extractReleaseIdFromUrl(result && result.resource_url);

    if (!sourceId) {
      return null;
    }

    const parsedTitle = parseSearchResultTitle(result.title);

    return {
      source: "discogs",
      sourceId,
      artistName: parsedTitle.artistName,
      title: parsedTitle.releaseTitle,
      year: parseYear(result.year),
      coverUrl: cleanText(result.thumb),
      sourceUrl: cleanText(result.uri) || `https://www.discogs.com/release/${sourceId}`,
    };
  }

  function mapSearchResults(results) {
    const mappedResults = (Array.isArray(results) ? results : []).map(mapSearchResult).filter(Boolean);
    const uniqueCandidates = new Map();

    for (const candidate of mappedResults) {
      const candidateKey = createSearchCandidateKey(candidate);
      if (!uniqueCandidates.has(candidateKey)) {
        uniqueCandidates.set(candidateKey, candidate);
      }
    }

    return Array.from(uniqueCandidates.values());
  }

  return {
    mapRelease,
    mapSearchResults,
  };
}

module.exports = {
  createTransformService,
};
