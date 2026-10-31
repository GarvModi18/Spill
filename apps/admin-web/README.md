# Admin Web — Brew House

Admin application for managing Tea Rooms and Sips and working with the Tea Concierge.

## Development

Run `npm run dev:api` and `npm run dev:admin` in separate terminals. Vite serves the Admin Studio at `http://localhost:5174` and proxies API requests to `http://localhost:4000`. Sign in with an admin provisioned using the Phase 2 `bootstrap:admin` command. The Studio provides the dashboard, Tea Room configuration, schedules, status controls, dynamic Sip builder, and a Tea Concierge chat for confirmed configuration changes.

Set `GROQ_API_KEY` and `GROQ_MODEL` in the API environment to enable Concierge responses. Conversation records and LangGraph checkpoints are stored in MongoDB. The API can still serve saved conversations without Groq configured; it returns a configuration notice when a new response is requested.
