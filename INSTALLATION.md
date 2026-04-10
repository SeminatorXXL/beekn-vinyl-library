# BVL Installation Guide

## Goal

This guide explains how to run Beekn Vinyl Library (BVL) on:

```text
bvl.beekn.nl
```

It assumes:

* the domain `beekn.nl` is managed in Strato
* the subdomain `bvl.beekn.nl` already exists
* BVL will run on a Linux VPS or server with a public IP
* PostgreSQL is available on that server or on another reachable server

Important:

* if you only have shared hosting and no VPS, this Node.js setup is not the right fit
* in that case you need a VPS or another host that supports long-running Node.js processes

## Recommended Server Size

For BVL with Node.js, PostgreSQL, Nginx, and PM2 on the same VPS:

* `VC 1-1`: not recommended
* `VC 1-2`: okay for experiments only
* `VC 2-4`: recommended minimum for production

## Final Setup

```text
browser
  -> https://bvl.beekn.nl
  -> Nginx
  -> Node.js / Express app on 127.0.0.1:3001
  -> PostgreSQL
```

Using port `3001` internally keeps port planning simple and matches the recommended local development setup.

BVL serves a vinyl-only catalog and supports album, track, and artist endpoints.

## 1. Point the Subdomain to Your Server

In Strato DNS settings for `beekn.nl`:

1. Open the DNS settings for the subdomain `bvl`
2. Create or edit an `A` record
3. Point it to the public IPv4 address of your server

Example:

```text
Host: bvl
Type: A
Value: YOUR_SERVER_IP
TTL: default
```

If your server also has IPv6, add an `AAAA` record too.

Test later with:

```bash
nslookup bvl.beekn.nl
```

## 2. Prepare the Server

These steps assume Ubuntu 22.04 or 24.04.

```bash
sudo apt update
sudo apt upgrade -y
sudo apt install -y nginx postgresql postgresql-contrib git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

Verify:

```bash
node -v
npm -v
psql --version
nginx -v
```

## 3. Create the Project Folder

```bash
sudo mkdir -p /var/www/bvl
sudo chown $USER:$USER /var/www/bvl
cd /var/www/bvl
git clone https://github.com/SeminatorXXL/beekn-vinyl-library.git .
npm install
```

## 4. Create the Database

Open PostgreSQL:

```bash
sudo -u postgres psql
```

Create database and user:

```sql
CREATE DATABASE bvl;
CREATE USER bvl_user WITH ENCRYPTED PASSWORD 'CHANGE_THIS_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE bvl TO bvl_user;
\c bvl
GRANT ALL ON SCHEMA public TO bvl_user;
```

Then run the BVL schema SQL in the `bvl` database.

If you are upgrading an existing BVL database instead of creating a fresh one, also run:

```bash
psql "$DATABASE_URL" -f sql/002_artist_profile_cache.sql
```

## 5. Create the Environment File

Create `.env` in the project root:

```bash
nano /var/www/bvl/.env
```

Example:

```env
PORT=3001
DATABASE_URL=postgresql://bvl_user:CHANGE_THIS_PASSWORD@localhost:5432/bvl
DISCOGS_TOKEN=YOUR_DISCOGS_TOKEN
INTERNAL_API_KEY=CHANGE_THIS_TO_A_LONG_SECRET
ALLOWED_ORIGINS=https://beevinyl.app,https://beekn.nl,https://www.beekn.nl
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
TRUST_PROXY=true
```

Notes:

* use your real Discogs token
* choose a strong internal API key
* include every frontend origin that should be allowed by CORS
* because Nginx sits in front of Node, `TRUST_PROXY=true` is correct
* `.env` is loaded automatically by `dotenv`

## 6. Test BVL Locally on the Server

Start the app manually first:

```bash
npm run dev
```

In another terminal:

```bash
curl -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET" \
  "http://127.0.0.1:3001/catalog/albums/search?q=Papercuts"
```

If this works, stop the dev process and continue.

## 7. Run BVL in the Background with PM2

Install PM2:

```bash
sudo npm install -g pm2
```

Start the app:

```bash
cd /var/www/bvl
pm2 start npm --name bvl -- start
```

Save PM2 config:

```bash
pm2 save
pm2 startup
```

Run the command PM2 prints on screen so it starts automatically after reboot.

Useful commands:

```bash
pm2 status
pm2 logs bvl
pm2 restart bvl
pm2 stop bvl
```

## 8. Configure Nginx

Create the Nginx site config:

```bash
sudo nano /etc/nginx/sites-available/bvl.beekn.nl
```

Use:

```nginx
server {
    listen 80;
    server_name bvl.beekn.nl;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/bvl.beekn.nl /etc/nginx/sites-enabled/bvl.beekn.nl
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Enable HTTPS with Let's Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d bvl.beekn.nl
sudo certbot renew --dry-run
```

Choose the option to redirect HTTP to HTTPS.

## 10. Open the Firewall

If UFW is enabled:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 11. Verify the Deployment

Basic API check:

```bash
curl -i https://bvl.beekn.nl/catalog/albums/search?q=Papercuts \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

```bash
curl -i https://bvl.beekn.nl/catalog/albums/1 \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

```bash
curl -i https://bvl.beekn.nl/catalog/tracks/search?q=Crawling \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

```bash
curl -i https://bvl.beekn.nl/catalog/tracks/1 \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

```bash
curl -i https://bvl.beekn.nl/catalog/artists/search?q=Linkin%20Park \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

```bash
curl -i https://bvl.beekn.nl/catalog/artists/1 \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

CORS check:

```bash
curl -i https://bvl.beekn.nl/catalog/albums/search?q=Papercuts \
  -H "Origin: https://beevinyl.app" \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

You should see:

```text
Access-Control-Allow-Origin: https://www.beevinyl.app
```

## 12. Updating BVL Later

```bash
cd /var/www/bvl
git pull
npm install
pm2 restart bvl
```

## 13. Troubleshooting

### DNS does not resolve

Check the Strato DNS record and wait for propagation.

### Nginx shows 502 Bad Gateway

Usually the Node app is not running.

Check:

```bash
pm2 status
pm2 logs bvl
```

### API returns 401 Unauthorized

Your `Authorization` header does not match `INTERNAL_API_KEY`.

Expected format:

```http
Authorization: Bearer YOUR_INTERNAL_API_KEY
```

### CORS error in browser

Make sure the frontend domain is listed in:

```env
ALLOWED_ORIGINS=...
```

Then restart:

```bash
pm2 restart bvl
```

### Rate limit triggers too quickly

Increase:

```env
API_RATE_LIMIT_WINDOW_MS=1000
API_RATE_LIMIT_MAX_REQUESTS=10
```

Then restart:

```bash
pm2 restart bvl
```

## 14. Recommended Production Notes

* keep `.env` private
* never commit secrets
* rotate the Discogs token if it has been shared
* back up PostgreSQL regularly
* use PM2 and Nginx logs for debugging

Useful logs:

```bash
pm2 logs bvl
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```
