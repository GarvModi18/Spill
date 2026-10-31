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
