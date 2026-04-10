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
          s.source_url
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
          s.source_url
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

    const [albumArtistsResult, genresResult, tracksResult] = await Promise.all([
      executor.query(
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
      ),
      executor.query(
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
      ),
      executor.query(
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
      ),
    ]);

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
        current.push({
          id: row.id,
          name: row.name,
          sortName: row.sort_name,
          role: row.role,
          sortOrder: row.sort_order,
        });
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
      source: {
        provider: baseAlbum.source,
        sourceId: baseAlbum.source_id,
        sourceUrl: baseAlbum.source_url,
      },
      artists: albumArtistsResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        sortName: row.sort_name,
        role: row.role,
        sortOrder: row.sort_order,
      })),
      genres: genresResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
      })),
      tracks: tracks.map((track) => ({
        id: track.id,
        position: track.position,
        trackNumber: track.track_number,
        title: track.title,
        duration: track.duration,
        artists: trackArtistsByTrackId.get(track.id) || [],
      })),
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
        SELECT id, name, sort_name
        FROM artists
        WHERE LOWER(name) = LOWER($1)
        LIMIT 1
      `,
      [name]
    );

    return result.rows[0] || null;
  }

  async function insertArtist(artist, client) {
    const executor = getExecutor(client);
    const result = await executor.query(
      `
        INSERT INTO artists (name, sort_name)
        VALUES ($1, $2)
        RETURNING id, name, sort_name
      `,
      [artist.name, artist.sortName]
    );

    return result.rows[0];
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

      const releaseArtistNames = release.artists
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

  return {
    findReleaseBySourceId,
    getReleaseByAlbumId,
    insertAlbum,
    insertAlbumSource,
    findArtistByName,
    insertArtist,
    linkAlbumArtist,
    insertTrack,
    linkTrackArtist,
    findGenreByName,
    insertGenre,
    linkAlbumGenre,
    searchLocalReleases,
    findReleaseByAlbumIdentity,
  };
}

module.exports = {
  createCatalogRepository,
};
