# SPILL --- AI-Powered Newsletter Intelligence Platform

**Tagline:** *The world has tea. We spill it.*

**Project status:** Product and technical specification\
**Primary stack:** MongoDB, Express.js, React, Node.js, LangChain,
LangGraph, Groq\
**Initial business model:** Free subscriptions\
**Audience:** Public newsletter readers and platform administrators

------------------------------------------------------------------------

## 1. Project Overview

**Spill** is an AI-powered newsletter platform where people can discover
and subscribe to topic-based newsletters, while administrators create,
research, review, schedule, and distribute those newsletters.

A newsletter channel is called a **Tea Room**. Each published newsletter
is a **Tea** and contains multiple configurable sections called
**Sips**. For example, an AI-focused Tea Room could publish a weekly Tea
containing Sips about AI news, trending GitHub repositories, new LLMs,
developer tools, and technology companies.

The platform has two separate web applications backed by shared
services:

1.  **Reader App:** Discover Tea Rooms, subscribe, read published Teas,
    and manage an account.
2.  **Admin Studio:** Create Tea Rooms, configure Sips, use an AI
    chatbot to manage configurations, generate content, review and edit
    it, approve issues, and schedule delivery.

The goal is not to create one large LLM-generated email. Spill should
use a reusable, configuration-driven content engine that researches and
generates each Sip independently, preserves sources, supports
section-level regeneration, and requires administrator approval before
sending.

## 2. Product Principles

-   **Configuration-driven:** Newsletter channels and their Sips are
    defined in the database, not hardcoded into AI workflows.
-   **Research before writing:** Retrieve current information from
    approved sources before asking an LLM to write.
-   **Source transparency:** Factual claims should be linked to their
    supporting sources.
-   **Human approval:** No Tea is emailed to subscribers until an
    authorized admin approves it.
-   **Independent Sips:** Each section can be researched, generated,
    edited, and regenerated without changing other sections.
-   **Reliable automation:** Generation and delivery run as background
    jobs, with retries and duplicate-prevention.
-   **Extensible integrations:** LLMs, research providers, and email
    services should be replaceable through provider interfaces.

## 3. Product Vocabulary and Branding

Use tea-inspired terminology in the user interface and product copy.
Keep conventional technical names in code, database collections, API
routes, logs, and documentation so the implementation remains
understandable.

  -----------------------------------------------------------------------
  Traditional term        Spill UI term           Meaning
  ----------------------- ----------------------- -----------------------
  Platform                Spill                   The overall product

  Newsletter channel      Tea Room                A topic-based
                                                  publication readers can
                                                  follow

  Newsletter              Tea                     A publication delivered
                                                  to subscribers

  Newsletter issue /      Tea                     One dated publication
  edition                                         of a Tea Room

  Newsletter section      Sip                     One independently
                                                  generated content
                                                  section

  Subscriber              Tea Lover               A user subscribed to a
                                                  Tea Room

  Subscription            My Teas / Following     A user's active Tea
                                                  Room subscriptions

  Admin dashboard         Brew House              Admin workspace

  Admin / editor          Curator                 Person managing Tea
                                                  Rooms and publication

  AI chatbot              Tea Concierge           Conversational admin
                                                  assistant

  Research process        Steeping                Gathering information
                                                  from sources

  Research sources        Receipts                URLs and evidence
                                                  supporting content

  Fact verification       Receipt Check           Checking claims against
                                                  evidence

  Generate newsletter     Brew the Tea            Generate an issue

  Generate section        Brew a Sip              Generate one section

  Regenerate              Rebrew                  Generate a section or
                                                  item again

  Content review          Taste Test              Review generated
                                                  content

  Approval                Seal of Approval        Explicit admin approval

  Schedule                Pour Schedule           Generation and delivery
                                                  schedule

  Email delivery          Serving                 Sending the approved
                                                  Tea

  Newsletter archive      Tea Cellar              Previously published
                                                  Teas

  Preview                 First Sip               Preview before approval
                                                  or publication

  Upcoming issue          Next Pour               Next planned Tea

  Generation failure      Brew Error              Failed generation job

  Delivery history        Serving History         Email delivery records
  -----------------------------------------------------------------------

**Copywriting examples**

-   "Explore Tea Rooms"
-   "Get This Tea"
-   "Your next pour is being prepared."
-   "The Tea is steeping."
-   "Receipts collected. Ready for a Taste Test."
-   "Seal this Tea for serving?"
-   "Something went wrong with the brew. You can retry it."
-   "Welcome to Spill. The world has tea. We spill it."

