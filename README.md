# Spill

**The world has tea. We spill it.**

Spill is an AI-powered newsletter platform. Readers discover and subscribe to public **Tea Rooms**. Administrators configure each Tea Room's content sections (**Sips**), generate source-backed issues (**Teas**) with LangGraph and Groq, review and approve them, then schedule email delivery.

## Repository layout

```text
apps/
  reader-web/   Public reader experience
  admin-web/    Admin Studio / Brew House
  api/          Express API and business modules
  worker/       Background job processors (generation and delivery)
packages/
  shared/       Shared types, schemas, constants
  config/       Shared tooling configuration
ai/
  src/          LangGraph workflows, tools, prompts, providers
infra/
  docker/       Local development services
  deployment/   Deployment notes and manifests
docs/           Architecture and product documentation
scripts/        Development and maintenance scripts
```

## Architecture principles

- Keep reader, admin, API, worker, and AI workflow responsibilities separate.
- Use MongoDB as the application system of record.
- Use Redis/BullMQ for asynchronous generation and email jobs.
- Run long-running LangGraph workflows in the worker, not in short-lived Vercel request handlers.
- Require explicit admin approval before a Tea can be sent.
- Keep secrets server-side and never expose provider keys to browser apps.
- Use shared schemas and validate all external input.

## Getting started

1. Install the required runtimes: Node.js LTS, npm, and Docker (for local MongoDB and Redis).
2. Copy `.env.example` to `.env` and fill in local values.
3. Review `PROJECT_SPEC.md` before implementation.
4. Add workspace/package configuration and application dependencies in the first development phase.
5. Start with the foundation phase: TypeScript configuration, linting, formatting, environment validation, database connection, logging, and health checks.

This repository is an initial scaffold. It intentionally does not include generated application code, credentials, or assumed third-party API access.

## Product vocabulary

| Conventional concept | Spill term |
|---|---|
| Newsletter channel | Tea Room |
| Newsletter issue | Tea |
| Newsletter section | Sip |
| Subscriber | Tea Lover |
| Admin workspace | Brew House |
| Admin assistant | Tea Concierge |
| Research sources | Receipts |
| Fact verification | Receipt Check |
| Generation | Brew |
| Regeneration | Rebrew |
| Review | Taste Test |
| Approval | Seal of Approval |
| Delivery | Serving |
| Archive | Tea Cellar |

## Product specification

See [`PROJECT_SPEC.md`](./PROJECT_SPEC.md) for the product requirements, technical architecture, workflows, data model, security requirements, development phases, and MVP acceptance criteria.
