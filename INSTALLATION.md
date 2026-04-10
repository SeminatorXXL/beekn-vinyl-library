# BVL Installation Guide

## Goal

This guide explains how to run Beekn Vinyl Library (BVL) on:

```text
bvl.beekn.nl
```

It assumes:

* the domain `beekn.nl` is managed in Strato
* the subdomain `bvl.beekn.nl` already exists
* BVL will run on a Linux server or VPS with a public IP
* PostgreSQL is available on that server or on another reachable server

Important:

* If you only have shared hosting and no VPS/server, this Node.js setup usually will not work well
* In that case, you need a VPS, cloud server, or another host that supports long-running Node.js apps

## Overview

The final setup looks like this:

```text
browser
  -> https://bvl.beekn.nl
  -> Nginx
  -> Node.js / Express app
  -> PostgreSQL
```

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

After saving, DNS propagation can take some time.

You can test it with:

```bash
nslookup bvl.beekn.nl
```

## 2. Prepare the Server

These steps assume Ubuntu 22.04 or 24.04.

Update the server:

```bash
sudo apt update
sudo apt upgrade -y
```

Install required packages:

```bash
sudo apt install -y nginx postgresql postgresql-contrib git curl
```

Install Node.js 20:

```bash
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

Recommended location:

```bash
sudo mkdir -p /var/www/bvl
sudo chown $USER:$USER /var/www/bvl
cd /var/www/bvl
```

Clone the project:

```bash
git clone https://github.com/SeminatorXXL/beekn-vinyl-library.git .
```

Install dependencies:

```bash
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

If you already created the schema earlier, you can skip that part.

## 5. Create the Environment File

Create `.env` in the project root:

```bash
nano /var/www/bvl/.env
```

Example:

```env
PORT=3000
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
* because Nginx will sit in front of Node, `TRUST_PROXY=true` is correct

## 6. Test BVL Locally on the Server

Start the app manually first:

```bash
npm run dev
```

In another terminal:

```bash
curl -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET" \
  "http://127.0.0.1:3000/catalog/search?q=Papercuts"
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
pm2 start src/server.js --name bvl
```

Save PM2 config:

```bash
pm2 save
pm2 startup
```

Run the command PM2 prints on screen so it starts automatically after reboot.

Useful PM2 commands:

```bash
pm2 status
pm2 logs bvl
pm2 restart bvl
pm2 stop bvl
```

## 8. Configure Nginx

Create an Nginx site config:

```bash
sudo nano /etc/nginx/sites-available/bvl.beekn.nl
```

Use this config:

```nginx
server {
    listen 80;
    server_name bvl.beekn.nl;

    location / {
        proxy_pass http://127.0.0.1:3000;
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

Enable it:

```bash
sudo ln -s /etc/nginx/sites-available/bvl.beekn.nl /etc/nginx/sites-enabled/bvl.beekn.nl
sudo nginx -t
sudo systemctl reload nginx
```

## 9. Enable HTTPS with Let's Encrypt

Install Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
```

Request the certificate:

```bash
sudo certbot --nginx -d bvl.beekn.nl
```

Follow the prompts and choose the option to redirect HTTP to HTTPS.

Test renewal:

```bash
sudo certbot renew --dry-run
```

## 10. Open the Firewall

If UFW is enabled:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## 11. Verify the Deployment

Check the API in the browser or terminal:

```bash
curl -i https://bvl.beekn.nl/catalog/search?q=Papercuts \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

Check CORS:

```bash
curl -i https://bvl.beekn.nl/catalog/search?q=Papercuts \
  -H "Origin: https://beevinyl.app" \
  -H "Authorization: Bearer CHANGE_THIS_TO_A_LONG_SECRET"
```

You should see:

```text
Access-Control-Allow-Origin: https://beevinyl.app
```

## 12. Updating BVL Later

To deploy updates:

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

Usually this means the Node app is not running.

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

Then restart BVL:

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
* use `pm2 logs bvl` and Nginx logs for debugging

Useful logs:

```bash
pm2 logs bvl
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```
