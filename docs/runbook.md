
# CommerceFlow PostgreSQL Runbook

## Purpose

Operational instructions for the local Docker environment.

This setup uses:
- Express API
- PostgreSQL
- Redis
- BullMQ background worker
- Transactional outbox
- Local signed payment simulator

This is not a live payment processing environment.

## Start

docker compose --env-file .env.docker up --build -d

## Status

docker compose --env-file .env.docker ps

## API Logs

docker compose --env-file .env.docker logs -f api

## Worker Logs

docker compose --env-file .env.docker logs -f worker

## Database Health

docker compose --env-file .env.docker exec postgres \
  pg_isready -U commerceflow_user -d commerceflow_db

## Redis Health

docker compose --env-file .env.docker exec redis redis-cli ping

## Integrity Inspection

docker compose --env-file .env.docker exec api \
  node scripts/operations/check-integrity.js

## Restart API Only

docker compose --env-file .env.docker restart api

## Restart Worker Only

docker compose --env-file .env.docker restart worker

## Stop Application

docker compose --env-file .env.docker stop

## Stop and Remove Containers

docker compose --env-file .env.docker down

Named database/Redis volumes are preserved by default.

## DANGER: Delete Volumes

Do not use `docker compose down -v` unless intentionally
deleting the local database and Redis volumes.

## PostgreSQL Backup

Run from the project root on the host:

mkdir -p artifacts/local/backups

docker compose --env-file .env.docker exec -T postgres \
  pg_dump -U commerceflow_user -d commerceflow_db \
  -Fc > artifacts/local/backups/commerceflow.dump

This is a local logical backup, not a complete backup strategy.

## PostgreSQL Restore

Restore only into an appropriate empty database after
stopping application writes and verifying the backup.

Never restore blindly over an actively used database.

## Incident: Redis Unavailable

Symptoms:
- Readiness check returns 503
- BullMQ processing stops
- Rate-limited routes may fail closed

Actions:
1. Check Redis service status.
2. Inspect Redis logs.
3. Restore Redis availability.
4. Verify API readiness.
5. Inspect pending outbox events and expired orders.

## Incident: PostgreSQL Unavailable

Symptoms:
- Readiness returns 503
- Business operations fail

Actions:
1. Check PostgreSQL health.
2. Inspect database logs and disk space.
3. Restore database availability.
4. Verify migrations and application readiness.
5. Run integrity inspection.

## Incident: Inventory Reconciliation Failure

Do not automatically alter stock quantities.

Investigate:
- Related orders and statuses
- Order items
- Inventory movement history
- Payment and refund state
- Pending worker activity

Correct through an audited process only.

## Incident: Payment Reconciliation Required

A late successful payment notification may represent
money already captured by an external provider.

Never assume rejecting a webhook refunds money.

Investigate with the provider and execute an appropriate
reconciliation/refund workflow before marking resolved.
