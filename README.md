# Beekn Vinyl Library (BVL)

## Overview

Beekn Vinyl Library (BVL) is a self-growing vinyl catalog service.

It stores music data in a normalized PostgreSQL schema and only calls Discogs when local data is missing. Once a release has been fetched, transformed, and stored, later requests are served from the local database.

## How It Works

1. A client calls the BVL API
2. BVL checks PostgreSQL first
3. If the data exists locally, BVL returns it
4. If the data is missing, BVL calls Discogs
5. BVL transforms the Discogs payload into the internal schema
6. BVL stores the normalized result
7. BVL returns the stored result

## Core Idea

Fetch once, store forever.

Discogs is a fallback source, not the main read path.

## Tech Stack

* Node.js
* Express
* PostgreSQL

## API

```http
GET /catalog/search?q=
GET /catalog/releases/:id
```

All requests must include:

```http
Authorization: Bearer YOUR_INTERNAL_API_KEY
```

## Installation

```bash
git clone https://github.com/SeminatorXXL/beekn-vinyl-library.git
cd beekn-vinyl-library
npm install
```

## Environment

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/bvl
DISCOGS_TOKEN=your_token
INTERNAL_API_KEY=your_internal_key
ALLOWED_ORIGIN=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3001
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
TRUST_PROXY=false
```

## Run

```bash
npm run dev
```

## Security Controls

### CORS allowlist

BVL uses a dedicated CORS middleware file and only allows configured origins.

Use either:

* `ALLOWED_ORIGIN` for a single frontend
* `ALLOWED_ORIGINS` for a comma-separated allowlist

Example:

```env
ALLOWED_ORIGINS=http://localhost:5173,https://app.example.com
```

Requests without an `Origin` header, like server-to-server calls or local API tools, are still allowed.

### API rate limiting

BVL includes a per-IP request limiter.

Environment variables:

```env
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
TRUST_PROXY=false
```

That example means a single IP can make up to 10 requests per 1 second window.

If BVL is running behind a reverse proxy, set:

```env
TRUST_PROXY=true
```

## Search

The search endpoint is local-first.

It searches:

* `albums.title`
* `artists.name`
* `tracks.title`

If fewer than 5 local results are found, BVL searches Discogs, ingests missing releases into PostgreSQL, and returns the combined results.

### Endpoint usage

```http
GET /catalog/search?q=hardstyle
```

### Example request

```bash
curl -H "Authorization: Bearer your_internal_key" ^
  "http://localhost:3000/catalog/search?q=hardstyle"
```

### Example response

```json
{
  "data": {
    "query": "hardstyle",
    "count": 2,
    "results": [
      {
        "id": 14,
        "title": "Hardstyle Adrenaline",
        "year": 2006,
        "coverUrl": "https://i.discogs.com/example.jpg",
        "source": {
          "provider": "discogs",
          "sourceId": "12345",
          "sourceUrl": "https://www.discogs.com/release/12345"
        },
        "artists": [
          {
            "id": 9,
            "name": "The Beekn DJs",
            "role": "Primary"
          }
        ],
        "genres": [
          {
            "id": 3,
            "name": "Electronic"
          }
        ],
        "trackCount": 12
      }
    ]
  }
}
```

## Legal

This project uses data from Discogs.

Required:

* Display: `Data provided by Discogs`
* Link to the original Discogs page when possible
