# AI Engine

# AI workflows

This workspace contains LangGraph workflows and provider adapters. Phase 5 adds the Tea Concierge configuration graph and a Groq structured-output model adapter. The graph produces validated proposals but has no database write tools; authenticated API routes persist configuration only after an admin confirms a preview.

The API requires `GROQ_API_KEY` and `GROQ_MODEL` for live Concierge responses. Tests use a mock `ConciergeModel` and do not call external services. LangGraph checkpoints use MongoDB in the API runtime; the `chatSessions` collection remains the application record for messages and proposal state.
