function createCatalogRepository(db) {
  function getExecutor(client) {
    return client || db;
  }

  function escapeLikePattern(value) {
    return value.replace(/[\\%_]/g, "\\$&");
  }

  function normalizeIdentityValue(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function parseJsonValue(value, fallbackValue) {
    if (value == null) {
      return fallbackValue;
    }

    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch (error) {
        return fallbackValue;
      }
    }

    return value;
  }

  function parseRawJson(rawJson) {
    if (!rawJson) {
      return null;
    }

    if (typeof rawJson === "string") {
      try {
        return JSON.parse(rawJson);
      } catch (error) {
        return null;
      }
    }

    return rawJson;
  }

  function extractFormats(rawJson) {
    const parsed = parseRawJson(rawJson);
    const formats = Array.isArray(parsed && parsed.formats) ? parsed.formats : [];

    return formats
      .map((format) => ({
        name: format && format.name ? String(format.name).trim() : null,
        qty: format && format.qty ? String(format.qty).trim() : null,
        descriptions: Array.isArray(format && format.descriptions)
          ? format.descriptions.map((description) => String(description).trim()).filter(Boolean)
          : [],
      }))
      .filter((format) => format.name);
  }

  function extractIsVinyl(rawJson) {
    return extractFormats(rawJson).some(
      (format) => normalizeIdentityValue(format.name) === "vinyl"
    );
  }

  function mapArtistRecord(row) {
    const socials = parseJsonValue(row.socials, []);

    return {
      id: row.id,
      name: row.name,
      sortName: row.sort_name,
      discogsSourceId: row.discogs_source_id || null,
      imageUrl: row.image_url || null,
      realName: row.real_name || null,
      socials: Array.isArray(socials) ? socials.filter(Boolean) : [],
      profileUpdatedAt: row.profile_updated_at || null,
    };
  }

  function isPrimaryRole(role) {
    const normalizedRole = normalizeIdentityValue(role);
    return !normalizedRole || normalizedRole === "primary";
  }

  function mapContributorRow(row) {
    return {
      id: row.id,
      name: row.name,
      sortName: row.sort_name,
      role: row.role || "Primary",
      sortOrder: row.sort_order,
    };
  }

  function splitContributors(rows) {
    const all = [];
    const main = [];
    const support = [];

    for (const row of rows) {
      const contributor = mapContributorRow(row);
      all.push(contributor);

      if (isPrimaryRole(contributor.role)) {
        main.push(contributor);
      } else {
        support.push(contributor);
      }
    }

    return {
      all,
      main,
      support,
    };
  }

  async function findReleaseBySourceId(source, sourceId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          a.id,
          a.title,
          a.year,
          a.cover_url,
          a.created_at,
          s.source,
          s.source_id,
          s.source_url,
          s.raw_json
        FROM album_sources s
        INNER JOIN albums a ON a.id = s.album_id
        WHERE s.source = $1 AND s.source_id = $2
        LIMIT 1
      `,
      [source, sourceId]
    );

    const baseAlbum = result.rows[0];
    if (!baseAlbum) {
      return null;
    }

    return hydrateRelease(baseAlbum, client);
  }

  async function getReleaseByAlbumId(albumId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          a.id,
          a.title,
          a.year,
          a.cover_url,
          a.created_at,
          s.source,
          s.source_id,
          s.source_url,
          s.raw_json
        FROM albums a
        LEFT JOIN album_sources s
          ON s.album_id = a.id
         AND s.source = $2
        WHERE a.id = $1
        ORDER BY s.id ASC NULLS LAST
        LIMIT 1
      `,
      [albumId, "discogs"]
    );

    const baseAlbum = result.rows[0];
    if (!baseAlbum) {
      return null;
    }

    return hydrateRelease(baseAlbum, client);
  }

  async function hydrateRelease(baseAlbum, client) {
    const executor = getExecutor(client);

    const albumArtistsResult = await executor.query(
      `
        SELECT
          ar.id,
          ar.name,
          ar.sort_name,
          aa.role,
          aa.sort_order
        FROM album_artists aa
        INNER JOIN artists ar ON ar.id = aa.artist_id
        WHERE aa.album_id = $1
        ORDER BY aa.sort_order ASC, aa.id ASC
      `,
      [baseAlbum.id]
    );
    const genresResult = await executor.query(
      `
        SELECT
          g.id,
          g.name
        FROM album_genres ag
        INNER JOIN genres g ON g.id = ag.genre_id
        WHERE ag.album_id = $1
        ORDER BY g.name ASC
      `,
      [baseAlbum.id]
    );
    const tracksResult = await executor.query(
      `
        SELECT
          id,
          album_id,
          position,
          track_number,
          title,
          duration
        FROM tracks
        WHERE album_id = $1
        ORDER BY id ASC
      `,
      [baseAlbum.id]
    );

    const albumArtistGroups = splitContributors(albumArtistsResult.rows);
    const tracks = tracksResult.rows;
    const trackIds = tracks.map((track) => track.id);
    let trackArtistsByTrackId = new Map();

    if (trackIds.length > 0) {
      const trackArtistsResult = await executor.query(
        `
          SELECT
            ta.track_id,
            ar.id,
            ar.name,
            ar.sort_name,
            ta.role,
            ta.sort_order
          FROM track_artists ta
          INNER JOIN artists ar ON ar.id = ta.artist_id
          WHERE ta.track_id = ANY($1::int[])
          ORDER BY ta.track_id ASC, ta.sort_order ASC, ta.id ASC
        `,
        [trackIds]
      );

      trackArtistsByTrackId = trackArtistsResult.rows.reduce((groups, row) => {
        const current = groups.get(row.track_id) || [];
        current.push(row);
        groups.set(row.track_id, current);
        return groups;
      }, new Map());
    }

    return {
      id: baseAlbum.id,
      title: baseAlbum.title,
      year: baseAlbum.year,
      coverUrl: baseAlbum.cover_url,
      createdAt: baseAlbum.created_at,
      isVinyl: extractIsVinyl(baseAlbum.raw_json),
      formats: extractFormats(baseAlbum.raw_json),
      source: {
        provider: baseAlbum.source,
        sourceId: baseAlbum.source_id,
        sourceUrl: baseAlbum.source_url,
      },
      artists: albumArtistGroups.all,
      mainArtists: albumArtistGroups.main,
      supportArtists: albumArtistGroups.support,
      genres: genresResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      tracks: tracks.map((track) => {
        const trackArtistGroups = splitContributors(trackArtistsByTrackId.get(track.id) || []);

        return {
          id: track.id,
          position: track.position,
          trackNumber: track.track_number,
          title: track.title,
          duration: track.duration,
          artists: trackArtistGroups.all,
          mainArtists: trackArtistGroups.main,
          supportArtists: trackArtistGroups.support,
        };
      }),
    };
  }

  async function insertAlbum(album, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        INSERT INTO albums (title, year, cover_url)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [album.title, album.year, album.coverUrl]
    );

    return result.rows[0].id;
  }

  async function insertAlbumSource(albumId, source, client) {
    const executor = getExecutor(client);
    await executor.query(
      `
        INSERT INTO album_sources (album_id, source, source_id, source_url, raw_json)
        VALUES ($1, $2, $3, $4, $5::jsonb)
      `,
      [albumId, source.source, source.sourceId, source.sourceUrl, JSON.stringify(source.rawJson)]
    );
  }

  async function findArtistByName(name, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
        FROM artists
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [name]
    );

    return result.rows[0] ? mapArtistRecord(result.rows[0]) : null;
  }

  async function findArtistByDiscogsSourceId(sourceId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
        FROM artists
        WHERE discogs_source_id = $1
        LIMIT 1
      `,
      [sourceId]
    );

    return result.rows[0] ? mapArtistRecord(result.rows[0]) : null;
  }

  async function insertArtist(artist, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        INSERT INTO artists (name, sort_name, discogs_source_id)
        VALUES ($1, $2, $3)
        RETURNING
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
      `,
      [artist.name, artist.sortName, artist.sourceId || null]
    );

    return mapArtistRecord(result.rows[0]);
  }

  async function updateArtistSourceId(artistId, sourceId, client) {
    if (!sourceId) {
      return null;
    }

    const executor = getExecutor(client);
    const result = await executor.query(
      `
        UPDATE artists
        SET discogs_source_id = COALESCE(discogs_source_id, $2)
        WHERE id = $1
        RETURNING
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
      `,
      [artistId, sourceId]
    );

    return result.rows[0] ? mapArtistRecord(result.rows[0]) : null;
  }

  async function saveArtistProfile(artistId, profile, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        UPDATE artists
        SET image_url = $2,
            real_name = $3,
            socials = $4::jsonb,
            profile_raw_json = $5::jsonb,
            profile_updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
      `,
      [
        artistId,
        profile.imageUrl || null,
        profile.realName || null,
        JSON.stringify(Array.isArray(profile.socials) ? profile.socials : []),
        JSON.stringify(profile.rawJson || null),
      ]
    );

    return result.rows[0] ? mapArtistRecord(result.rows[0]) : null;
  }

  async function linkAlbumArtist(albumId, artistId, role, sortOrder, client) {
    const executor = getExecutor(client);
    await executor.query(
      `
        INSERT INTO album_artists (album_id, artist_id, role, sort_order)
        VALUES ($1, $2, $3, $4)
      `,
      [albumId, artistId, role, sortOrder]
    );
  }

  async function insertTrack(albumId, track, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        INSERT INTO tracks (album_id, position, track_number, title, duration)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [albumId, track.position, track.trackNumber, track.title, track.duration]
    );

    return result.rows[0].id;
  }

  async function linkTrackArtist(trackId, artistId, role, sortOrder, client) {
    const executor = getExecutor(client);
    await executor.query(
      `
        INSERT INTO track_artists (track_id, artist_id, role, sort_order)
        VALUES ($1, $2, $3, $4)
      `,
      [trackId, artistId, role, sortOrder]
    );
  }

  async function findGenreByName(name, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT id, name
        FROM genres
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [name]
    );

    return result.rows[0] || null;
  }

  async function insertGenre(name, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        INSERT INTO genres (name)
        VALUES ($1)
        RETURNING id, name
      `,
      [name]
    );

    return result.rows[0];
  }

  async function linkAlbumGenre(albumId, genreId, client) {
    const executor = getExecutor(client);
    await executor.query(
      `
        INSERT INTO album_genres (album_id, genre_id)
        VALUES ($1, $2)
      `,
      [albumId, genreId]
    );
  }

  async function searchLocalReleases(searchQuery, limit, client) {
    const executor = getExecutor(client);
    const likeQuery = `%${escapeLikePattern(searchQuery)}%`;
    const result = await executor.query(
      `
        WITH matched_albums AS (
          SELECT a.id AS album_id, 1 AS match_rank
          FROM albums a
          WHERE a.title ILIKE $1 ESCAPE '\\'

          UNION ALL

          SELECT aa.album_id, 2 AS match_rank
          FROM album_artists aa
          INNER JOIN artists ar ON ar.id = aa.artist_id
          WHERE ar.name ILIKE $1 ESCAPE '\\'

          UNION ALL

          SELECT t.album_id, 3 AS match_rank
          FROM tracks t
          WHERE t.title ILIKE $1 ESCAPE '\\'
        )
        SELECT album_id
        FROM matched_albums
        GROUP BY album_id
        ORDER BY MIN(match_rank) ASC, MIN(album_id) ASC
        LIMIT $2
      `,
      [likeQuery, limit]
    );

    const releases = [];

    for (const row of result.rows) {
      const release = await getReleaseByAlbumId(row.album_id, client);
      if (release) {
        releases.push(release);
      }
    }

    return releases;
  }

  async function findReleaseByAlbumIdentity(title, artists, year, client) {
    const executor = getExecutor(client);
    const normalizedTitle = normalizeIdentityValue(title);
    const normalizedArtistNames = (Array.isArray(artists) ? artists : [])
      .map((artist) => normalizeIdentityValue(artist.name))
      .filter(Boolean);

    if (!normalizedTitle || normalizedArtistNames.length === 0) {
      return null;
    }

    const result = await executor.query(
      `
        SELECT DISTINCT a.id
        FROM albums a
        INNER JOIN album_artists aa ON aa.album_id = a.id
        INNER JOIN artists ar ON ar.id = aa.artist_id
        WHERE LOWER(TRIM(a.title)) = $1
          AND ($2::int IS NULL OR a.year = $2 OR a.year IS NULL)
        ORDER BY a.id ASC
      `,
      [normalizedTitle, year || null]
    );

    for (const row of result.rows) {
      const release = await getReleaseByAlbumId(row.id, client);
      if (!release) {
        continue;
      }

      const releaseArtistNames = release.mainArtists
        .map((artist) => normalizeIdentityValue(artist.name))
        .filter(Boolean);

      if (
        releaseArtistNames.length === normalizedArtistNames.length &&
        releaseArtistNames.every((artistName, index) => artistName === normalizedArtistNames[index])
      ) {
        return release;
      }
    }

    return null;
  }

  async function getTrackById(trackId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          t.id,
          t.album_id,
          t.position,
          t.track_number,
          t.title,
          t.duration,
          a.title AS album_title,
          a.year AS album_year,
          a.cover_url AS album_cover_url
        FROM tracks t
        INNER JOIN albums a ON a.id = t.album_id
        WHERE t.id = $1
        LIMIT 1
      `,
      [trackId]
    );

    const baseTrack = result.rows[0];
    if (!baseTrack) {
      return null;
    }

    return hydrateTrack(baseTrack, client);
  }

  async function hydrateTrack(baseTrack, client) {
    const executor = getExecutor(client);
    const trackArtistsResult = await executor.query(
      `
        SELECT
          ar.id,
          ar.name,
          ar.sort_name,
          ta.role,
          ta.sort_order
        FROM track_artists ta
        INNER JOIN artists ar ON ar.id = ta.artist_id
        WHERE ta.track_id = $1
        ORDER BY ta.sort_order ASC, ta.id ASC
      `,
      [baseTrack.id]
    );
    const albumArtistsResult = await executor.query(
      `
        SELECT
          ar.id,
          ar.name,
          ar.sort_name,
          aa.role,
          aa.sort_order
        FROM album_artists aa
        INNER JOIN artists ar ON ar.id = aa.artist_id
        WHERE aa.album_id = $1
        ORDER BY aa.sort_order ASC, aa.id ASC
      `,
      [baseTrack.album_id]
    );

    const trackArtistGroups = splitContributors(trackArtistsResult.rows);
    const albumArtistGroups = splitContributors(albumArtistsResult.rows);

    return {
      id: baseTrack.id,
      title: baseTrack.title,
      position: baseTrack.position,
      trackNumber: baseTrack.track_number,
      duration: baseTrack.duration,
      artists: trackArtistGroups.all,
      mainArtists: trackArtistGroups.main,
      supportArtists: trackArtistGroups.support,
      album: {
        id: baseTrack.album_id,
        title: baseTrack.album_title,
        year: baseTrack.album_year,
        coverUrl: baseTrack.album_cover_url,
        mainArtists: albumArtistGroups.main,
      },
    };
  }

  async function searchTracksByQuery(searchQuery, limit, client) {
    const executor = getExecutor(client);
    const likeQuery = `%${escapeLikePattern(searchQuery)}%`;
    const result = await executor.query(
      `
        WITH matched_tracks AS (
          SELECT t.id AS track_id, 1 AS match_rank
          FROM tracks t
          WHERE t.title ILIKE $1 ESCAPE '\\'

          UNION ALL

          SELECT ta.track_id, 2 AS match_rank
          FROM track_artists ta
          INNER JOIN artists ar ON ar.id = ta.artist_id
          WHERE ar.name ILIKE $1 ESCAPE '\\'
        )
        SELECT track_id
        FROM matched_tracks
        GROUP BY track_id
        ORDER BY MIN(match_rank) ASC, MIN(track_id) ASC
        LIMIT $2
      `,
      [likeQuery, limit]
    );

    const tracks = [];

    for (const row of result.rows) {
      const track = await getTrackById(row.track_id, client);
      if (track) {
        tracks.push(track);
      }
    }

    return tracks;
  }

  async function findTracksByNormalizedTitle(title, limit = 100, client) {
    const executor = getExecutor(client);
    const normalizedTitle = normalizeIdentityValue(title);
    const result = await executor.query(
      `
        SELECT
          t.id,
          t.album_id,
          t.position,
          t.track_number,
          t.title,
          t.duration,
          a.title AS album_title,
          a.year AS album_year,
          a.cover_url AS album_cover_url
        FROM tracks t
        INNER JOIN albums a ON a.id = t.album_id
        WHERE LOWER(TRIM(t.title)) = $1
        ORDER BY a.year ASC NULLS LAST, t.album_id ASC, t.id ASC
        LIMIT $2
      `,
      [normalizedTitle, limit]
    );

    const tracks = [];

    for (const row of result.rows) {
      const track = await hydrateTrack(row, client);
      if (track) {
        tracks.push(track);
      }
    }

    return tracks;
  }

  async function searchArtistsByQuery(searchQuery, limit, client) {
    const executor = getExecutor(client);
    const likeQuery = `%${escapeLikePattern(searchQuery)}%`;
    const result = await executor.query(
      `
        SELECT
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
        FROM artists
        WHERE name ILIKE $1 ESCAPE '\\'
        ORDER BY name ASC, id ASC
        LIMIT $2
      `,
      [likeQuery, limit]
    );

    return result.rows.map(mapArtistRecord);
  }

  async function getArtistById(artistId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT
          id,
          name,
          sort_name,
          discogs_source_id,
          image_url,
          real_name,
          socials,
          profile_updated_at
        FROM artists
        WHERE id = $1
        LIMIT 1
      `,
      [artistId]
    );

    const artist = result.rows[0];
    if (!artist) {
      return null;
    }

    return mapArtistRecord(artist);
  }

  async function getGenresByArtistId(artistId, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT DISTINCT g.id, g.name
        FROM album_artists aa
        INNER JOIN album_genres ag ON ag.album_id = aa.album_id
        INNER JOIN genres g ON g.id = ag.genre_id
        WHERE aa.artist_id = $1
        ORDER BY g.name ASC
      `,
      [artistId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
    }));
  }

  async function getAlbumsByArtistRole(artistId, roleMode, client) {
    const executor = getExecutor(client);
    const condition =
      roleMode === "featured"
        ? "COALESCE(NULLIF(LOWER(BTRIM(aa.role)), ''), 'primary') <> 'primary'"
        : "COALESCE(NULLIF(LOWER(BTRIM(aa.role)), ''), 'primary') = 'primary'";

    const result = await executor.query(
      `
        SELECT DISTINCT aa.album_id
        FROM album_artists aa
        WHERE aa.artist_id = $1
          AND ${condition}
        ORDER BY aa.album_id ASC
      `,
      [artistId]
    );

    const releases = [];

    for (const row of result.rows) {
      const release = await getReleaseByAlbumId(row.album_id, client);
      if (release) {
        releases.push(release);
      }
    }

    return releases;
  }

  async function findArtistSourcePayloads(artistId, limit = 10, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        SELECT s.raw_json
        FROM album_artists aa
        INNER JOIN album_sources s
          ON s.album_id = aa.album_id
         AND s.source = 'discogs'
        INNER JOIN albums a ON a.id = aa.album_id
        WHERE aa.artist_id = $1
          AND s.raw_json IS NOT NULL
        ORDER BY a.year ASC NULLS LAST, s.id ASC
        LIMIT $2
      `,
      [artistId, limit]
    );

    return result.rows
      .map((row) => parseRawJson(row.raw_json))
      .filter(Boolean);
  }

  return {
    findReleaseBySourceId,
    getReleaseByAlbumId,
    insertAlbum,
    insertAlbumSource,
    findArtistByName,
    findArtistByDiscogsSourceId,
    insertArtist,
    updateArtistSourceId,
    saveArtistProfile,
    linkAlbumArtist,
    insertTrack,
    linkTrackArtist,
    findGenreByName,
    insertGenre,
    linkAlbumGenre,
    searchLocalReleases,
    findReleaseByAlbumIdentity,
    getTrackById,
    searchTracksByQuery,
    findTracksByNormalizedTitle,
    searchArtistsByQuery,
    getArtistById,
    getGenresByArtistId,
    getAlbumsByArtistRole,
    findArtistSourcePayloads,
  };
}

module.exports = {
  createCatalogRepository,
};
