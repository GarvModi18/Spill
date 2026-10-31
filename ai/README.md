# AI Engine

# AI workflows

This workspace contains LangGraph workflows and provider adapters. Phase 5 adds the Tea Concierge configuration graph and a Groq structured-output model adapter. The graph produces validated proposals but has no database write tools; authenticated API routes persist configuration only after an admin confirms a preview.

The API requires `GROQ_API_KEY` and `GROQ_MODEL` for live Concierge responses. Tests use a mock `ConciergeModel` and do not call external services. LangGraph checkpoints use MongoDB in the API runtime; the `chatSessions` collection remains the application record for messages and proposal state.

# Research integrations

`ResearchService` runs the enabled sources from a Sip with bounded concurrency. GitHub, Hacker News, Hugging Face, RSS, and Tavily providers return normalized Receipts with source metadata, retrieval time, and an initial `unverified` status. Partial provider failures do not discard successful results. Tavily requires `TAVILY_API_KEY`; GitHub uses the optional `GITHUB_TOKEN`. Retrieved content is treated as untrusted evidence and is never interpreted as instructions.

# Generation workflow

`createGenerationGraph` researches and generates each Sip independently with bounded concurrency. It validates structured items, checks evidence URLs against collected Receipts, flags unsupported claims and weak evidence coverage, retries model failures once, and retains successful Sips when another Sip fails. Production uses the MongoDB LangGraph checkpointer; the API records issue, Sip, source, quality, and model-version data in MongoDB. The configured Groq model is shared with Tea Concierge through `GROQ_API_KEY` and `GROQ_MODEL`.
