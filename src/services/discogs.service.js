const { ExternalServiceError, NotFoundError } = require("../errors/app-error");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createDiscogsService(options = {}) {
  const baseUrl = options.baseUrl || "https://api.discogs.com";
  const token = options.token || process.env.DISCOGS_TOKEN;
  const userAgent = options.userAgent || "BeeknVinylLibrary/1.0";
  const fetchImpl = options.fetchImpl || fetch;
  const minIntervalMs = options.minIntervalMs || 1100;

  if (!token) {
    throw new Error("DISCOGS_TOKEN is required");
  }

  let nextAvailableAt = 0;
  let queue = Promise.resolve();

  function cleanLogValue(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).replace(/\s+/g, " ").trim();
    return normalized || null;
  }

  function logDiscogsCall(action, details = {}) {
    const parts = Object.entries(details)
      .map(([key, value]) => [key, cleanLogValue(value)])
      .filter(([, value]) => value)
      .map(([key, value]) => `${key}=${value}`);

    const suffix = parts.length > 0 ? ` | ${parts.join(" | ")}` : "";
    console.info(`[Discogs] ${action}${suffix}`);
  }

  function schedule(task) {
    const run = queue.then(async () => {
      const waitMs = Math.max(0, nextAvailableAt - Date.now());

      if (waitMs > 0) {
        await delay(waitMs);
      }

      try {
        return await task();
      } finally {
        nextAvailableAt = Date.now() + minIntervalMs;
      }
    });

    queue = run.catch(() => undefined);
    return run;
  }

  async function fetchRelease(id, metadata = {}) {
    return schedule(async () => {
      logDiscogsCall("fetch release", {
        id,
        title: metadata.title,
        artist: metadata.artistName,
        reason: metadata.reason,
      });

      const response = await fetchImpl(`${baseUrl}/releases/${id}`, {
        headers: {
          Authorization: `Discogs token=${token}`,
          "User-Agent": userAgent,
        },
      });

      if (response.status === 404) {
        throw new NotFoundError("Release not found");
      }

      if (response.status === 429) {
        throw new ExternalServiceError("Discogs rate limit reached");
      }

      if (!response.ok) {
        throw new ExternalServiceError("Failed to fetch release from Discogs");
      }

      const payload = await response.json();

      if (!payload || typeof payload !== "object" || !payload.id) {
        throw new ExternalServiceError("Discogs returned an invalid release payload");
      }

      return payload;
    });
  }

  async function searchReleases(query, options = {}) {
    logDiscogsCall("search releases", {
      query,
      perPage: options.perPage || 10,
      page: options.page || 1,
      reason: options.reason,
    });

    const params = new URLSearchParams({
      q: query,
      type: "release",
      per_page: String(options.perPage || 10),
      page: String(options.page || 1),
    });

    return schedule(async () => {
      const response = await fetchImpl(`${baseUrl}/database/search?${params.toString()}`, {
        headers: {
          Authorization: `Discogs token=${token}`,
          "User-Agent": userAgent,
        },
      });

      if (response.status === 429) {
        throw new ExternalServiceError("Discogs rate limit reached");
      }

      if (!response.ok) {
        throw new ExternalServiceError("Failed to search Discogs");
      }

      const payload = await response.json();
      const results = Array.isArray(payload.results) ? payload.results : [];

      return {
        pagination: payload.pagination || null,
        results,
      };
    });
  }

  async function fetchArtist(id, metadata = {}) {
    return schedule(async () => {
      logDiscogsCall("fetch artist", {
        id,
        artist: metadata.artistName,
        reason: metadata.reason,
      });

      const response = await fetchImpl(`${baseUrl}/artists/${id}`, {
        headers: {
          Authorization: `Discogs token=${token}`,
          "User-Agent": userAgent,
        },
      });

      if (response.status === 404) {
        throw new NotFoundError("Artist not found");
      }

      if (response.status === 429) {
        throw new ExternalServiceError("Discogs rate limit reached");
      }

      if (!response.ok) {
        throw new ExternalServiceError("Failed to fetch artist from Discogs");
      }

      const payload = await response.json();

      if (!payload || typeof payload !== "object" || !payload.id) {
        throw new ExternalServiceError("Discogs returned an invalid artist payload");
      }

      return payload;
    });
  }

  return {
    fetchRelease,
    searchReleases,
    fetchArtist,
  };
}

module.exports = {
  createDiscogsService,
};
