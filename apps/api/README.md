# Express API

Node.js/Express API for authentication, authorization, Tea Room management, subscriptions, issues, chat requests, and job submission. Keep long-running work out of request handlers.

## Authentication (Phase 2)

- `POST /api/v1/auth/register` creates a reader account. Registration rejects role fields.
- `POST /api/v1/auth/login` creates a server-side session.
- `POST /api/v1/auth/logout` revokes the current session.
- `GET /api/v1/users/me` returns the authenticated profile.
- `GET /api/v1/admin/me` demonstrates admin-only access.

Passwords are hashed with Node.js scrypt. Session cookies are HttpOnly, SameSite=Lax, Secure in production, and contain an opaque random token. MongoDB stores only its SHA-256 hash; expired sessions are removed with a TTL index. Authentication routes have an IP-based request limit, and credentialed CORS is restricted to the configured reader and admin web URLs.

Create the first admin account only through the explicit one-time command: set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env`, run `npm run bootstrap:admin -w @spill/api`, then remove those values. It refuses to change an existing account. Public signup cannot assign admin roles.

Email verification and password reset require an email provider and are not part of this authentication and permissions slice.

## Reader API (Phase 3)

- `GET /api/v1/tea-rooms` supports `search`, `category`, `topic`, `frequency`, `page`, and `limit`; it only lists public active rooms.
- `GET /api/v1/tea-rooms/:slug` returns public room details and Sip previews.
- `GET /api/v1/tea-rooms/:id/issues` returns published Teas with optional `search`, `from`, and `to` filters.
- `GET /api/v1/issues/:id` returns a published Tea and its Sips/Receipts.
- Authenticated readers can manage subscriptions via `POST`/`DELETE /api/v1/tea-rooms/:id/subscribe` and pause/resume endpoints.
- `GET /api/v1/users/me/subscriptions` and `/api/v1/users/me/dashboard` return the reader’s rooms, recent Teas, and scheduled Teas.
- `PATCH /api/v1/users/me` updates the reader name and email delivery preferences; email address changes are not accepted.

## Tea Concierge (Phase 5)

The admin-only `/api/v1/admin/concierge` routes create and list conversation sessions, return a user's conversation, accept messages, and confirm or dismiss a pending configuration proposal. Tea Concierge can propose Tea Room and Sip create/update/duplicate/delete operations. The API validates each proposal, shows a structured preview, and writes it through the existing `AdminStore` only after explicit confirmation. Proposal claims are atomic so a confirmation cannot be applied twice.

`GROQ_API_KEY` and `GROQ_MODEL` enable structured response drafting. Without both values, saved conversations remain available and message requests return `503`. MongoDB stores the conversation messages and pending proposal; a MongoDB-backed LangGraph checkpointer stores graph state. The Concierge does not generate issues, approve content, schedule delivery, or send email.
