import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { ApiError, api, queryString, safeHttpUrl } from "./api";
import { useAuth, type ReaderUser } from "./auth";

interface TeaRoom {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  topics: string[];
  frequency: "daily" | "weekly" | "monthly";
  timezone: string;
  coverImage?: string;
  sipCount: number;
  sips?: Array<{ title: string; description: string; order: number }>;
  schedule?: { deliveryDay?: string; deliveryTime?: string };
}

interface TeaSummary {
  id: string;
  teaRoomId: string;
  teaRoomName: string;
  teaRoomSlug: string;
  title: string;
  publishedAt: string;
  sipCount: number;
  excerpt: string;
}

interface Sip {
  id: string;
  title: string;
  description: string;
  order: number;
  content?: string;
  items?: unknown[];
  sources?: Array<{ url: string; title?: string; sourceName?: string }>;
}

interface Tea extends TeaSummary {
  sips: Sip[];
}

interface Subscription {
  status: "active" | "paused";
  createdAt: string;
  teaRoom: TeaRoom;
}

function AppFrame({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  async function handleSignOut() {
    await signOut();
    navigate("/");
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="Spill home">
          <span className="brand-mark" aria-hidden="true">
            s
          </span>
          spill<span className="brand-period">.</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end>
            Explore
          </NavLink>
          {user && <NavLink to="/my-teas">My Teas</NavLink>}
        </nav>
        <div className="nav-actions">
          {user ? (
            <>
              <Link className="avatar-link" to="/profile" title="Your profile">
                <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
                <span className="hide-small">{user.name.split(" ")[0]}</span>
              </Link>
              <button
                className="button button-quiet nav-signout"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link className="button button-quiet nav-signin" to="/sign-in">
                Sign in
              </Link>
              <Link className="button button-dark nav-join" to="/sign-up">
                Join Spill <span aria-hidden="true">↗</span>
              </Link>
            </>
          )}
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <Link className="footer-brand" to="/">
          spill.
        </Link>
        <span>The world has tea. We spill it.</span>
        <Link to="/">Explore Tea Rooms</Link>
      </footer>
    </div>
  );
}

export function App() {
  return (
    <AppFrame>
      <Routes>
        <Route path="/" element={<DiscoverPage />} />
        <Route path="/tea-rooms/:slug" element={<TeaRoomPage />} />
        <Route path="/tea-rooms/:slug/archive" element={<ArchivePage />} />
        <Route path="/teas/:id" element={<TeaPage />} />
        <Route
          path="/my-teas"
          element={
            <Protected>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <ProfilePage />
            </Protected>
          }
        />
        <Route path="/sign-in" element={<AuthPage mode="sign-in" />} />
        <Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppFrame>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking your account…" />;
  return user ? <>{children}</> : <Navigate to="/sign-in" replace />;
}

function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState(searchParams.get("category") ?? "");
  const [frequency, setFrequency] = useState(searchParams.get("frequency") ?? "");
  const [topic, setTopic] = useState(searchParams.get("topic") ?? "");
  const [rooms, setRooms] = useState<TeaRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api<{ items: TeaRoom[] }>(`/tea-rooms${queryString({ search, category, frequency, topic })}`)
      .then((result) => {
        setRooms(result.items);
        setError("");
      })
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => setLoading(false));
  }, [searchParams]);

  function applyFilters(event: FormEvent) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) params.set("search", search.trim());
    if (category) params.set("category", category);
    if (frequency) params.set("frequency", frequency);
    if (topic.trim()) params.set("topic", topic.trim());
    setSearchParams(params);
  }

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-dot" /> Curated newsletters, steeped fresh
          </p>
          <h1>
            Good reads.
            <br />
            <em>Better rituals.</em>
          </h1>
          <p className="hero-description">
            Find your corner of the internet, delivered with care. Follow a Tea Room and get the
            Sips worth slowing down for.
          </p>
          <a className="text-link hero-link" href="#discover">
            Find your Tea Room <span aria-hidden="true">↓</span>
          </a>
        </div>
        <div className="hero-art" aria-label="Illustration of a steaming cup of tea" role="img">
          <div className="sun-disc" />
          <span className="steam steam-one" />
          <span className="steam steam-two" />
          <div className="cup">
            <span className="cup-tea">
              sip
              <br />
              slow
            </span>
          </div>
          <div className="saucer" />
          <span className="hero-sparkle sparkle-one">✳</span>
          <span className="hero-sparkle sparkle-two">✦</span>
          <p className="hero-art-note">
            A little something
            <br />
            good in your inbox.
          </p>
        </div>
        <div className="hero-bottom">
          <span>01 / EXPLORE</span>
          <span>Made for curious minds</span>
          <span>
            Scroll to steep <b>↓</b>
          </span>
        </div>
      </section>

      <section className="discover-section" id="discover">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your next good read</p>
            <h2>
              Find your people.
              <br />
              <em>Follow your curiosities.</em>
            </h2>
          </div>
          <p className="section-aside">
            A Tea Room is a publication built around a topic you love. Pick one, make it yours, and
            let the good stuff find you.
          </p>
        </div>
        <form className="filter-bar" onSubmit={applyFilters}>
          <label className="search-field">
            <span className="sr-only">Search Tea Rooms</span>
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Try ‘design’, ‘AI’, ‘slow living’…"
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <input
              className="filter-input"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Category"
            />
          </label>
          <label>
            <span className="sr-only">Topic</span>
            <input
              className="filter-input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="Topic"
            />
          </label>
          <label className="frequency-select">
            <span className="sr-only">Publishing frequency</span>
            <select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
              <option value="">Any rhythm</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <button className="button button-dark filter-submit" type="submit">
            Explore <span aria-hidden="true">↗</span>
          </button>
        </form>

        <div className="results-label">
          <span>THE TEA ROOMS</span>
          <span>
            {loading ? "Steeping…" : `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}
          </span>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        {loading ? (
          <Loading label="Finding your next read…" />
        ) : rooms.length ? (
          <div className="room-grid">
            {rooms.map((room, index) => (
              <RoomCard key={room.id} room={room} index={index} />
            ))}
          </div>
        ) : !error ? (
          <div className="empty-state">
            <div className="empty-mark">✳</div>
            <p className="eyebrow">A little quiet for now</p>
            <h3>The kettle’s just getting started.</h3>
            <p>There aren’t any public Tea Rooms yet. Check back soon for fresh Sips to explore.</p>
          </div>
        ) : null}
      </section>
      <section className="manifesto">
        <span className="manifesto-mark">“</span>
        <p>Somewhere between the noise and the scroll, there’s a note written just for you.</p>
        <span className="manifesto-caption">SLOW DOWN. STAY CURIOUS.</span>
      </section>
    </>
  );
}

function RoomCard({ room, index }: { room: TeaRoom; index: number }) {
  return (
    <article className={`room-card art-${index % 4}`}>
      <Link className="room-card-link" to={`/tea-rooms/${room.slug}`}>
        <div className="card-art">
          <span className="card-category">{room.category}</span>
          <span className="card-art-symbol" aria-hidden="true">
            {["✳", "◒", "✦", "☼"][index % 4]}
          </span>
          <span className="card-frequency">{room.frequency}</span>
        </div>
        <div className="room-card-body">
          <div className="card-title-row">
            <h3>{room.name}</h3>
            <span className="arrow-circle" aria-hidden="true">
              ↗
            </span>
          </div>
          <p>{room.description}</p>
          <div className="topic-row">
            {room.topics.slice(0, 3).map((item) => (
              <span className="topic-chip" key={item}>
                {item}
              </span>
            ))}
          </div>
          <div className="card-meta">
            <span>{room.frequency} pour</span>
            <span>{room.sipCount} Sips</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

function TeaRoomPage() {
  const { slug = "" } = useParams();
  const { user } = useAuth();
  const [room, setRoom] = useState<TeaRoom | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    setLoading(true);
    api<{ teaRoom: TeaRoom }>(`/tea-rooms/${encodeURIComponent(slug)}`)
      .then((result) => setRoom(result.teaRoom))
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!user || !room) return;
    api<{ subscriptions: Subscription[] }>("/users/me/subscriptions")
      .then(({ subscriptions }) => {
        const subscription = subscriptions.find((item) => item.teaRoom.id === room.id);
        setSubscribed(Boolean(subscription));
        setPaused(subscription?.status === "paused");
      })
      .catch(() => undefined);
  }, [room, user]);

  async function changeSubscription(action: "subscribe" | "unsubscribe" | "pause" | "resume") {
    if (!room) return;
    setBusy(true);
    setFeedback("");
    try {
      if (action === "subscribe") {
        await api(`/tea-rooms/${room.id}/subscribe`, { method: "POST" });
        setSubscribed(true);
        setPaused(false);
        setFeedback("You’re following this Tea Room. Welcome in!");
      } else if (action === "unsubscribe") {
        await api(`/tea-rooms/${room.id}/subscribe`, { method: "DELETE" });
        setSubscribed(false);
        setPaused(false);
        setFeedback("You’ve left this Tea Room. You can always come back.");
      } else {
        await api(`/tea-rooms/${room.id}/${action}`, { method: "POST" });
        setPaused(action === "pause");
        setFeedback(
          action === "pause" ? "Your Tea is paused." : "Your Tea is back on the pour schedule.",
        );
      }
    } catch (reason) {
      setFeedback(
        reason instanceof ApiError && reason.status === 401
          ? "Sign in to follow this Tea Room."
          : messageOf(reason),
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Opening the Tea Room…" />;
  if (!room) return <NotFound message={error || "This Tea Room isn’t here."} />;
  const cover = room.coverImage ? safeHttpUrl(room.coverImage) : null;

  return (
    <section className="detail-page">
      <div className="detail-hero">
        <Link className="back-link" to="/">
          ← Explore Tea Rooms
        </Link>
        <div className="detail-hero-content">
          <div
            className={`detail-art ${cover ? "has-cover" : ""}`}
            style={
              cover
                ? {
                    backgroundImage: `linear-gradient(180deg, transparent 15%, rgba(20,32,25,.45)), url("${cover}")`,
                  }
                : undefined
            }
          >
            <span className="detail-art-symbol" aria-hidden="true">
              ✳
            </span>
            <span className="detail-art-label">
              {room.category} · {room.frequency}
            </span>
          </div>
          <div className="detail-copy">
            <p className="eyebrow">A Tea Room for the curious</p>
            <h1>{room.name}</h1>
            <p className="detail-description">{room.description}</p>
            <div className="topic-row detail-topics">
              {room.topics.map((item) => (
                <span className="topic-chip" key={item}>
                  {item}
                </span>
              ))}
            </div>
            <div className="detail-actions">
              {user ? (
                subscribed ? (
                  <>
                    <button
                      className="button button-dark"
                      disabled={busy}
                      onClick={() => void changeSubscription(paused ? "resume" : "pause")}
                    >
                      {paused ? "Resume my Tea" : "Pause my Tea"}
                    </button>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => void changeSubscription("unsubscribe")}
                    >
                      Unsubscribe
                    </button>
                  </>
                ) : (
                  <button
                    className="button button-dark"
                    disabled={busy}
                    onClick={() => void changeSubscription("subscribe")}
                  >
                    Get this Tea <span aria-hidden="true">↗</span>
                  </button>
                )
              ) : (
                <Link className="button button-dark" to="/sign-up">
                  Get this Tea <span aria-hidden="true">↗</span>
                </Link>
              )}
              <Link className="button button-outline" to={`/tea-rooms/${room.slug}/archive`}>
                Visit the Tea Cellar
              </Link>
            </div>
            {feedback && (
              <p className="inline-feedback" role="status">
                {feedback}
              </p>
            )}
          </div>
        </div>
        <div className="detail-facts">
          <span>
            <b>{room.schedule?.deliveryDay ?? room.frequency}</b> next pour
          </span>
          <span>
            <b>{room.schedule?.deliveryTime ?? "Local time"}</b> {room.timezone}
          </span>
          <span>
            <b>{room.sipCount}</b> Sips inside
          </span>
        </div>
      </div>
      <div className="detail-lower">
        <section className="sip-preview">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">A taste of what’s inside</p>
              <h2>
                Meet the <em>Sips.</em>
              </h2>
            </div>
            <span className="sip-count">{String(room.sipCount).padStart(2, "0")} SIPS</span>
          </div>
          {room.sips?.length ? (
            <div className="sip-list">
              {room.sips.map((sip, index) => (
                <article className="sip-row" key={`${sip.order}-${sip.title}`}>
                  <span className="sip-index">0{index + 1}</span>
                  <div>
                    <h3>{sip.title}</h3>
                    <p>{sip.description}</p>
                  </div>
                  <span className="sip-mark" aria-hidden="true">
                    ✳
                  </span>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted-copy">
              This room is still shaping its first Sips. Follow along for the opening pour.
            </p>
          )}
        </section>
        <aside className="detail-aside">
          <p className="eyebrow">The pour schedule</p>
          <h3>
            Made to fit
            <br />
            your rhythm.
          </h3>
          <p>
            New Teas arrive{" "}
            {room.frequency === "weekly"
              ? "once a week"
              : room.frequency === "daily"
                ? "each day"
                : "once a month"}
            . You can pause or leave whenever you like.
          </p>
          <Link className="text-link" to={`/tea-rooms/${room.slug}/archive`}>
            Browse past Teas <span aria-hidden="true">↗</span>
          </Link>
        </aside>
      </div>
    </section>
  );
}

function ArchivePage() {
  const { slug = "" } = useParams();
  const [room, setRoom] = useState<TeaRoom | null>(null);
  const [teas, setTeas] = useState<TeaSummary[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<{ teaRoom: TeaRoom }>(`/tea-rooms/${encodeURIComponent(slug)}`)
      .then((result) => active && setRoom(result.teaRoom))
      .catch((reason: unknown) => active && setError(messageOf(reason)));
    void api<{ items: TeaSummary[] }>(`/tea-rooms/${encodeURIComponent(slug)}/issues`)
      .then((result) => active && setTeas(result.items))
      .catch((reason: unknown) => active && setError(messageOf(reason)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  async function filterArchive(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await api<{ items: TeaSummary[] }>(
        `/tea-rooms/${encodeURIComponent(slug)}/issues${queryString({ search, from, to })}`,
      );
      setTeas(result.items);
      setError("");
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="content-page archive-page">
      <Link className="back-link" to={`/tea-rooms/${slug}`}>
        ← Back to {room?.name ?? "Tea Room"}
      </Link>
      <div className="page-heading">
        <p className="eyebrow">From the archives</p>
        <h1>
          The Tea <em>Cellar.</em>
        </h1>
        <p>
          Every good pour leaves a little aftertaste. Browse the Teas from{" "}
          {room?.name ?? "this room"}.
        </p>
      </div>
      <form className="archive-filters" onSubmit={(event) => void filterArchive(event)}>
        <label>
          Find a Tea
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search titles"
          />
        </label>
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="button button-dark" type="submit">
          Filter archive
        </button>
      </form>
      {error && <Notice tone="error">{error}</Notice>}
      {loading ? (
        <Loading label="Opening the cellar…" />
      ) : teas.length ? (
        <div className="tea-list">
          {teas.map((tea) => (
            <TeaRow key={tea.id} tea={tea} />
          ))}
        </div>
      ) : !error ? (
        <div className="empty-state compact-empty">
          <div className="empty-mark">◒</div>
          <h3>No Teas on these shelves yet.</h3>
          <p>When the first issue is published, you’ll find it here.</p>
        </div>
      ) : null}
    </section>
  );
}

function TeaPage() {
  const { id = "" } = useParams();
  const [tea, setTea] = useState<Tea | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ tea: Tea }>(`/issues/${encodeURIComponent(id)}`)
      .then((result) => setTea(result.tea))
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => setLoading(false));
  }, [id]);
  if (loading) return <Loading label="Pouring your Tea…" />;
  if (!tea) return <NotFound message={error || "This Tea isn’t available."} />;
  return (
    <article className="reading-page">
      <Link className="back-link" to={`/tea-rooms/${tea.teaRoomSlug}/archive`}>
        ← {tea.teaRoomName} Tea Cellar
      </Link>
      <header className="reading-header">
        <p className="eyebrow">A fresh pour from {tea.teaRoomName}</p>
        <h1>{tea.title}</h1>
        <p className="reading-dek">{tea.excerpt}</p>
        <div className="reading-byline">
          <span>Published {formatDate(tea.publishedAt)}</span>
          <span>·</span>
          <span>{tea.sipCount} Sips</span>
        </div>
      </header>
      <div className="reading-body">
        {tea.sips.map((sip, index) => (
          <section className="reading-sip" key={sip.id}>
            <div className="reading-sip-heading">
              <span className="sip-index">0{index + 1}</span>
              <div>
                <h2>{sip.title}</h2>
                <p>{sip.description}</p>
              </div>
            </div>
            <SipBody sip={sip} />
          </section>
        ))}
        {!tea.sips.length && <p className="muted-copy">This Tea has no Sips to show yet.</p>}
      </div>
      <div className="reading-end">
        <span>✳</span>
        <p>
          That’s the last Sip.
          <br />
          <em>Take it with you.</em>
        </p>
        <Link className="button button-outline" to={`/tea-rooms/${tea.teaRoomSlug}`}>
          Meet this Tea Room
        </Link>
      </div>
    </article>
  );
}

function SipBody({ sip }: { sip: Sip }) {
  return (
    <div className="sip-content">
      {sip.content &&
        sip.content.split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {sip.items?.map((item, index) => (
        <div className="story-item" key={index}>
          {typeof item === "string" ? <p>{item}</p> : <StoryItem item={item} />}
        </div>
      ))}
      {sip.sources?.length ? (
        <aside className="receipts">
          <h3>Receipts</h3>
          <ul>
            {sip.sources.map((source) => {
              const url = safeHttpUrl(source.url);
              return (
                <li key={source.url}>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      {source.title || source.sourceName || url}
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  ) : (
                    <span>{source.title || source.sourceName || "Source"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      ) : null}
    </div>
  );
}

function StoryItem({ item }: { item: unknown }) {
  if (typeof item !== "object" || item === null) return <p>{String(item)}</p>;
  const record = item as Record<string, unknown>;
  return (
    <>
      <h3>{String(record.title ?? record.name ?? "")}</h3>
      {record.description && <p>{String(record.description)}</p>}
      {record.summary && <p>{String(record.summary)}</p>}
    </>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{
    subscriptions: Subscription[];
    recentTeas: TeaSummary[];
    nextPour: TeaSummary[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ subscriptions: Subscription[]; recentTeas: TeaSummary[]; nextPour: TeaSummary[] }>(
      "/users/me/dashboard",
    )
      .then(setData)
      .catch((reason: unknown) => setError(messageOf(reason)));
  }, []);
  return (
    <section className="content-page dashboard-page">
      <div className="dashboard-greeting">
        <div>
          <p className="eyebrow">Your reading ritual</p>
          <h1>
            Good to see you,
            <br />
            <em>{user?.name.split(" ")[0]}.</em>
          </h1>
        </div>
        <div className="dashboard-stamp">
          <span>✳</span>
          <small>
            YOUR
            <br />
            TEA LIST
          </small>
        </div>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {!data ? (
        <Loading label="Gathering your Teas…" />
      ) : (
        <>
          <section className="dashboard-section">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">The rooms you follow</p>
                <h2>
                  My <em>Teas.</em>
                </h2>
              </div>
              <Link className="text-link" to="/">
                Find another room ↗
              </Link>
            </div>
            {data.subscriptions.length ? (
              <div className="subscription-grid">
                {data.subscriptions.map(({ teaRoom, status }) => (
                  <Link
                    className={`subscription-card ${status === "paused" ? "is-paused" : ""}`}
                    key={teaRoom.id}
                    to={`/tea-rooms/${teaRoom.slug}`}
                  >
                    <span className="subscription-icon">{status === "paused" ? "Ⅱ" : "✳"}</span>
                    <span className="subscription-status">
                      {status === "paused" ? "Paused" : "Following"}
                    </span>
                    <h3>{teaRoom.name}</h3>
                    <p>
                      {teaRoom.frequency} · {teaRoom.category}
                    </p>
                    <span className="text-link">Open Tea Room ↗</span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="empty-inline">
                <p>Your Tea list is waiting to be filled.</p>
                <Link className="button button-dark" to="/">
                  Explore Tea Rooms
                </Link>
              </div>
            )}
          </section>
          <section className="dashboard-section split-dashboard">
            <div>
              <div className="section-heading compact">
                <div>
                  <p className="eyebrow">Recently published</p>
                  <h2>
                    Fresh <em>Teas.</em>
                  </h2>
                </div>
              </div>
              {data.recentTeas.length ? (
                <div className="tea-list">
                  {data.recentTeas.map((tea) => (
                    <TeaRow key={tea.id} tea={tea} />
                  ))}
                </div>
              ) : (
                <p className="muted-copy">New Teas from the rooms you follow will land here.</p>
              )}
            </div>
            <aside className="next-pour">
              <p className="eyebrow">Coming up</p>
              <h3>Your next pour.</h3>
              {data.nextPour.length ? (
                data.nextPour.map((tea) => (
                  <div className="next-pour-item" key={tea.id}>
                    <span>{formatDate(tea.publishedAt)}</span>
                    <b>{tea.title}</b>
                    <small>{tea.teaRoomName}</small>
                  </div>
                ))
              ) : (
                <p>Nothing scheduled just yet. Your Tea Rooms are getting the kettle ready.</p>
              )}
            </aside>
          </section>
        </>
      )}
    </section>
  );
}

function ProfilePage() {
  const { user, setUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [teaUpdates, setTeaUpdates] = useState(user?.emailPreferences.teaUpdates ?? true);
  const [productUpdates, setProductUpdates] = useState(
    user?.emailPreferences.productUpdates ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFeedback("");
    try {
      const result = await api<{ user: ReaderUser }>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name, emailPreferences: { teaUpdates, productUpdates } }),
      });
      setUser(result.user);
      setFeedback("Your account is up to date.");
    } catch (reason) {
      setFeedback(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-page profile-page">
      <p className="eyebrow">A place to make it yours</p>
      <h1>
        Your <em>account.</em>
      </h1>
      <form className="profile-card" onSubmit={(event) => void save(event)}>
        <div className="profile-card-heading">
          <span className="avatar avatar-large">{user?.name.slice(0, 1).toUpperCase()}</span>
          <div>
            <h2>Reader details</h2>
            <p>Keep your account and inbox preferences current.</p>
          </div>
        </div>
        <label className="form-label">
          Name
          <input
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="form-label">
          Email address
          <input value={user?.email ?? ""} readOnly />
          <small>Email changes are not available until verification is set up.</small>
        </label>
        <div className="preference-group">
          <p className="eyebrow">Inbox preferences</p>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={teaUpdates}
              onChange={(event) => setTeaUpdates(event.target.checked)}
            />
            <span>
              <b>Tea delivery</b>
              <small>Receive new Teas from the rooms you follow.</small>
            </span>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={productUpdates}
              onChange={(event) => setProductUpdates(event.target.checked)}
            />
            <span>
              <b>Spill updates</b>
              <small>Occasional notes about what’s new on Spill.</small>
            </span>
          </label>
        </div>
        {feedback && (
          <p className="form-feedback" role="status">
            {feedback}
          </p>
        )}
        <button className="button button-dark" disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}

function AuthPage({ mode }: { mode: "sign-in" | "sign-up" }) {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/my-teas" replace />;
  const joining = mode === "sign-up";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (joining) await signUp(name, email, password);
      else await signIn(email, password);
      navigate(searchParams.get("next") || "/my-teas", { replace: true });
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-page">
      <div className="auth-art">
        <span className="auth-art-star">✳</span>
        <p>
          Make room
          <br />
          for a good read.
        </p>
        <span className="auth-art-note">
          A little less noise.
          <br />A little more you.
        </span>
      </div>
      <div className="auth-panel">
        <Link className="back-link" to="/">
          ← Back to explore
        </Link>
        <p className="eyebrow">{joining ? "Your inbox called" : "Welcome back"}</p>
        <h1>
          {joining ? (
            <>
              Find your
              <br />
              <em>reading ritual.</em>
            </>
          ) : (
            <>
              Come on in,
              <br />
              <em>Tea Lover.</em>
            </>
          )}
        </h1>
        <p className="auth-intro">
          {joining
            ? "One good read at a time. Create your free Spill account."
            : "Your favorite Tea Rooms are right where you left them."}
        </p>
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {joining && (
            <label className="form-label">
              Your name
              <input
                autoComplete="name"
                required
                minLength={1}
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
          )}
          <label className="form-label">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="form-label">
            Password
            <input
              type="password"
              autoComplete={joining ? "new-password" : "current-password"}
              minLength={joining ? 12 : 1}
              maxLength={128}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {joining && <small>Use at least 12 characters.</small>}
          </label>
          {error && <Notice tone="error">{error}</Notice>}
          <button className="button button-dark button-wide" disabled={busy}>
            {busy ? "One moment…" : joining ? "Create my account" : "Sign in"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </form>
        <p className="auth-switch">
          {joining ? "Already part of Spill?" : "New to Spill?"}{" "}
          <Link to={joining ? "/sign-in" : "/sign-up"}>
            {joining ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </div>
    </section>
  );
}

function TeaRow({ tea }: { tea: TeaSummary }) {
  return (
    <Link className="tea-row" to={`/teas/${tea.id}`}>
      <span className="tea-row-mark">✳</span>
      <div className="tea-row-copy">
        <span className="eyebrow">
          {tea.teaRoomName} · {formatDate(tea.publishedAt)}
        </span>
        <h3>{tea.title}</h3>
        <p>{tea.excerpt}</p>
      </div>
      <span className="arrow-circle" aria-hidden="true">
        ↗
      </span>
    </Link>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="loading-kettle" aria-hidden="true">
        ◌
      </span>
      {label}
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <p className={`notice notice-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

function NotFound({ message = "We couldn’t find that page." }: { message?: string }) {
  return (
    <section className="not-found">
      <span className="empty-mark">✳</span>
      <p className="eyebrow">A little detour</p>
      <h1>
        Nothing steeping <em>here.</em>
      </h1>
      <p>{message}</p>
      <Link className="button button-dark" to="/">
        Back to explore
      </Link>
    </section>
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date to be announced"
    : new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(
        date,
      );
}
