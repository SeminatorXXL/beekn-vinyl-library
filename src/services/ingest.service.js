function createIngestService({ db, catalogRepository }) {
  async function saveRelease(mappedRelease) {
    try {
      return await db.withTransaction(async (client) => {
        const existingRelease = await catalogRepository.findReleaseBySourceId(
          mappedRelease.source.source,
          mappedRelease.source.sourceId,
          client
        );

        if (existingRelease) {
          return existingRelease;
        }

        const identityMatch = await catalogRepository.findReleaseByAlbumIdentity(
          mappedRelease.album.title,
          mappedRelease.mainArtists,
          mappedRelease.album.year,
          client
        );

        if (identityMatch) {
          await catalogRepository.insertAlbumSource(identityMatch.id, mappedRelease.source, client);
          return catalogRepository.getReleaseByAlbumId(identityMatch.id, client);
        }

        const albumId = await catalogRepository.insertAlbum(mappedRelease.album, client);
        await catalogRepository.insertAlbumSource(albumId, mappedRelease.source, client);

        const artistIdCache = new Map();
        const genreIdCache = new Map();

        async function getArtistId(artist) {
          const cacheKey = (artist.sourceId || artist.name || "").toLowerCase();
          if (artistIdCache.has(cacheKey)) {
            return artistIdCache.get(cacheKey);
          }

          const existingArtistBySourceId = artist.sourceId
            ? await catalogRepository.findArtistByDiscogsSourceId(artist.sourceId, client)
            : null;
          const existingArtist =
            existingArtistBySourceId || (await catalogRepository.findArtistByName(artist.name, client));
          const persistedArtist = existingArtist || (await catalogRepository.insertArtist(artist, client));

          if (artist.sourceId && persistedArtist.discogsSourceId !== artist.sourceId) {
            await catalogRepository.updateArtistSourceId(
              persistedArtist.id,
              artist.sourceId,
              client
            );
          }

          artistIdCache.set(cacheKey, persistedArtist.id);
          return persistedArtist.id;
        }

        async function getGenreId(genreName) {
          const cacheKey = genreName.toLowerCase();
          if (genreIdCache.has(cacheKey)) {
            return genreIdCache.get(cacheKey);
          }

          const existingGenre = await catalogRepository.findGenreByName(genreName, client);
          const persistedGenre = existingGenre || (await catalogRepository.insertGenre(genreName, client));
          genreIdCache.set(cacheKey, persistedGenre.id);
          return persistedGenre.id;
        }

        for (const albumArtist of mappedRelease.artists) {
          const artistId = await getArtistId(albumArtist);
          await catalogRepository.linkAlbumArtist(
            albumId,
            artistId,
            albumArtist.role,
            albumArtist.sortOrder,
            client
          );
        }

        for (const genreName of mappedRelease.genres) {
          const genreId = await getGenreId(genreName);
          await catalogRepository.linkAlbumGenre(albumId, genreId, client);
        }

        for (const track of mappedRelease.tracks) {
          const trackId = await catalogRepository.insertTrack(albumId, track, client);

          for (const [index, trackArtist] of track.artists.entries()) {
            const artistId = await getArtistId(trackArtist);
            await catalogRepository.linkTrackArtist(
              trackId,
              artistId,
              trackArtist.role,
              trackArtist.sortOrder || index + 1,
              client
            );
          }
        }

        return catalogRepository.getReleaseByAlbumId(albumId, client);
      });
    } catch (error) {
      if (error && error.code === "23505") {
        return catalogRepository.findReleaseBySourceId(
          mappedRelease.source.source,
          mappedRelease.source.sourceId
        );
      }

      throw error;
    }
  }

  return {
    saveRelease,
  };
}

module.exports = {
  createIngestService,
};
