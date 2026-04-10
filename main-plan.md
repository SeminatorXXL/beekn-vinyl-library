# BeeVinyl Main Plan

## 1. Doel

BeeVinyl is een vinyl-platform waarin gebruikers:

* vinylalbums kunnen ontdekken
* album-, track- en artiestinformatie kunnen bekijken
* hun collectie, wishlist en favorieten kunnen beheren
* later sociale functies kunnen gebruiken

De cataloguslaag hiervoor is Beekn Vinyl Library (BVL).

## 2. Wat BVL doet

BVL is een vinyl-only catalog API.

BVL:

* bewaart genormaliseerde catalogusdata in PostgreSQL
* gebruikt Discogs alleen als fallbackbron
* slaat opgehaalde data lokaal op
* levert daarna dezelfde data uit de eigen database terug

Kort:

* fetch once
* store locally
* serve fast

## 3. Wat BVL teruggeeft

BVL ondersteunt 6 read scenario's:

* Album overview: cover, albumnaam, main artist
* Album detail: albuminfo, formats, tracks, support artists
* Track overview: cover van vroegste album-entry, tracknaam, artiesten
* Track detail: tracknaam, artiesten, album appearances, positie per album
* Artist overview: afbeelding, naam
* Artist detail: afbeelding, naam, real name, genres, socials, main albums, featured albums

Actieve endpoints:

```http
GET /catalog/albums/search?q=
GET /catalog/albums/:id
GET /catalog/tracks/search?q=
GET /catalog/tracks/:id
GET /catalog/artists/search?q=
GET /catalog/artists/:id
```

Belangrijk:

* `/catalog/albums/search` is album overview
* `/catalog/albums/:id` is album detail op intern album id
* `/catalog/tracks/:id` gebruikt intern track id
* `/catalog/artists/:id` gebruikt intern artist id

## 4. Architectuur

Het systeem bestaat uit drie lagen:

1. BVL
2. BeeVinyl Backend
3. BeeVinyl Frontend

### 4.1 BVL

Verantwoordelijk voor:

* vinyl catalogusdata
* Discogs fallback
* normalisatie van albums, artists, tracks en genres
* snelle read API voor catalogusdata

BVL is de catalogus source of truth.

### 4.2 BeeVinyl Backend

Verantwoordelijk voor:

* authenticatie
* gebruikersbeheer
* collectie
* wishlist
* favorieten
* privacy en sharing
* social features later

De BeeVinyl backend praat met BVL.

### 4.3 BeeVinyl Frontend

Verantwoordelijk voor:

* UI
* state management
* tonen van catalogusdata
* tonen van gebruikersdata

De frontend praat niet direct met BVL.

## 5. Hoe het werkt

### Album overview flow

1. Frontend vraagt albums op via BeeVinyl Backend
2. BeeVinyl Backend vraagt BVL
3. BVL zoekt eerst lokaal in PostgreSQL
4. Als er te weinig lokale resultaten zijn, gebruikt BVL Discogs fallback
5. BVL transformeert en bewaart de data
6. BVL geeft de opgeslagen data terug
7. BeeVinyl Backend geeft de response terug aan de frontend

### Album detail flow

1. Frontend vraagt albumdetail op
2. BeeVinyl Backend vraagt BVL met intern album id
3. BVL controleert PostgreSQL
4. Als het album ontbreekt, haalt BVL het op uit Discogs
5. BVL slaat het album, artists, tracks en genres op
6. BVL retourneert de opgeslagen detailresponse

### Track en artist flow

1. Frontend vraagt BeeVinyl Backend
2. BeeVinyl Backend vraagt BVL
3. BVL bouwt track- en artist-readmodels uit opgeslagen vinyldata
4. Als artist-profieldata ontbreekt, haalt BVL die eenmalig op uit Discogs
5. BVL slaat die artist-profieldata lokaal op
6. Volgende requests komen uit PostgreSQL

## 6. Database model van BVL

Belangrijkste tabellen:

* `albums`
* `album_sources`
* `artists`
* `album_artists`
* `tracks`
* `track_artists`
* `genres`
* `album_genres`

Extra artist cachevelden op `artists`:

* `discogs_source_id`
* `image_url`
* `real_name`
* `socials`
* `profile_raw_json`
* `profile_updated_at`

Belangrijke regel:

* BVL retourneert nooit raw Discogs JSON naar de API-consumer

## 7. Dataregels

BVL werkt met deze regels:

* alleen vinyl releases zijn in scope
* SQL staat in repositories, niet in controllers
* alle queries zijn parameterized
* `album_sources (source, source_id)` voorkomt dubbele bronrecords
* album identity voorkomt dubbele albums bij herhaalde Discogs search hits
* artist-profielen worden lokaal gecachet na eerste succesvolle fetch

## 8. BeeVinyl Backend rol

De BeeVinyl backend gebruikt BVL als cataloguslaag en beheert zelf:

* users
* collectie
* wishlist
* favorieten
* delen van lijsten
* toekomstige sociale logica

De BeeVinyl backend is de enige laag die de frontend aanspreekt.

## 9. Frontend regels

De frontend:

* gebruikt de BeeVinyl backend API
* praat niet direct met BVL
* toont Discogs-attributie waar nodig
* gebruikt overview endpoints voor lijsten
* gebruikt detail endpoints voor detailpagina's

## 10. Security

Belangrijke regels:

* BVL gebruikt een interne API key
* CORS werkt met een allowlist
* rate limiting beschermt de API
* secrets staan alleen in `.env`
* Discogs token wordt nooit gelogd
* interne fouten worden niet rauw naar buiten gestuurd

## 11. Lokale setup

Aanbevolen lokaal:

* BeeVinyl frontend op `http://localhost:3000`
* BVL op `http://localhost:3001`

## 12. Kernzin

BeeVinyl gebruikt BVL als vinyl-only cataloguslaag: BVL haalt alleen ontbrekende catalogusdata op uit Discogs, slaat die lokaal op in PostgreSQL en serveert daarna snelle, genormaliseerde API-responses vanuit de eigen database.
