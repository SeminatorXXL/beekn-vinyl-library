# TECHNICAL_PLAN.md

## Architecture

### Flow

1. Request album
2. Check local database
3. If not found → Discogs API
4. Transform data
5. Store in database

---

## Database Design

### albums

* id
* title
* year
* cover_url
* created_at

### album_sources

* id
* album_id
* source
* source_id
* source_url
* raw_json

### artists

* id
* name
* sort_name

### album_artists

* id
* album_id
* artist_id
* role
* sort_order

### tracks

* id
* album_id
* position
* track_number
* title
* duration

### track_artists

* id
* track_id
* artist_id
* role
* sort_order

### genres

* id
* name

### album_genres

* id
* album_id
* genre_id

### album_images

* id
* album_id
* url
* type
* sort_order

---

## Services

* DiscogsService
* TransformService
* IngestService

---

## Design Rules

Do:

* normalize data
* use relations
* keep Discogs as fallback

Do not:

* store raw Discogs data as main structure
* treat releases as formats

---

## Roadmap

* caching layer
* background workers
* performance improvements

---

## Summary

BVL is a self-growing database that stores clean music data and uses Discogs only when needed.
