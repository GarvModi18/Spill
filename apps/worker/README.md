# Background Worker

# Background Worker

The worker is a separate Node process that consumes BullMQ queues using Redis.

It scans active Tea Room schedules in each room's IANA timezone, creates one generation job per room and cycle, generates issues through the shared LangGraph workflow, marks missed review deadlines, and queues approved issues at their scheduled delivery time. Delivery is gated on a persisted approval timestamp and a scheduled issue state.

Email is sent through the shared `EmailSender` interface (currently Resend). The worker targets active subscribers with verified email addresses and enabled Tea Room updates, then excludes globally suppressed addresses. Each issue and recipient has a unique delivery record and stable provider idempotency key, so retries skip successful sends. Messages include HTML and plain-text versions and a signed, room-scoped unsubscribe link.

Configure `MONGODB_URI`, `REDIS_URL`, `API_URL`, `READER_WEB_URL`, `UNSUBSCRIBE_SECRET`, `RESEND_API_KEY`, and `EMAIL_FROM`. Generation additionally needs `GROQ_API_KEY` and `GROQ_MODEL`. Configure the Resend webhook to `POST /api/v1/webhooks/resend` and set `RESEND_WEBHOOK_SECRET`; signed events update delivery records and suppress bounced or complained addresses. Start with `npm run dev -w @spill/worker` or build and run with `npm run build -w @spill/worker` and `npm run start -w @spill/worker`.
