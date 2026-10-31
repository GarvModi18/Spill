# Architecture

See [`../PROJECT_SPEC.md`](../PROJECT_SPEC.md) for the full architecture and product requirements.

## Runtime boundaries

- Reader and Admin are separate React applications.
- Express API handles authenticated request/response operations.
- Worker consumes durable background jobs from BullMQ.
- LangGraph workflows execute in the worker and persist progress.
- MongoDB stores product entities and audit history.
- Redis supports queues, retries, and scheduling.

## Key workflow boundaries

1. Configuration workflow: Tea Concierge proposes structured changes; authorized backend services persist them only after admin confirmation.
2. Generation workflow: research, normalize evidence, verify, generate, evaluate, and save each Sip.
3. Delivery workflow: only approved issues can be queued for subscriber delivery.
