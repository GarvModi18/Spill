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

## Phase 6 implementation record

Phase 6 adds bounded research providers for GitHub, Hacker News, Hugging Face, RSS feeds, and Tavily web search; normalizes results into unverified Receipts; and exposes an admin-only Sip research endpoint. Research runs, provider failures, and receipt evidence are persisted in MongoDB with lookup indexes. RSS fetches reject unsafe and non-public destinations, and provider responses and snippets are size-limited. External-provider credentials are optional and supplied through validated environment configuration.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 7 implementation record

Phase 7 adds a checkpointed LangGraph generation workflow with bounded per-Sip parallelism, configured research retrieval, structured Groq output, evidence URL checks, item-count and support quality checks, one bounded model retry, and partial issue completion when a Sip fails. Issues and Sip results are persisted with model/prompt versions, retry counts, quality findings, and source Receipts. Admins can trigger a brew for an active Tea Room from the Admin Studio and see the review status and per-Sip findings. Issue editing, approval, and targeted regeneration are Phase 8 work.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

## Phase 8 implementation record

Phase 8 adds an admin issue review workspace with issue filtering, web/email-style previews, editable Sip titles and content, version history, source Receipt inspection, and reasoned rejection or approval. Edits require the expected version to prevent stale writes. Approval is blocked for issues with failed or empty Sips; approvals, rejections, and edits are written to the audit log. Delivery scheduling remains Phase 9 work.

## Phase 9 implementation record

Phase 9 adds a dedicated BullMQ worker for timezone-aware Tea Room generation and delivery schedules, review-deadline monitoring with admin notifications, and an admin schedule/reschedule/cancel flow for approved issues. Delivery requires explicit approval and a scheduled issue state. The Resend adapter sends responsive HTML and plain-text messages to active, verified subscribers with Tea Room updates enabled, uses provider idempotency keys and per-recipient delivery records for retry safety, and honors unsubscribe and bounce/complaint suppression. Signed Resend webhooks update sent, delivered, bounced, complained, and failed records. Configure Redis, the worker environment, `RESEND_API_KEY`, `EMAIL_FROM`, `UNSUBSCRIBE_SECRET`, and `RESEND_WEBHOOK_SECRET` to run the full flow. Tests cover timezone calculations, safe email rendering, signed unsubscribe links, and signed webhook handling.

Validation commands: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.

Complete and verify one phase at a time. See `PROJECT_SPEC.md` for phase details and acceptance criteria.
