# BVL API Guide

## 1. How to use the API

All requests must include the internal API key:

```http
Authorization: Bearer YOUR_INTERNAL_API_KEY
```

Recommended local development setup:

* BeeVinyl frontend: `http://localhost:3000`
* BVL backend: `http://localhost:3001`

## 2. Endpoints

### Album overview

```http
GET /catalog/albums/search?q=Papercuts
```

Returns:

* cover
* album title
* main artist or artists

Only vinyl releases are returned or ingested.

Album overviews are always returned from PostgreSQL. If Discogs fallback is needed, BVL stores the release first and returns the stored version.

### Album detail

```http
GET /catalog/albums/1
```

Returns:

* album data
* formats
* main artists
* support artists
* tracks
* track support artists

### Track overview

```http
GET /catalog/tracks/search?q=Crawling
```

Returns:

* track name
* artist name or names
* cover from the earliest stored album appearance

### Track detail

```http
GET /catalog/tracks/1
```

Returns:

* track name
* artist names
* cover from the earliest stored album appearance
* all album appearances
* position and track number for each appearance

### Artist overview

```http
GET /catalog/artists/search?q=Linkin Park
```

Returns:

* artist name
* artist picture

If the artist picture is fetched from Discogs, it is saved to PostgreSQL before the response is returned.

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
* albums where the artist is main artist
* albums where the artist is featured/support artist

If artist profile fields are missing locally, BVL fetches them once, stores them, and serves the stored version on later requests.

## 3. Example requests

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/albums/search?q=Papercuts"
```

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/albums/1"
```

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/tracks/search?q=Crawling"
```

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/tracks/1"
```

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/artists/search?q=Linkin Park"
```

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer YOUR_INTERNAL_API_KEY" } `
  -Uri "http://localhost:3001/catalog/artists/1"
```

## 4. Example responses

### Album overview response

```json
{
  "data": {
    "query": "Papercuts",
    "count": 1,
    "results": [
      {
        "id": 1,
        "title": "Papercuts",
        "coverUrl": "https://i.discogs.com/example.jpg",
        "mainArtists": [
          {
            "id": 1,
            "name": "Linkin Park"
          }
        ]
      }
    ]
  }
}
```

### Album detail response

```json
{
  "data": {
    "id": 1,
    "title": "Papercuts",
    "year": 2024,
    "coverUrl": "https://i.discogs.com/example.jpg",
    "isVinyl": true,
    "formats": [
      {
        "name": "Vinyl",
        "qty": "2",
        "descriptions": ["LP", "Compilation"]
      }
    ],
    "mainArtists": [
      {
        "id": 1,
        "name": "Linkin Park",
        "sortName": "Linkin Park",
        "role": "Primary",
        "sortOrder": 1
      }
    ],
    "supportArtists": [],
    "genres": [
      {
        "id": 1,
        "name": "Rock"
      }
    ],
    "tracks": [
      {
        "id": 1,
        "position": "1",
        "trackNumber": 1,
        "title": "Crawling",
        "duration": "3:29",
        "mainArtists": [
          {
            "id": 1,
            "name": "Linkin Park",
            "sortName": "Linkin Park",
            "role": "Primary",
            "sortOrder": 1
          }
        ],
        "supportArtists": []
      }
    ]
  }
}
```

### Track detail response

```json
{
  "data": {
    "id": 1,
    "title": "Crawling",
    "coverUrl": "https://i.discogs.com/example.jpg",
    "artists": [
      {
        "id": 1,
        "name": "Linkin Park"
      }
    ],
    "appearances": [
      {
        "trackId": 1,
        "albumId": 1,
        "albumTitle": "Papercuts",
        "albumYear": 2024,
        "albumCoverUrl": "https://i.discogs.com/example.jpg",
        "albumMainArtists": [
          {
            "id": 1,
            "name": "Linkin Park"
          }
        ],
        "position": "1",
        "trackNumber": 1
      }
    ]
  }
}
```

### Artist detail response

```json
{
  "data": {
    "id": 1,
    "name": "Linkin Park",
    "imageUrl": "https://i.discogs.com/example-artist.jpg",
    "realName": "Linkin Park",
    "genres": [
      {
        "id": 1,
        "name": "Rock"
      }
    ],
    "socials": [
      "https://www.linkinpark.com"
    ],
    "mainAlbums": [
      {
        "id": 1,
        "title": "Papercuts",
        "coverUrl": "https://i.discogs.com/example.jpg",
        "mainArtists": [
          {
            "id": 1,
            "name": "Linkin Park"
          }
        ]
      }
    ],
    "featuredAlbums": []
  }
}
```

## 5. How data flows

1. Client sends request to BVL
2. BVL checks PostgreSQL first
3. If local vinyl data exists, BVL returns it
4. If an album is missing, BVL calls Discogs
5. BVL transforms the Discogs payload into the internal schema
6. BVL stores the normalized result
7. If artist profile enrichment is needed, BVL stores that too
8. BVL returns the stored result

In short:

```text
request -> BVL -> DB -> Discogs fallback -> DB -> response
```

## 6. Security and access

### CORS

Browser origins must be allowed in:

```env
ALLOWED_ORIGINS=https://beevinyl.app,http://localhost:3000
```

### Rate limiting

BVL applies a per-IP API limiter.

Example:

```env
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
```

## 7. Rules for developers

* Always use the API, never direct DB access
* Never expose raw Discogs data in API responses
* Always show Discogs attribution in the frontend
* Keep frontend and backend on separate local ports
* Store secrets in `.env`, never in git
* Treat BVL as a vinyl-only catalog
