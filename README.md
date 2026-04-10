# Beekn Vinyl Library (BVL)

## Overview

Beekn Vinyl Library (BVL) is a vinyl-only catalog API for BeeVinyl.

It uses a local PostgreSQL database as the primary source of truth and only calls Discogs when vinyl data is missing. Once a release or artist profile is fetched, transformed, and stored, later requests are served from the local database.

## Core Idea

Fetch once, store locally, serve fast.

## Stack

* Node.js
* Express
* PostgreSQL
* Discogs API

## API

```http
GET /catalog/albums/search?q=
GET /catalog/albums/:id
GET /catalog/tracks/search?q=
GET /catalog/tracks/:id
GET /catalog/artists/search?q=
GET /catalog/artists/:id
```

All requests must include:

```http
Authorization: Bearer YOUR_INTERNAL_API_KEY
```

## Product Scope

BVL is only about vinyl albums.

The frontend reads one of these scenarios:

* Album overview: cover, name, main artist
* Album detail: full album info, tracks, support artists
* Track overview: cover from earliest album entry, track name, artist names
* Track detail: cover from earliest album entry, artist names, albums where the track appears, and where it appears on those albums
* Artist overview: artist picture, name
* Artist detail: artist picture, name, real name, genres, socials, main albums, featured albums

## Features

* Vinyl-only release ingest
* Album overview search with Discogs fallback
* Album detail by internal album id
* Track overview and detail from stored vinyl data
* Artist overview and detail from stored vinyl data with persisted Discogs artist caching
* `.env` support via `dotenv`
* CORS allowlist middleware
* Per-IP API rate limiting
* Duplicate prevention for repeated editions of the same album during search backfill

## Installation

```bash
git clone https://github.com/SeminatorXXL/beekn-vinyl-library.git
cd beekn-vinyl-library
npm install
```

## Environment

Create a local `.env` file based on `.env.example`.

Example:

```env
PORT=3001
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/bvl
DISCOGS_TOKEN=YOUR_DISCOGS_TOKEN
INTERNAL_API_KEY=YOUR_INTERNAL_API_KEY
ALLOWED_ORIGINS=https://beevinyl.app,http://localhost:3000,http://localhost:5173
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
TRUST_PROXY=false
```

## Local Development

Recommended local setup:

* BeeVinyl frontend: `http://localhost:3000`
* BVL backend: `http://localhost:3001`

Start BVL:

```bash
npm run dev
```

If you are upgrading an existing database, run:

```bash
psql "$DATABASE_URL" -f sql/002_artist_profile_cache.sql
```

## Endpoint Summary

### Album overview

```http
GET /catalog/albums/search?q=Papercuts
```

Returns compact album cards:

* cover
* album title
* main artists

### Album detail

```http
GET /catalog/albums/1
```

Uses the internal album id from album search results and returns:

* album info
* vinyl formats
* main artists
* support artists
* tracks
* track support artists

### Track overview

```http
GET /catalog/tracks/search?q=Crawling
```

Returns:

* track title
* artist names
* cover from the earliest stored vinyl album entry

### Track detail

```http
GET /catalog/tracks/1
```

Returns:

* track title
* artist names
* cover from the earliest stored vinyl album entry
* list of album appearances
* position and track number on those albums

### Artist overview

```http
GET /catalog/artists/search?q=Linkin Park
```

Returns:

* artist name
* artist picture

Artist profiles are stored locally after the first successful Discogs lookup.

### Artist detail

```http
GET /catalog/artists/1
```

Returns:

* artist name
* artist picture
* real name
* genres
* socials
* albums as main artist
* albums as featured/support artist

Artist profile fields are returned from PostgreSQL after they have been cached once.

## How the API Works

1. The client calls one of the catalog endpoints.
2. BVL checks PostgreSQL first.
3. If stored vinyl data exists, BVL returns the database result.
4. If an album is missing, BVL fetches it from Discogs.
5. BVL transforms the payload into the internal schema.
6. BVL stores the normalized data.
7. BVL returns the stored result.

## Security Controls

### CORS allowlist

BVL uses a dedicated CORS middleware file and only allows configured origins.

Example:

```env
ALLOWED_ORIGINS=https://beevinyl.app,http://localhost:3000
```

### API rate limiting

BVL includes a per-IP request limiter.

Example:

```env
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
```

That means one IP can make up to 10 requests per 1 second window.

## Related Docs

* `GUIDE.md`: API usage guide
* `TECHNICAL_PLAN.md`: architecture and backend rules
* `INSTALLATION.md`: deployment guide for `bvl.beekn.nl`

## Legal

This project uses data from Discogs.

Required:

* Display `Data provided by Discogs`
* Link to the original Discogs page when possible
