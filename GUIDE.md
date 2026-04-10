# BVL API Guide

## 1. How to use the API

All requests must include the internal API key:

```http
Authorization: Bearer YOUR_INTERNAL_API_KEY
```

### Search endpoint

```http
GET /catalog/search?q=hardstyle
```

Use this endpoint to search the local BVL catalog. If PostgreSQL has fewer than 5 matches, BVL fetches matching releases from Discogs, stores them, and returns the combined result.

### Get release endpoint

```http
GET /catalog/releases/:id
```

Use this endpoint to request a Discogs release by id. If BVL already stored that release, it is returned from PostgreSQL. If not, BVL fetches it from Discogs, stores it, and returns the stored record.

## 2. Example requests

```http
GET /catalog/search?q=hardstyle
GET /catalog/releases/249504
```

## 3. Example responses (JSON)

### Search response

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

### Release response

```json
{
  "data": {
    "id": 14,
    "title": "Hardstyle Adrenaline",
    "year": 2006,
    "coverUrl": "https://i.discogs.com/example.jpg",
    "createdAt": "2026-04-10T19:00:00.000Z",
    "source": {
      "provider": "discogs",
      "sourceId": "12345",
      "sourceUrl": "https://www.discogs.com/release/12345"
    },
    "artists": [
      {
        "id": 9,
        "name": "The Beekn DJs",
        "sortName": "Beekn DJs, The",
        "role": "Primary",
        "sortOrder": 1
      }
    ],
    "genres": [
      {
        "id": 3,
        "name": "Electronic"
      }
    ],
    "tracks": [
      {
        "id": 52,
        "position": "A1",
        "trackNumber": 1,
        "title": "Intro Mix",
        "duration": "5:41",
        "artists": [
          {
            "id": 9,
            "name": "The Beekn DJs",
            "sortName": "Beekn DJs, The",
            "role": "Primary",
            "sortOrder": 1
          }
        ]
      }
    ]
  }
}
```

## 4. How data flows

The flow is simple:

1. Client sends request to BVL
2. BVL checks PostgreSQL first
3. If data exists, BVL returns local data
4. If data is missing, BVL calls Discogs
5. BVL transforms Discogs data into the internal schema
6. BVL stores the normalized result
7. BVL returns the stored result

In short:

```text
request -> BVL -> DB -> Discogs fallback -> DB -> response
```

## 5. Rules for developers

* Always use the API, never direct DB access
* Never expose raw Discogs data in API responses
* Always show Discogs attribution in the frontend