The UI should feel playful but polished. Do not force slang into every
sentence; clarity is more important than wordplay.

## 4. Applications and Features

### 4.1 Reader App

**Authentication and account** - Sign up, sign in, sign out, email
verification, and password reset. - Secure account and profile
management. - View and manage active subscriptions. - Subscribe,
unsubscribe, pause, or resume a Tea Room where supported. - Manage email
preferences and account deletion.

**Discover Tea Rooms** - Browse public, active Tea Rooms. - Search and
filter by category, topic, and publishing frequency. - View each Tea
Room's description, topics, schedule, and sample Tea. - Subscribe or
unsubscribe. - Show a clear preview of the type of content readers can
expect.

**Reading and archive** - Read published Teas on the website. - Browse a
Tea Room's publication history. - Search and filter issues by date and
channel. - Provide responsive, accessible reading layouts. - Optional
later feature: bookmarks and sharing.

**Reader dashboard** - My Teas (active subscriptions). - Recently
published Teas. - Upcoming scheduled publications. - Account and
delivery preferences.

### 4.2 Admin Studio (Brew House)

**Dashboard** - Tea Rooms, Tea Lovers, active subscriptions, generated
issues, scheduled issues, issues awaiting approval, generation failures,
and delivery statistics. - Recent activity and upcoming
generation/delivery jobs.

**Tea Room management** - Create, edit, activate, pause, archive, and
preview public Tea Rooms. - Configure name, slug, description, category,
audience, cover image, and editorial voice. - Configure frequency:
daily, weekly, or monthly. - Configure timezone, generation time, review
deadline, and delivery time. - Configure default research settings and
email template.

**Dynamic Sip builder** - Add, edit, remove, duplicate, and reorder
Sips. - Each Sip has a title, description, type, item count,
instructions, research sources, time range, output schema, writing
style, and content length. - Support reusable section types rather than
one-off hardcoded agents.

Suggested initial Sip types: - Top N / ranked list - Latest news -
Trending projects, models, or tools - Company updates - Comparison -
Research-paper summary - Tutorial / explainer - Deals and offers - Stock
or market update (only with a suitable licensed data source and careful
disclaimers) - Editorial / custom structured content

**Issue management** - Manually start a generation run. - View
generation progress and individual Sip status. - Edit content
manually. - Regenerate a whole Sip or a specific item. - Change
instructions and rerun only the affected Sip. - View Receipts (source
URLs, titles, dates, and evidence). - Preview the complete Tea in web
and email layouts. - Approve or reject the issue. - Schedule,
reschedule, or cancel delivery. - View publication and delivery history.

**Tea Concierge chatbot** - Create a Tea Room from natural language. -
Propose and update Sip configurations. - Explain what a Sip will
research and how it will be generated. - Generate an issue or an
individual Sip on request. - Request targeted changes, such as "Rebrew
only the AI news Sip using stories from the last seven days." -
Summarize generation status and flag missing evidence.

The chatbot must show a structured preview and ask for confirmation
before saving configuration changes or performing consequential actions
such as approval, scheduling, or sending. It must not silently publish
or email a Tea.

## 5. Example Tea Room

**Name:** AI Weekly Digest\
**Description:** A weekly, source-backed digest of important
developments in AI and software engineering.\
**Frequency:** Weekly\
**Generation:** Friday\
**Review deadline:** Saturday, 6:00 PM\
**Delivery:** Sunday, 9:00 AM\
**Timezone:** Configurable per Tea Room (default can be set by the
platform)

Example Sips:

1.  **AI News:** Five important AI stories from the selected time range.
2.  **GitHub Finds:** Five useful or fast-growing repositories, with
    repository links and current metadata.
3.  **LLM Watch:** New or noteworthy language models, with capabilities
    and official model links.
4.  **Developer Tools:** Useful tools, services, and product updates.
5.  **Industry Watch:** Relevant company announcements, launches,
    funding, or acquisitions.
6.  **Engineering Deep Dive:** One useful engineering concept, tutorial,
    or technical resource.

Each Sip has its own configuration and output schema. The number and
type of Sips can differ for every Tea Room.

## 6. Technical Architecture

