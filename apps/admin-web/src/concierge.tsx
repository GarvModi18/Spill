import { useEffect, useState, type FormEvent } from "react";
import { api, type ConciergeSession } from "./api";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function ConciergePage() {
  const [sessions, setSessions] = useState<ConciergeSession[]>([]);
  const [session, setSession] = useState<ConciergeSession | null>(null);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadSessions() {
    const [list, status] = await Promise.all([
      api<{ sessions: ConciergeSession[] }>("/admin/concierge/sessions"),
      api<{ configured: boolean }>("/admin/concierge/availability"),
    ]);
    setSessions(list.sessions);
    setConfigured(status.configured);
    if (!session && list.sessions[0]) {
      const result = await api<{ session: ConciergeSession }>(
        `/admin/concierge/sessions/${list.sessions[0].threadId}`,
      );
      setSession(result.session);
    } else if (!session && list.sessions.length === 0) {
      const result = await api<{ session: ConciergeSession }>("/admin/concierge/sessions", {
        method: "POST",
      });
      setSession(result.session);
      setSessions([result.session]);
    }
  }

  useEffect(() => {
    void loadSessions().catch((reason: unknown) => setError(errorMessage(reason)));
  }, []);

  async function refresh(threadId: string) {
    const result = await api<{ session: ConciergeSession }>(
      `/admin/concierge/sessions/${threadId}`,
    );
    setSession(result.session);
    const list = await api<{ sessions: ConciergeSession[] }>("/admin/concierge/sessions");
    setSessions(list.sessions);
  }

  async function newConversation() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ session: ConciergeSession }>("/admin/concierge/sessions", {
        method: "POST",
      });
      setSession(result.session);
      setSessions((current) => [result.session, ...current]);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openConversation(threadId: string) {
    setError("");
    try {
      const result = await api<{ session: ConciergeSession }>(
        `/admin/concierge/sessions/${threadId}`,
      );
      setSession(result.session);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!session || !message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ session: ConciergeSession }>(
        `/admin/concierge/sessions/${session.threadId}/messages`,
        {
          method: "POST",
          body: JSON.stringify({ message: message.trim() }),
        },
      );
      setSession(result.session);
      setSessions((current) => [
        result.session,
        ...current.filter((item) => item.threadId !== result.session.threadId),
      ]);
      setMessage("");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function decide(action: "confirm" | "reject") {
    if (!session?.pendingProposal) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/concierge/sessions/${session.threadId}/${action}`, {
        method: "POST",
        body: JSON.stringify({ proposalId: session.pendingProposal.id }),
      });
      await refresh(session.threadId);
    } catch (reason) {
      setError(errorMessage(reason));
      await refresh(session.threadId).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page-content concierge-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CONFIGURATION PARTNER</p>
          <h1>
            Tea <em>Concierge.</em>
          </h1>
          <p>Describe a Tea Room or Sip change. Review the structured preview before it’s saved.</p>
        </div>
        <button
          className="admin-button primary"
          onClick={() => void newConversation()}
          disabled={busy}
        >
          ＋ New conversation
        </button>
      </div>
      {!configured && (
        <div className="concierge-config-note" role="status">
          <b>Concierge is not connected yet.</b> Set <code>GROQ_API_KEY</code> and{" "}
          <code>GROQ_MODEL</code> in the API environment to enable proposal drafting. You can still
          review saved conversations.
        </div>
      )}
      {error && (
        <p className="inline-notice error" role="alert">
          {error}
        </p>
      )}
      <div className="concierge-layout">
        <aside className="concierge-history" aria-label="Conversations">
          <p className="eyebrow">RECENT CONVERSATIONS</p>
          {sessions.length ? (
            sessions.map((item) => (
              <button
                className={`conversation-link ${session?.threadId === item.threadId ? "selected" : ""}`}
                key={item.threadId}
                onClick={() => void openConversation(item.threadId)}
              >
                <b>{item.title}</b>
                <small>{new Date(item.updatedAt).toLocaleDateString()}</small>
              </button>
            ))
          ) : (
            <p className="empty-copy">No conversations yet.</p>
          )}
        </aside>
        <section className="concierge-chat" aria-label="Tea Concierge conversation">
          <div className="concierge-chat-head">
            <span className="concierge-avatar">✳</span>
            <div>
              <b>Tea Concierge</b>
              <small>Configuration assistant · confirmation required before saving</small>
            </div>
          </div>
          <div className="concierge-messages" aria-live="polite">
            {session?.messages.length ? (
              session.messages.map((item) => (
                <div className={`chat-message ${item.role}`} key={item.id}>
                  <small>{item.role === "user" ? "You" : "Tea Concierge"}</small>
                  <p>{item.content}</p>
                </div>
              ))
            ) : (
              <div className="concierge-welcome">
                <span>✳</span>
                <h2>What are we brewing?</h2>
                <p>
                  Ask me to create a Tea Room, adjust a schedule, or shape a Sip. I’ll show you
                  every proposed change before it’s applied.
                </p>
                <div className="concierge-prompts">
                  <button onClick={() => setMessage("Help me create a weekly AI Tea Room")}>
                    Create a weekly AI Tea Room
                  </button>
                  <button onClick={() => setMessage("Add a latest news Sip to my AI Weekly room")}>
                    Add a news Sip
                  </button>
                </div>
              </div>
            )}
            {session?.pendingProposal && (
              <div className="proposal-card">
                <p className="eyebrow">CONFIGURATION PREVIEW</p>
                <p>{session.pendingProposal.preview}</p>
                {session.pendingProposal.status === "pending" ? (
                  <div className="proposal-actions">
                    <button
                      className="admin-button quiet"
                      disabled={busy}
                      onClick={() => void decide("reject")}
                    >
                      Dismiss
                    </button>
                    <button
                      className="admin-button primary"
                      disabled={busy}
                      onClick={() => void decide("confirm")}
                    >
                      Confirm and save
                    </button>
                  </div>
                ) : (
                  <span className={`proposal-status ${session.pendingProposal.status}`}>
                    {session.pendingProposal.status === "confirmed"
                      ? "Saved"
                      : session.pendingProposal.status === "rejected"
                        ? "Dismissed"
                        : "Applying…"}
                  </span>
                )}
              </div>
            )}
          </div>
          <form className="concierge-composer" onSubmit={(event) => void send(event)}>
            <label className="sr-only" htmlFor="concierge-message">
              Message the Tea Concierge
            </label>
            <textarea
              id="concierge-message"
              rows={2}
              maxLength={4000}
              placeholder="Describe the configuration you have in mind…"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={
                !configured ||
                busy ||
                session?.pendingProposal?.status === "pending" ||
                session?.pendingProposal?.status === "applying"
              }
            />
            <button
              className="admin-button primary"
              disabled={
                !configured ||
                busy ||
                !message.trim() ||
                session?.pendingProposal?.status === "pending" ||
                session?.pendingProposal?.status === "applying"
              }
            >
              {busy ? "Working…" : "Send"}
              <span>↗</span>
            </button>
          </form>
          <small className="concierge-footnote">
            Changes are saved only after you confirm the preview. No Tea is generated or sent here.
          </small>
        </section>
      </div>
    </main>
  );
}
