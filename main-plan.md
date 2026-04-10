# BeeVinyl (BV) – Complete Technical Project Plan

## 1. Doel van de applicatie

BeeVinyl (BV) is een webapplicatie voor vinyl-liefhebbers waarin gebruikers:

- vinyl releases kunnen ontdekken via de Beekn Vinyl Library (BVL)
- hun eigen collectie, wishlist en favorieten beheren
- kunnen zoeken op album- en trackniveau
- sociale interactie hebben met vrienden
- hun collectie veilig kunnen delen

---

## 2. Architectuur

### Overzicht

Het systeem bestaat uit drie lagen:

1. Beekn Vinyl Library (BVL) – Catalogus Service (extern)
2. BeeVinyl Backend (BV Backend)
3. BeeVinyl Frontend (BV Frontend)

---

### 2.1 Beekn Vinyl Library (BVL)

De centrale catalogusdatabase.

Bevat:
- alle vinyl releases
- artiesten
- tracks
- relaties tussen deze entiteiten

Functie:
- bron van waarheid (source of truth)
- levert data via API

Belangrijk:
- wordt NIET direct door de frontend aangesproken

---

### 2.2 BeeVinyl Backend (BV Backend)

Verantwoordelijk voor:

- authenticatie
- gebruikersbeheer
- collectie / wishlist / favorieten
- vrienden / social
- feed (later)
- orders
- caching van catalogusdata
- privacy en sharing

Belangrijk:
- frontend praat alleen met deze backend
- backend bepaalt wanneer BVL wordt aangeroepen

---

### 2.3 BeeVinyl Frontend (BV Frontend)

- React applicatie
- UI + state management
- communiceert alleen met BV Backend

---

## 3. Data Flow

### Zoekflow

Frontend → BV Backend  
→ Cache check  
→ (miss) → BVL API  
→ Cache opslaan  
→ Response

---

### Detailflow

Frontend → BV Backend  
→ Release cache check  
→ (miss/stale) → BVL API  
→ Cache update  
→ Response

---

## 4. Database Design

## 4.1 Beekn Vinyl Library (BVL Database)

### artists
- id
- name
- sort_name
- created_at

---

### releases
- id
- title
- main_artist_id
- year
- genre
- cover_url
- updated_at

---

### release_artists
- id
- release_id
- artist_id
- role (main, featured, etc.)
- sort_order

---

### tracks
- id
- release_id
- track_number
- title
- duration

---

### track_artists
- id
- track_id
- artist_id
- role (main, featured, remix)
- sort_order

---

## 4.2 BeeVinyl App Database (BV Database)

### users
- id
- username
- name
- email
- phone (nullable)
- password_hash
- created_at

---

### user_collection_items
- id
- user_id
- release_id (ref → BVL)
- added_at
- condition
- notes

---

### user_wishlist_items
- id
- user_id
- release_id (ref → BVL)
- added_at

---

### user_favorite_items
- id
- user_id
- release_id (ref → BVL)
- added_at

---

### friendships
- id
- requester_id
- addressee_id
- status (pending, accepted)
- created_at

---

### activity_feed_events (fase 2)
- id
- actor_user_id
- event_type
- release_id
- created_at

---

### orders
- id
- user_id
- release_id
- status (planned, ordered, shipped, delivered)
- ordered_at
- delivered_at

---

### share_tokens
- id
- user_id
- type (collection, wishlist)
- token
- visibility
- expires_at

---

## 5. Multi-Artist Support

Het systeem ondersteunt:

- meerdere artiesten per track
- meerdere artiesten per release

Door gebruik van:

- track_artists
- release_artists

---

## 6. Cache Strategie

### Doel
- snellere zoekresultaten
- minder load op BVL API

---

### Search Cache
search_cache
- query
- result_json
- created_at
- expires_at

---

### Release Cache
release_cache
- release_id
- payload_json
- cached_at
- last_accessed_at
- expires_at

---

### Cache regels

Cache wanneer:
- recent bekeken
- vaak gezocht
- in collectie/wishlist zit

---

### TTL (voorbeeld)

- search: 24 uur  
- release: 7 dagen  
- populair: 14 dagen  

---

## 7. API Structuur

### 7.1 BVL API

GET /catalog/search/releases  
GET /catalog/releases/:id  
GET /catalog/search/tracks  

---

### 7.2 BV Backend API

GET /api/search/releases  
GET /api/search/tracks  
GET /api/releases/:id  

POST /api/me/collection  
POST /api/me/wishlist  
POST /api/me/favorites  

GET /api/me/collection  
GET /api/me/wishlist  

---

## 8. Privacy & Sharing

### Visibility levels

- private
- friends
- link
- public

---

### Share links

/shared/collection/{token}  
/shared/wishlist/{token}  

---

## 9. Zoekfunctionaliteit

### Globaal
- alle releases uit BVL
- tracks
- artiesten
- multi-artist support

---

### Persoonlijk
- zoeken in eigen collectie
- “heb ik dit nummer?”
- “op welke plaat staat dit nummer?”

---

### Social
- vrienden collecties
- wishlist van anderen

---

## 10. Pagina Structuur

### Publiek
- home
- search
- release detail
- login
- register

---

### Ingelogd
- dashboard
- collectie
- wishlist
- favorieten
- profiel
- vrienden
- instellingen

---

### Shared
- gedeelde collectie
- gedeelde wishlist

---

## 11. Tech Stack

### Frontend
- React (Vite)
- React Router
- TanStack Query
- React Hook Form

---

### Backend
- Node.js
- Express
- TypeScript
- Prisma ORM

---

### Database
- PostgreSQL

---

### Cache
- PostgreSQL (initieel)
- Redis (later)

---

### Storage
- S3-compatible storage (images)

---

## 12. Bouwvolgorde

### Fase 1 (MVP)
- auth systeem
- catalogus search via BVL
- release detail
- collectie
- wishlist
- favorieten
- profiel
- privacy instellingen
- share links

---

### Fase 2
- vrienden systeem
- feed
- orders

---

### Fase 3
- aanbevelingen
- notificaties
- barcode scanning
- externe integraties

---

## 13. Belangrijke ontwerpregels

### Niet doen
- arrays in user tabel opslaan
- meerdere artiesten als tekst opslaan
- frontend direct laten praten met BVL
- alles in één bestand bouwen

---

### Wel doen
- relationele database
- junction tables
- cache laag
- backend als centrale controlelaag
- duidelijke service scheiding (BVL vs BV)

---

## 14. Samenvatting

BeeVinyl bestaat uit:

- BVL: centrale vinyl catalogus (source of truth)
- BV Backend: logica + users + cache
- BV Frontend: UI

De backend:

- checkt cache
- haalt data uit BVL indien nodig
- slaat slim lokaal op
- beheert alle gebruikersfunctionaliteit

---

## 15. Kernzin

BeeVinyl gebruikt een backend als centrale laag die gebruikersdata beheert, caching toepast en alleen bij cache-miss data ophaalt uit de Beekn Vinyl Library (BVL).