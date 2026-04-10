# TECHNICAL_PLAN.md

## Architecture

### Flow

1. Client calls BVL
2. BVL checks PostgreSQL first
3. If vinyl data is missing, BVL calls Discogs
4. BVL transforms Discogs data into the internal schema
5. BVL stores normalized records
6. BVL returns a clean internal response

## Product Scope

BVL is a vinyl-only backend.

The API supports these read scenarios:

* Album overview
* Album detail
* Track overview
* Track detail
* Artist overview
* Artist detail

## API Endpoints

```http
GET /catalog/search?q=
GET /catalog/albums/search?q=
GET /catalog/releases/:id
GET /catalog/tracks/search?q=
GET /catalog/tracks/:id
GET /catalog/artists/search?q=
GET /catalog/artists/:id
```

Meaning:

* `/catalog/search` and `/catalog/albums/search` return album overview results
* `/catalog/releases/:id` returns album detail by Discogs release id
* `/catalog/tracks/search` returns track overview results
* `/catalog/tracks/:id` returns track detail by internal track id
* `/catalog/artists/search` returns artist overview results
* `/catalog/artists/:id` returns artist detail by internal artist id

## Backend Structure

```text
src/
  controllers/
  routes/
  services/
    catalog.service.js
    discogs.service.js
    transform.service.js
    ingest.service.js
    search.service.js
  repositories/
  middleware/
    auth.middleware.js
    cors.middleware.js
    error.middleware.js
    rate-limit.middleware.js
  db/
```

## Configuration

Environment variables are loaded through `dotenv`.

Core settings:

* `PORT`
* `DATABASE_URL`
* `DISCOGS_TOKEN`
* `INTERNAL_API_KEY`
* `ALLOWED_ORIGINS`
* `API_RATE_LIMIT_WINDOW_MS`
* `API_RATE_LIMIT_MAX_REQUESTS`
* `TRUST_PROXY`

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
* discogs_source_id
* image_url
* real_name
* socials
* profile_raw_json
* profile_updated_at

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

## Database Rules

* Use foreign keys for all relations
* Use parameterized queries only
* Add a unique constraint on `album_sources (source, source_id)`
* Keep release data normalized across albums, artists, tracks, and join tables

## Read Models

### Album overview

Fields:

* cover
* album title
* main artist or artists

### Album detail

Fields:

* album info
* vinyl formats
* main artists
* support artists
* tracks
* track support artists

### Track overview

Fields:

* cover from earliest stored album entry
* track title
* artist names

### Track detail

Fields:

* cover from earliest stored album entry
* track title
* artist names
* album appearances
* position and track number per appearance

### Artist overview

Fields:

* artist picture
* artist name

### Artist detail

Fields:

* artist picture
* artist name
* real name
* genres
* socials
* albums as main artist
* albums as featured/support artist

## Services

### DiscogsService

Responsible for external API calls:

* `fetchRelease(id)`
* `searchReleases(query)`
* `fetchArtist(id)`

Rules:

* never log the Discogs token
* throttle outbound Discogs requests
* translate Discogs failures to generic upstream errors

### TransformService

Maps Discogs payloads to the internal schema.

Responsibilities:

* normalize text
* normalize track positions
* normalize artist names
* map album and track support artists
* detect vinyl releases
* sanitize Discogs search results into internal search candidates
* deduplicate Discogs search candidates by artist + title + year

### IngestService

Responsible for saving data safely.

Steps:

1. Check whether the exact source record already exists
2. Check whether the album already exists by identity
3. Reuse the existing internal album when title + main artist already match
4. Otherwise insert a new album
5. Insert artists if missing
6. Store the Discogs artist id when it is available
7. Create album/artist relations
8. Insert genres and album/genre relations
9. Insert tracks and track/artist relations
10. Return the stored album from PostgreSQL

### SearchService

Responsible for album overview search.

Rules:

* search local data first
* if fewer than 5 album results exist, use Discogs fallback
* only ingest vinyl releases
* return compact album overviews
* always return stored normalized album data

### CatalogService

Responsible for read scenarios:

* album overview
* album detail
* track overview
* track detail
* artist overview
* artist detail

## Security

### Internal API Authentication

Use a shared API key via the `Authorization` header.

### SQL Injection Prevention

Always use parameterized queries.

### Input Validation

Validate route params and query params with a schema or explicit checks.

### CORS

Use a dedicated CORS middleware with an allowlist from `ALLOWED_ORIGINS`.

### Security Headers

Use Helmet globally.

### Rate Limiting

Use an inbound per-IP request limiter.

Discogs outbound throttling remains separate inside `DiscogsService`.

### Secrets and Logging

* Never log Discogs tokens
* Never expose raw Discogs JSON in API responses
* Keep `.env` out of version control

## Search Strategy

Album search is local-first with Discogs fallback.

### Local Search (SQL)

Search these normalized fields:

* `albums.title`
* `artists.name`
* `tracks.title`

Use parameterized `ILIKE` queries and return distinct album ids only.

### Discogs Fallback

If fewer than 5 local album results are found:

1. Call the Discogs search API
2. Transform search results into release candidates
3. Deduplicate candidates by artist + title + year
4. Fetch full releases only for missing candidates
5. Discard non-vinyl releases
6. Store vinyl releases through the ingest service

### Duplicate Prevention

Main guard:

* unique `album_sources (source, source_id)`

Additional application-level protection:

* dedupe Discogs search candidates before fetch
* reuse an existing album when title + main artist already match

## Track Strategy

Track read models are built from stored vinyl releases only.

Rules:

* track overview groups equivalent track rows by title + artist identity
* the earliest stored album entry provides the overview cover
* track detail lists all album appearances and positions

## Artist Strategy

Artist read models are built from stored vinyl releases.

Rules:

* local artist search comes from the `artists` table
* artist image, real name, and socials are enriched from Discogs artist data when needed
* once artist profile data is fetched, it is stored on the `artists` row for later requests
* main and featured albums are separated by role

## Indexing and Performance

Recommended:

* btree index on `albums.title`
* btree index on `artists.name`
* unique partial index on `artists.discogs_source_id`
* btree index on `album_sources.source_id`
* btree index on `tracks.title`
* optional GIN or trigram indexes for future search tuning

## Local Development

Recommended local setup:

* BeeVinyl frontend: `localhost:3000`
* BVL backend: `localhost:3001`

## Legal Notes

* Internal use is allowed under Discogs API terms
* Always display `Data provided by Discogs` in the frontend
* Do not expose raw Discogs payloads publicly

## Roadmap

* Redis-backed rate limiting
* background workers
* full-text search
* performance optimization
