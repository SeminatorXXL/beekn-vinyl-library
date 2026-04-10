# TECHNICAL_PLAN.md

## Architecture

### Flow

1. Request album or search query
2. Check local database
3. If missing -> Discogs API
4. Transform data
5. Store normalized records
6. Return internal response

## Backend Structure

Recommended folder structure:

```text
src/
  controllers/
  routes/
  services/
    discogs.service.js
    transform.service.js
    ingest.service.js
    search.service.js
  repositories/
  middleware/
  db/
```

## Database Design

### albums

* id (PK)
* title
* year
* cover_url
* created_at

### album_sources

* id (PK)
* album_id (FK)
* source
* source_id
* source_url
* raw_json

### artists

* id (PK)
* name
* sort_name

### album_artists

* id (PK)
* album_id (FK)
* artist_id (FK)
* role
* sort_order

### tracks

* id (PK)
* album_id (FK)
* position
* track_number
* title
* duration

### track_artists

* id (PK)
* track_id (FK)
* artist_id (FK)
* role
* sort_order

### genres

* id (PK)
* name

### album_genres

* id (PK)
* album_id (FK)
* genre_id (FK)

### album_images

* id (PK)
* album_id (FK)
* url
* type
* sort_order

## Database Rules

* Use foreign keys for all relations
* Add indexes on `albums.title`, `album_sources.source_id`, and `artists.name`
* Use a unique constraint on `album_sources (source, source_id)`
* Keep release data normalized across albums, artists, tracks, and join tables

## Services

### DiscogsService

Responsible for external API calls:

* `fetchRelease(id)`
* `searchReleases(query)`

Rules:

* never log the Discogs token
* throttle requests
* convert Discogs failures into generic upstream errors

### TransformService

Maps Discogs payloads to the internal schema.

Responsibilities:

* normalize text
* normalize track positions
* extract artists
* map genres
* sanitize Discogs search results into internal search candidates

### IngestService

Responsible for saving data safely.

Steps:

1. Check if the release already exists via `album_sources.source + source_id`
2. Insert album
3. Insert artists if missing
4. Create album/artist relations
5. Insert genres and album/genre relations
6. Insert tracks and track/artist relations
7. Return the stored album from PostgreSQL

### SearchService

Responsible for orchestrating search.

Steps:

1. Search local database first
2. If local results are 5 or more, return them
3. If local results are fewer than 5, search Discogs
4. Fetch and ingest missing releases
5. Merge local and newly stored results
6. Return clean internal search results

## Security

### Internal API Authentication

Restrict access to trusted clients only.

Use a shared API key via the `Authorization` header:

```js
function requireApiKey(req, res, next) {
  const key = req.headers["authorization"];
  if (!key || key !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}
```

Apply to routes:

```js
router.use(requireApiKey);
```

### SQL Injection Prevention

Always use parameterized queries.

```js
await db.query("SELECT * FROM albums WHERE id = $1", [id]);
```

Never interpolate user input directly into SQL strings.

### Input Validation

Validate all route params and query params with a schema or explicit checks.

### CORS

Allow only the BeeVinyl app origin:

```js
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
}));
```

### Security Headers

Use Helmet:

```js
app.use(helmet());
```

### Secrets and Logging

* Never log Discogs tokens
* Never expose raw Discogs JSON in API responses
* Keep `.env` out of version control

### Rate Limiting

Respect Discogs limits by throttling outbound requests.

## Search Strategy

Search is local-first with Discogs fallback.

### Local Search (SQL)

Search these normalized fields:

* `albums.title`
* `artists.name`
* `tracks.title`

Use parameterized `ILIKE` queries and return distinct album ids only.

Example:

```sql
WITH matched_albums AS (
  SELECT a.id AS album_id, 1 AS match_rank
  FROM albums a
  WHERE a.title ILIKE $1 ESCAPE '\'

  UNION ALL

  SELECT aa.album_id, 2 AS match_rank
  FROM album_artists aa
  INNER JOIN artists ar ON ar.id = aa.artist_id
  WHERE ar.name ILIKE $1 ESCAPE '\'

  UNION ALL

  SELECT t.album_id, 3 AS match_rank
  FROM tracks t
  WHERE t.title ILIKE $1 ESCAPE '\'
)
SELECT album_id
FROM matched_albums
GROUP BY album_id
ORDER BY MIN(match_rank) ASC, MIN(album_id) ASC
LIMIT $2;
```

### Discogs Fallback

If fewer than 5 local results are found:

1. Call Discogs search API
2. Transform Discogs search results into release candidates
3. For each candidate, check `album_sources`
4. If the release is missing, fetch the full Discogs release
5. Transform it to the internal schema
6. Store it through the ingest service

### Merge Logic

Merge local and Discogs-backed releases by internal album id.

Rules:

* local results stay first
* duplicates are removed
* only internal response fields are returned
* raw Discogs payloads never leave the backend

### Performance Considerations

* keep the search target small at first, for example 5 results
* add indexes on `albums.title`, `artists.name`, and `album_sources.source_id`
* keep search SQL in the repository layer
* reuse ingested releases so future requests stay local
* throttle Discogs requests to avoid rate-limit issues

## Migrations

Use a migration tool from the start.

Recommended:

* `node-pg-migrate`
* or Prisma Migrate

Do not manually edit schema in production.

## Indexing and Performance

Prepare for search scaling.

Recommended:

* btree index on `albums.title`
* btree index on `artists.name`
* btree index on `album_sources.source_id`
* optional GIN index for future full-text search

Example:

```sql
CREATE INDEX idx_albums_search
ON albums USING GIN (to_tsvector('english', title));
```

## Repository Layer

Repositories must own all SQL.

Controllers should call services and repositories, but must never contain SQL directly.

## Legal Notes

* Internal use is allowed under Discogs API terms
* Always display `Data provided by Discogs` in the frontend
* Do not expose raw Discogs payloads publicly

## Design Rules

Do:

* normalize data
* use relations
* validate input
* use parameterized queries

Do not:

* trust user input
* expose raw internal errors
* expose raw Discogs JSON
* mix SQL into controllers

## Roadmap

* caching layer (Redis)
* background workers
* full-text search
* performance optimization

## Summary

BVL is a secure, scalable system that:

* fetches data from Discogs only when needed
* transforms it into a clean internal schema
* stores it safely in PostgreSQL
* serves it efficiently from the local database
