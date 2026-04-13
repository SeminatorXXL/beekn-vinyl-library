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
    return cleanText(duration);
  }

  function normalizeRole(role, fallbackRole) {
    return cleanText(role) || fallbackRole;
  }

  function extractArtistSourceId(artist) {
    if (artist && (Number.isInteger(artist.id) || /^\d+$/.test(String(artist.id || "")))) {
      return String(artist.id);
    }

    const resourceUrl = artist && artist.resource_url;
    if (typeof resourceUrl === "string") {
      const match = resourceUrl.match(/\/artists\/(\d+)(?:$|[/?#])/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  function mapArtist(artist, index, fallbackRole = "Primary") {
    const name = normalizeArtistName(artist && (artist.name || artist.anv));
    if (!name) {
      return null;
    }

    return {
      name,
      sortName: cleanText(artist.sort_name || artist.anv || name) || name,
      role: normalizeRole(artist && artist.role, fallbackRole),
      sortOrder: index + 1,
      sourceId: extractArtistSourceId(artist),
    };
  }

  function mapArtists(artists, fallbackArtists = [], fallbackRole = "Primary") {
    const sourceArtists = Array.isArray(artists) && artists.length > 0 ? artists : fallbackArtists;
    return sourceArtists
      .map((artist, index) => mapArtist(artist, index, fallbackRole))
      .filter(Boolean);
  }

  function mapSupportArtists(extraArtists, offset = 0) {
    return (Array.isArray(extraArtists) ? extraArtists : [])
      .map((artist, index) => mapArtist(artist, offset + index, "Support"))
      .filter(Boolean);
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
            extraartists:
              subTrack.extraartists && subTrack.extraartists.length > 0
                ? subTrack.extraartists
                : item.extraartists,
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

  function normalizeIdentityToken(value) {
    return String(cleanText(value) || "")
      .replace(/&/g, " and ")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function createSearchCandidateKey(candidate) {
    return [candidate.artistName || "", candidate.title || ""]
      .map((part) => normalizeIdentityToken(part))
      .join("|");
  }

  function extractCoverUrlFromImages(images, fallbackThumb) {
    if (Array.isArray(images) && images.length > 0) {
      const firstImage = images[0];
      return cleanText(firstImage.uri) || cleanText(firstImage.uri150) || null;
    }

    return cleanText(fallbackThumb);
  }

  function extractFormats(release) {
    return (Array.isArray(release && release.formats) ? release.formats : [])
      .map((format) => ({
        name: cleanText(format && format.name),
        qty: cleanText(format && format.qty),
        descriptions: Array.isArray(format && format.descriptions)
          ? format.descriptions.map((description) => cleanText(description)).filter(Boolean)
          : [],
      }))
      .filter((format) => format.name);
  }

  function isVinylRelease(release) {
    return extractFormats(release).some(
      (format) => String(format.name).toLowerCase() === "vinyl"
    );
  }

  function mapArtistProfile(artistProfile) {
    return {
      imageUrl:
        (Array.isArray(artistProfile && artistProfile.images) &&
          artistProfile.images[0] &&
          cleanText(artistProfile.images[0].uri)) ||
        null,
      realName: cleanText(artistProfile && artistProfile.realname),
      socials: Array.isArray(artistProfile && artistProfile.urls)
        ? artistProfile.urls.map((url) => cleanText(url)).filter(Boolean)
        : [],
      rawJson: artistProfile || null,
    };
  }

  function mapRelease(release) {
    const mainArtists = mapArtists(release.artists);
    const supportArtists = mapSupportArtists(release.extraartists, mainArtists.length);
    const coverUrl = extractCoverUrlFromImages(release.images, release.thumb);
    const formats = extractFormats(release);

    const tracks = flattenTracklist(release.tracklist)
      .map((track, index) => {
        const trackMainArtists = mapArtists(track.artists, release.artists);
        const trackSupportArtists = mapSupportArtists(
          track.extraartists,
          trackMainArtists.length
        );

        return {
          position: cleanText(track.position) || String(index + 1),
          trackNumber: extractTrackNumber(track.position, index),
          title: cleanText(track.title),
          duration: normalizeDuration(track.duration),
          artists: [...trackMainArtists, ...trackSupportArtists],
          mainArtists: trackMainArtists,
          supportArtists: trackSupportArtists,
        };
      })
      .filter((track) => track.title);

    const title = cleanText(release.title);

    if (!title) {
      throw new ExternalServiceError("Discogs release payload is missing a title");
    }

    return {
      album: {
        title,
        year: parseYear(release.year),
        coverUrl,
        isVinyl: isVinylRelease(release),
        formats,
      },
      source: {
        source: "discogs",
        sourceId: String(release.id),
        sourceUrl: cleanText(release.uri) || `https://www.discogs.com/release/${release.id}`,
        rawJson: release,
      },
      artists: [...mainArtists, ...supportArtists],
      mainArtists,
      supportArtists,
      genres: Array.from(
        new Set(
          [
            ...(Array.isArray(release.genres) ? release.genres : []),
            ...(Array.isArray(release.styles) ? release.styles : []),
          ]
            .map((genre) => cleanText(genre))
            .filter(Boolean)
        )
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
    isVinylRelease,
    mapArtistProfile,
  };
}

module.exports = {
  createTransformService,
};
