# Docker and deployment

## Local MongoDB and Redis

Run `docker compose -f infra/docker/compose.yaml up -d` for local MongoDB and Redis. Both ports bind to loopback and use named volumes. Set `MONGODB_URI=mongodb://localhost:27017/spill` and `REDIS_URL=redis://localhost:6379` in the local `.env` file. Stop services with `docker compose -f infra/docker/compose.yaml down`; add `-v` only when you intend to delete local database data.

## Container images

Build the persistent API or worker image from the repository root:

```sh
docker build -f infra/docker/Dockerfile.server --build-arg SERVICE=api -t spill-api:local .
docker build -f infra/docker/Dockerfile.server --build-arg SERVICE=worker -t spill-worker:local .
```

Build the Reader and Admin static sites separately. Set `VITE_API_URL` to the absolute versioned API URL at build time:

```sh
docker build -f infra/docker/Dockerfile.web --build-arg WEB_APP=reader-web --build-arg VITE_API_URL=https://api.example.com/api/v1 -t spill-reader:local .
docker build -f infra/docker/Dockerfile.web --build-arg WEB_APP=admin-web --build-arg VITE_API_URL=https://api.example.com/api/v1 -t spill-admin:local .
```

Pass runtime secrets through the deployment platform's secret store. API and worker require MongoDB and Redis; the worker also needs generation/email credentials. Use separate MongoDB, Redis, and provider credentials for staging and production. Deploy web images, API, and persistent worker as separate services. Configure HTTPS, exact `READER_WEB_URL`/`ADMIN_WEB_URL` origins, and `TRUST_PROXY_HOPS` for the actual ingress topology before exposing the API. Do not set trusted proxy hops by guesswork. `/health/ready` checks MongoDB and, when configured, Redis. The API rate limit is per process; use a gateway or shared limiter for a multi-replica deployment.

## Backups and recovery

Install MongoDB Database Tools (`mongodump`/`mongorestore`) on the backup runner, set `MONGODB_URI` from its secret store, then run `node scripts/backup-mongodb.mjs`. Set `BACKUP_DIR` to durable encrypted storage; the script creates compressed timestamped archives and never logs the connection string. Schedule backups daily and retain copies according to the organization's data-retention policy. Test recovery into an isolated database regularly with `mongorestore --uri "$RESTORE_MONGODB_URI" --gzip --archive=<archive-path>` and verify indexes and representative application records before promoting recovered data. Store a copy outside the primary database provider/account.

## Load check

Install k6 and run `k6 run -e API_BASE_URL=https://staging.example.com infra/load/api-smoke.js`. The script ramps to 30 virtual users, checks liveness/readiness and public Tea Room discovery, and sets thresholds for error rate and p95 latency. Run against staging, never production, unless an approved load window is in place.

Production readiness checks are operator-led: configure alerts from structured request/worker logs and readiness probes, validate provider webhooks, restore a backup in staging, and confirm deployment health checks before rollout. This repository does not deploy to a cloud account by itself.