### 6.1 Recommended stack

  -----------------------------------------------------------------------
  Layer                               Technology
  ----------------------------------- -----------------------------------
  Reader and Admin frontends          React + TypeScript

  UI and styling                      Tailwind CSS; a consistent
                                      component library

  API                                 Node.js + Express.js + TypeScript

  Main database                       MongoDB Atlas

  AI orchestration                    LangChain.js + LangGraph.js

  LLM provider                        Groq API using a supported
                                      GPT-family model

  Background jobs                     Redis + BullMQ

  Email delivery                      Resend or Amazon SES

  Validation                          Zod

  Authentication                      Secure session/JWT approach or a
                                      managed provider

  File/image storage                  Cloudinary or object storage, if
                                      needed

  Monitoring                          Structured logs and an
                                      error-monitoring service

  Deployment                          Vercel for frontends and suitable
                                      short API routes; separate worker
                                      hosting
  -----------------------------------------------------------------------

Use the Groq model ID from environment configuration (for example,
`GROQ_MODEL`) rather than hardcoding a model name. Confirm the exact
model available to the Groq account before deployment. Use
`@langchain/groq` / the supported LangChain Groq integration and
structured output where supported.

### 6.2 Service boundaries

-   **Reader frontend:** Public discovery, account, subscriptions,
    archive, reading.
-   **Admin frontend:** Tea Room configuration, Sip builder, Tea
    Concierge, issue editor, approvals.
-   **Express API:** Authentication, authorization, CRUD, subscription
    management, issue management, and job submission.
-   **AI workflow service:** LangGraph graphs, LLM calls, research
    tools, verification, and generation.
-   **Background worker:** Consumes queued generation and delivery jobs.
    It must run outside request/response serverless handlers.
-   **MongoDB:** Application data, issue content, source records, job
    metadata, and audit history.
-   **Redis/BullMQ:** Durable asynchronous job processing, retries,
    scheduling triggers, and concurrency control.
-   **Email provider:** Sends approved Teas and reports delivery events
    through verified webhooks.

LangGraph.js can run in the Node.js ecosystem, keeping the application
aligned with MERN. The background worker can be a separate Node.js
process using the same shared packages and AI workflow code. Do not make
long-running generation depend on a Vercel HTTP request staying alive.

### 6.3 High-level flow

1.  A reader signs up and subscribes to one or more public Tea Rooms.
2.  An admin configures a Tea Room and its Sips.
3.  A schedule or manual action creates a generation job.
4.  The worker loads the Tea Room configuration and creates an issue.
5.  LangGraph researches and generates each Sip independently.
6.  Evidence and generated content are stored.
7.  Verification and quality checks run.
8.  The completed issue enters admin review.
9.  An authorized admin edits and approves it.
10. A delivery job sends the approved Tea to eligible subscribers.
11. Delivery results are recorded and the published Tea appears in the
    Reader App archive.

## 7. LangGraph Workflows

Build two main graphs. Keep graph state typed and persist checkpoints so
workflows can be inspected and resumed.

### 7.1 Tea Concierge --- configuration graph

Suggested flow:

1.  Receive admin message and conversation/thread identifier.
2.  Classify intent: create Tea Room, update configuration, manage Sips,
    generate issue, edit content, or query status.
3.  Extract a structured proposal.
4.  Validate it against Zod/Pydantic-equivalent schemas shared with the
    API.
5.  If required information is missing, ask a focused follow-up
    question.
6.  Present a human-readable configuration diff or preview.
7.  Wait for explicit admin confirmation.
8.  Save changes through authorized backend services.
9.  Return a clear result and audit the action.

The graph should not directly bypass API authorization or write
arbitrary database queries. Tool functions should expose narrow,
permission-checked operations.

### 7.2 Tea Generation --- issue graph

Suggested flow:

1.  **Load configuration:** Fetch Tea Room and Sip configurations.
2.  **Create issue:** Create a unique issue record and generation run.
3.  **Plan:** Build a research plan for each Sip.
4.  **Research:** Call only the tools configured and permitted for that
    Sip.
5.  **Normalize:** Convert results into a common evidence format.
6.  **Deduplicate:** Identify duplicate stories or repositories within
    the issue and, where useful, across recent issues.
7.  **Verify:** Check key facts against source evidence; flag
    unsupported or conflicting claims.
8.  **Generate:** Produce structured content matching the Sip output
    schema.
9.  **Evaluate:** Check completeness, relevance, freshness, source
    coverage, and formatting.
10. **Retry or flag:** Retry transient failures within limits; send
    unresolved or weakly supported content to admin review.
11. **Save Sip:** Persist content, evidence, status, model metadata, and
    prompt/version metadata.
