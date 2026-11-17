
# CommerceFlow Local Docker Deployment

## Prerequisites

- Docker Engine or Docker Desktop
- Docker Compose v2
- Available port 5000

## Setup

1. Copy .env.docker.example to .env.docker.
2. Generate JWT and webhook secrets.
3. Set matching PostgreSQL credentials.
4. Start Docker Compose.

## Start

docker compose --env-file .env.docker up --build -d

## Verify

docker compose --env-file .env.docker ps

curl http://127.0.0.1:5000/health/live
curl http://127.0.0.1:5000/health/ready

## Database Integrity

docker compose --env-file .env.docker exec api \
  node scripts/operations/check-integrity.js

## Access

Local API:
http://127.0.0.1:5000/api/v1

Local-only development payment simulator:
http://127.0.0.1:5000/api/v1/payments/webhooks/demo

## Stop

docker compose --env-file .env.docker stop

## Limitations

This is a local development deployment.

The payment simulator is not a real payment gateway.
Do not expose this development setup to the public internet.

For a real production deployment, use externally managed
secrets, TLS, production database configuration, a real
payment provider, backups, observability and security review.
