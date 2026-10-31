# Development Phases

1. Foundation and monorepo tooling.
2. Authentication and role-based access control.
3. Reader App.
4. Admin Studio and dynamic Sip builder.
5. Tea Concierge configuration graph.
6. Research integrations and evidence model.
7. LangGraph generation workflow.
8. Issue editor, versioning, and approval.
9. Scheduling, email delivery, and webhooks.
10. Security hardening, testing, monitoring, and deployment.

## Phase 1 implementation record

Phase 1 establishes the npm workspace, shared TypeScript settings, lint and format configuration, validated server environment, shared Tea Room and Sip schemas, structured JSON logger, MongoDB connection helper, API liveness/readiness endpoints, and GitHub Actions CI. The API package is the first runnable service; reader, admin, and worker remain feature scaffolds for later phases.

Validation commands: `npm ci`, `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 2 implementation record

Phase 2 adds reader registration and login, scrypt password hashing, random hashed server-side sessions, logout revocation, expiring-session indexes, protected profile routes, admin role checks, and an explicit one-time CLI for provisioning the first admin. Public registration cannot assign roles. Credentialed CORS is restricted to the reader/admin origins and authentication attempts are rate limited. Email verification and password reset remain dependent on the later email integration phase.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 3 implementation record

Phase 3 delivers the React Reader App and reader API for public Tea Room discovery/search, Tea Room details and Sip previews, publication archives/date filters, published Tea reading with Receipts, reader dashboard, subscriptions with pause/resume, and editable profile delivery preferences. Public content queries only return active public rooms and published issues; dashboard upcoming Teas are limited to scheduled issues. Reader routes use the Phase 2 session/role services. The API creates unique subscription and publication lookup indexes.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 4 implementation record

Phase 4 delivers the admin-only Brew House dashboard, Tea Room management, schedule and research defaults, public preview links, and a configurable Sip builder with create, edit, duplicate, delete, and reorder actions. The API validates schedules and time zones, requires at least one Sip before activation, enforces Tea Room status transitions, and records configuration changes in the audit log. Admin routes use the Phase 2 session and role checks. Issue editing and delivery remain later phases.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 5 implementation record

Phase 5 adds the Tea Concierge configuration graph, structured Groq adapter, MongoDB conversation sessions and graph checkpoints, admin-only message APIs, and the Admin Studio chat UI. The graph can propose Tea Room and Sip creation, updates, duplication, and removal. Shared schemas validate proposals; the API displays a field-level preview and applies configuration only after an authenticated admin confirms. Proposal claims prevent duplicate confirmation writes. Issue generation, approval, scheduling, and delivery remain later phases. Live responses require `GROQ_API_KEY` and `GROQ_MODEL`; automated tests use mock models.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Complete and verify one phase at a time. See `PROJECT_SPEC.md` for phase details and acceptance criteria.