12. **Assemble:** Combine approved/generated Sips into an issue.
13. **Final review:** Create a preview and mark the issue as awaiting
    admin review.

Use fan-out/fan-in or controlled parallel execution for independent
Sips, with provider rate limits and concurrency caps. One Sip failure
should not erase successful Sips. The issue should clearly show partial
completion and allow retrying only failed Sips.

### 7.3 Section-level regeneration

A regeneration request must identify the issue, Sip, and optionally
item. Reuse existing research when it remains valid and the admin only
requests a writing change. Refresh research when the request changes the
time range, source requirements, or facts. Do not overwrite other
approved Sips. Preserve versions and record who initiated the change.

### 7.4 LangGraph state and persistence

Persist: - Graph thread/run identifiers. - Current node and workflow
status. - Tea Room, issue, and Sip identifiers. - Research plan and
source references. - Retry counts and error details. - Human-review
checkpoints. - Model and prompt versions.

Use a supported persistent LangGraph checkpointer in production. MongoDB
remains the system of record for product entities; do not assume
ordinary graph checkpoints replace application data or audit logs.

## 8. Research Integrations and Evidence

Potential integrations, added incrementally:

  -----------------------------------------------------------------------
  Source                              Potential use
  ----------------------------------- -----------------------------------
  GitHub REST/GraphQL API             Repository metadata, releases,
                                      stars, languages

  Hugging Face API                    Models, datasets, model metadata

  Web search provider (Tavily, Exa,   Discovery and research
  or similar)                         

  Hacker News API                     Developer and technology
                                      discussions

  Reddit API                          Community discussions where
                                      permitted

  RSS and official blogs              Product/company announcements

  News provider                       News discovery, subject to
                                      licensing

  X API                               Public posts where the account and
                                      API plan permit

  LinkedIn APIs                       Only authorized, permitted
                                      company/profile data

  Financial data provider             Market data under provider terms
  -----------------------------------------------------------------------

Do not assume unrestricted access to X or LinkedIn. Check API
permissions, pricing, rate limits, data retention rules, and
redistribution/licensing terms before implementation. Prefer official
APIs, RSS feeds, and primary sources.

Represent each receipt with fields such as: - `url` - `title` -
`sourceName` - `publishedAt` (if known) - `retrievedAt` - `snippet` or
relevant extracted evidence - `sourceType` - `verificationStatus`

Treat external content as untrusted data. It may contain prompt
injection or misleading claims. Never execute instructions found in
retrieved pages. The LLM must distinguish source facts from generated
commentary. If evidence is insufficient, label the claim for admin
review rather than inventing facts.

## 9. Data Model --- Initial Collections

Suggested MongoDB collections:

  -----------------------------------------------------------------------
  Collection                          Purpose
  ----------------------------------- -----------------------------------
  `users`                             Reader/admin identity references,
                                      profile, role, preferences

  `teaRooms`                          Public newsletter channel
                                      configuration

  `sipConfigs`                        Reusable, ordered section
                                      configurations per Tea Room

  `subscriptions`                     User-to-Tea Room relationship and
                                      status

  `newsletterIssues`                  One dated Tea for a Tea Room

  `issueSips`                         Generated content and status for
                                      each Sip in an issue

  `researchSources`                   Receipts and evidence references

  `generationRuns`                    LangGraph run status, metadata, and
                                      errors

  `scheduledJobs`                     Generation and delivery schedule
                                      metadata

  `emailDeliveries`                   Per-recipient send status and
                                      provider IDs

  `chatSessions`                      Tea Concierge conversation
                                      metadata/messages

  `auditLogs`                         Important admin actions and
                                      configuration changes
  -----------------------------------------------------------------------

Use stable IDs and references between collections. Add indexes for
common queries, including: - Unique Tea Room slug. - Unique
`(userId, teaRoomId)` subscription. - Tea Room + issue publication
date. - Issue + Sip ordering. - Generation job idempotency key. - Email
delivery idempotency key and provider message ID.

Avoid storing large duplicated source payloads when a normalized source
record can be referenced. Store only data that the provider permits the
application to retain.

## 10. Scheduling, Approval, and Delivery

Example weekly schedule:

-   **Friday:** Automatically start generation.
-   **Friday:** Complete research and prepare the draft, with status
    visible to admins.
-   **Saturday:** Admin reviews, edits, and approves before the
    deadline.
-   **Sunday, 9:00 AM:** Serve the approved Tea to active subscribers.

