# Reader Web

Public-facing React application for discovering Tea Rooms, subscribing, reading Teas, and managing reader accounts.

## Development

Run `npm run dev:api` in one terminal and `npm run dev -w @spill/reader-web` in another. Vite serves the reader at `http://localhost:5173` and proxies `/api` calls to the API at `http://localhost:4000`. MongoDB must be available to the API. Set `VITE_API_URL` at build time when the API is deployed separately.

Phase 3 includes public discovery and Tea Room pages, searchable publication archives, published Tea reading, signup/sign-in, subscriptions with pause/resume, the My Teas dashboard, and profile delivery preferences. Admin Tea Room setup and issue generation are implemented in later phases.
