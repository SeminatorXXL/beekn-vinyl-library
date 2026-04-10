# Local Testing

## Start BVL

```powershell
npm run dev
```

## Reset local data

```sql
TRUNCATE TABLE
  track_artists,
  tracks,
  album_artists,
  album_genres,
  album_sources,
  genres,
  artists,
  albums
RESTART IDENTITY CASCADE;
```

## Calls testen

### Album overzicht

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/search?q=Papercuts" |
ConvertTo-Json -Depth 10
```

### Album detail

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/releases/30348920" |
ConvertTo-Json -Depth 10
```

### Track overzicht

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/tracks/search?q=Crawling" |
ConvertTo-Json -Depth 10
```

### Track detail

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/tracks/1" |
ConvertTo-Json -Depth 10
```

### Artiest overzicht

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/artists/search?q=Linkin Park" |
ConvertTo-Json -Depth 10
```

### Artiest detail

```powershell
Invoke-RestMethod `
  -Headers @{ Authorization = "Bearer my-secret-key" } `
  -Uri "http://localhost:3001/catalog/artists/1" |
ConvertTo-Json -Depth 10
```