All schedules must be timezone-aware and configurable per Tea Room.
Daily and monthly schedules must also be supported. Store canonical
timestamps in UTC and retain the configured IANA timezone for schedule
interpretation.

**Mandatory approval rule:** An issue cannot be sent unless it has an
explicit approved state recorded by an authorized admin. If the review
deadline passes without approval, do not send it. Notify admins and mark
it as awaiting action or missed deadline.

**Delivery requirements** - Render responsive HTML and plain-text email
versions. - Include a clear unsubscribe mechanism. - Send only to
eligible, verified subscribers. - Queue delivery in batches with
provider rate limits. - Record sent, delivered, bounced, complained, and
failed states where supported. - Process signed provider webhooks. -
Retry transient failures safely. - Never resend to a recipient whose
delivery already succeeded. - Respect unsubscribe and suppression lists
immediately.

Use a provider such as Resend or Amazon SES. Keep provider integration
behind an interface.

## 11. Issue Lifecycle

Recommended issue states:

`draft → queued → generating → review → editing → approved → scheduled → sending → published`

Additional states: - `generation_failed` - `partially_generated` -
`rejected` - `cancelled` - `delivery_failed` - `partially_delivered`

Define valid transitions in backend services. Do not let the frontend
set arbitrary status strings. Published content should be immutable by
default; corrections should create a new version and an audit record.

## 12. API Surface --- Initial Outline

Use versioned routes, request validation, consistent error responses,
and authorization middleware.

**Authentication and profile** - `POST /api/v1/auth/...` -
`GET /api/v1/users/me` - `PATCH /api/v1/users/me`

**Public Tea Rooms and subscriptions** - `GET /api/v1/tea-rooms` -
`GET /api/v1/tea-rooms/:slug` - `GET /api/v1/tea-rooms/:id/issues` -
`POST /api/v1/tea-rooms/:id/subscribe` -
`DELETE /api/v1/tea-rooms/:id/subscribe` -
`GET /api/v1/users/me/subscriptions`

**Admin Tea Room management** - `POST /api/v1/admin/tea-rooms` -
`PATCH /api/v1/admin/tea-rooms/:id` -
`POST /api/v1/admin/tea-rooms/:id/sips` -
`PATCH /api/v1/admin/sips/:sipId` - `DELETE /api/v1/admin/sips/:sipId`

**Issue generation and review** -
`POST /api/v1/admin/tea-rooms/:id/generate` -
`GET /api/v1/admin/generation-runs/:runId` -
`GET /api/v1/admin/issues/:issueId` -
`PATCH /api/v1/admin/issues/:issueId/sips/:sipId` -
`POST /api/v1/admin/issues/:issueId/sips/:sipId/regenerate` -
`POST /api/v1/admin/issues/:issueId/approve` -
`POST /api/v1/admin/issues/:issueId/schedule` -
`POST /api/v1/admin/issues/:issueId/cancel`

**Chat and webhooks** - `POST /api/v1/admin/concierge/chat` -
`POST /api/v1/webhooks/email/:provider`

The API outline is a starting point. Confirm request/response schemas
and authorization rules during implementation. Long-running generation
endpoints should enqueue a job and return a job/run identifier rather
than waiting for the graph to finish.

## 13. Security, Privacy, and Reliability

-   Enforce role-based access control on every admin endpoint and
    service operation.
-   Public users must never be able to create, edit, approve, or
    schedule Tea Rooms.
-   Validate all inputs with Zod; sanitize rendered user-generated
    content.
-   Use secure cookies/sessions or a well-configured token strategy;
    protect against CSRF where relevant.
-   Restrict CORS to known application origins; configure secure headers
    and rate limits.
-   Store secrets only in server-side environment variables or a secret
    manager.
-   Never expose Groq, email, search, GitHub, or other API keys to the
    browser.
-   Verify webhook signatures and reject untrusted webhook requests.
-   Protect against NoSQL injection, SSRF, open redirects, and unsafe
    HTML/email rendering.
-   Treat retrieved web pages and user prompts as untrusted input.
-   Limit LLM tokens, tool calls, retries, parallel jobs, and per-issue
    cost.
-   Use idempotency keys for generation, scheduling, and email delivery.
-   Use retry policies with exponential backoff and a dead-letter queue.
-   Record structured logs, correlation IDs, generation traces, and
    audit events.
-   Keep user data and email addresses private; support unsubscribe,
    deletion, and data-retention policies.
-   Add backups and test restoration.

## 14. Deployment Architecture

