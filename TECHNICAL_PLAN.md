# TECHNICAL_PLAN.md

## Architecture

### Flow

1. Request album
2. Check local database
3. If not found → Discogs API
4. Transform data
5. Store in database
6. Return response

---

## Backend Structure

Recommended folder structure:

```
src/
  controllers/
  routes/
  services/
    discogs.service.js
    transform.service.js
    ingest.service.js
  repositories/
  middleware/
  db/
```

---

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

---

## Database Rules

* Use foreign keys for all relations
* Add indexes on:

  * albums.title
  * album_sources.source_id
  * artists.name
* Use unique constraint on:

  * album_sources.source + source_id

---

## Services

### DiscogsService

Responsible for external API calls

Example:

```js
async function fetchRelease(id) {
  const res = await fetch(`https://api.discogs.com/releases/${id}`, {
    headers: {
      'Authorization': `Discogs token=${process.env.DISCOGS_TOKEN}`
    }
  });

  if (!res.ok) throw new Error('Discogs fetch failed');

  return res.json();
}
```

---

### TransformService

Maps Discogs data to internal structure

* normalize track positions
* extract artists
* map genres

---

### IngestService

Responsible for saving data safely

Steps:

1. Check if album already exists (via source_id)
2. Insert album
3. Insert artists (if not exists)
4. Create relations
5. Insert tracks

---

## Security

### Internal API Authentication

Although BVL is an internal service, restrict access to trusted clients only.

Use a shared API key via Authorization header.

```js
// middleware/auth.middleware.js
export function requireApiKey(req, res, next) {
  const key = req.headers['authorization'];
  if (!key || key !== `Bearer ${process.env.INTERNAL_API_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}
```

Apply to routes:

```js
router.use(requireApiKey);
```

---

### SQL Injection Prevention

Always use parameterized queries.

```js
await db.query('SELECT * FROM albums WHERE id = $1', [id]);
```

Never interpolate user input directly.

---

### Input Validation

Validate all inputs using a schema (e.g. Zod/Joi).

---

### CORS (restricted)

Allow only the BeeVinyl app origin.

```js
import cors from 'cors';

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN
}));
```

---

### Security Headers (Helmet)

```js
import helmet from 'helmet';
app.use(helmet());
```

---

### Secrets & Logging

* Never log Discogs tokens
* Never expose raw JSON via API
* Keep .env out of version control

---

### Rate Limiting (Discogs)

Respect Discogs limit (~60 req/min)

Implement basic limiter:

* queue requests
* throttle external calls

---

## Search Strategy

Define behavior explicitly.

### Option A (recommended)

1. Search local database
2. If results < threshold → call Discogs search
3. Transform + store results
4. Merge and return

---

## Migrations

Use a migration tool from the start.

Recommended:

* node-pg-migrate
* or Prisma Migrate

Do not manually edit schema in production.

---

## Indexing & Performance

Prepare for search scaling.

* Add index on albums.title
* Add GIN index for full-text search (Postgres)

```sql
CREATE INDEX idx_albums_search ON albums USING GIN (to_tsvector('english', title));
```

---

## Repository Layer (Cache-ready)

Structure repositories so caching can be added later.

Example pattern:

```js
async function getAlbum(id) {
  // future: check Redis here
  return db.query('SELECT * FROM albums WHERE id = $1', [id]);
}
```

Do not mix DB logic inside controllers.

---

## Legal Notes

* Internal use is allowed under Discogs API terms
* Always display: "Data provided by Discogs" in the BeeVinyl app
* Do not expose raw Discogs JSON pu

```js
router.get('/catalog/releases/:id', async (req, res) => {
  const { id } = req.params;

  try {
    let album = await repo.getAlbumBySourceId(id);

    if (!album) {
      const data = await discogs.fetchRelease(id);
      const mapped = transform.mapRelease(data);
      album = await ingest.save(mapped);
    }

    res.json(album);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch release' });
  }
});
```

---

## Design Rules

Do:

* normalize data
* use relations
* validate input
* use parameterized queries

Do not:

* trust user input
* expose raw errors
* store raw Discogs data as main structure

---

## Roadmap

* caching layer (Redis)
* background workers
* full-text search
* performance optimization

---

## Summary

BVL is a secure, scalable system that:

* fetches data from Discogs when needed
* transforms it into a clean structure
* stores it safely
* serves it efficiently
