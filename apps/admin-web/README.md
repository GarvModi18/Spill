# Admin Web — Brew House

Admin application for managing Tea Rooms and Sips, using Tea Concierge, reviewing issues, approving content, and scheduling delivery.

## Development

Run `npm run dev:api` and `npm run dev:admin` in separate terminals. Vite serves the Admin Studio at `http://localhost:5174` and proxies API requests to `http://localhost:4000`. Sign in with an admin provisioned using the Phase 2 `bootstrap:admin` command. Phase 4 currently provides the dashboard, Tea Room configuration, schedules, status controls, and dynamic Sip builder.