Deploy the two React applications on Vercel. A short-lived Express API
can be deployed as serverless functions if it is structured for that
runtime and stays within platform limits. Do not run persistent workers,
long-running LangGraph workflows, or bulk email loops inside ordinary
Vercel functions.

Recommended deployment: - Reader frontend: Vercel. - Admin frontend:
Vercel. - Express API: Vercel for suitable request/response endpoints,
or a persistent Node host if required. - LangGraph/BullMQ worker:
separate persistent worker host (for example, Render, Railway, or
another suitable container platform). - MongoDB: MongoDB Atlas. - Redis:
managed Redis compatible with BullMQ. - Email: Resend or Amazon SES.

Keep the worker and API in the same codebase or monorepo where
practical, but deploy them as separate processes. Use
environment-specific secrets and separate development/staging/production
resources.

## 15. Development Phases

Build and verify the project incrementally. Do not implement all
features in one large change.

1.  **Foundation:** Monorepo, TypeScript, linting, formatting,
    environment validation, MongoDB, shared schemas, logging, and CI.
2.  **Authentication and permissions:** Reader/admin roles, secure auth,
    protected routes, and authorization tests.
3.  **Reader App:** Tea Room discovery, details, subscriptions, profile,
    archive, and reading experience.
4.  **Admin Studio:** Tea Room CRUD, dynamic Sip builder, schedules, and
    configuration validation.
5.  **Tea Concierge:** LangGraph configuration workflow, conversation
    persistence, structured proposals, and confirmation before writes.
6.  **Research engine:** Groq integration, LangChain tools, first-party
    APIs/RSS/search integration, normalized Receipts, and source
    handling.
7.  **Generation graph:** Per-Sip orchestration, structured output,
    verification, quality checks, checkpoints, retries, and targeted
    regeneration.
8.  **Issue editor:** Section editing, version history, source review,
    preview, approval, and audit trail.
9.  **Scheduling and delivery:** BullMQ, automatic generation, review
    deadlines, email templates, batch sending, unsubscribe, webhooks,
    and delivery tracking.
10. **Hardening and deployment:** Security tests, integration tests,
    load tests, monitoring, backups, staging, and production deployment.

For every phase: inspect the existing code, make a plan, implement a
coherent slice, run relevant tests and lint/type checks, fix failures,
review the diff, and commit the completed work before moving on. Never
claim a test passed unless it was actually run.

## 16. MVP Scope and Acceptance Criteria

The first usable release should include:

-   Public Tea Room discovery.
-   Reader registration/login and subscription management.
-   Admin creation of Tea Rooms and configurable Sips.
-   Tea Concierge creating and updating configurations through confirmed
    structured changes.
-   At least one working research integration (for example GitHub) and
    one web/RSS research source.
-   Groq-powered structured content generation through LangGraph.
-   Source references attached to generated items.
-   Individual Sip editing and regeneration.
-   Mandatory admin approval.
-   Weekly scheduled generation and email delivery.
-   Reader archive and issue reading page.
-   Idempotent jobs, basic retries, logs, and role-based security.

The MVP is acceptable when an admin can create a Tea Room, configure
multiple Sips, generate a source-backed issue, edit one Sip without
changing the others, approve the issue, and have it delivered once to
its eligible subscribers at the scheduled time. A reader must be able to
discover the Tea Room, subscribe, receive the Tea, read it on the site,
and unsubscribe.

## 17. Implementation Guidance for Codex

Treat this document as the product and architecture baseline. Before
coding: 1. Inspect the repository and report its current structure and
existing implementation. 2. Identify decisions or missing details that
block the next phase; do not invent credentials or external API access.
3. Propose a phased implementation plan and record it in the repository.
4. Keep prompts, decisions, environment variable names, and setup
instructions documented. 5. Build shared TypeScript types and validation
schemas before duplicating data contracts across apps. 6. Keep AI
workflows, research providers, and email providers behind clear
interfaces. 7. Add tests for permissions, state transitions,
idempotency, schedule calculations, and graph behavior. 8. Use mock
providers in tests so tests do not require paid external APIs. 9. Keep
secrets out of source control and provide a complete `.env.example` with
descriptions, never real values. 10. Stop after each phase, report
changed files and test results, and wait for the next instruction unless
explicitly asked to continue through all phases.

**Product identity:** Spill\
**Tagline:** *The world has tea. We spill it.*\
**Core experience:** Discover Tea Rooms. Follow your favorite Teas. Get
the latest Sips in your inbox.
