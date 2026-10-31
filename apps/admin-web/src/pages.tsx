import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  api,
  READER_APP_URL,
  type AdminDashboard,
  type AdminSip,
  type ManagedTeaRoom,
  type RoomInput,
  type SipInput,
  type SchedulePoint,
} from "./api";
import { useAuth } from "./auth";
import { ConciergePage } from "./concierge";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const SOURCE_TYPES = ["web_search", "rss", "github", "hacker_news", "hugging_face"] as const;
const SIP_TYPES = [
  ["top_n", "Top N / ranked list"],
  ["latest_news", "Latest news"],
  ["trending", "Trending projects, models, or tools"],
  ["company_updates", "Company updates"],
  ["comparison", "Comparison"],
  ["research_summary", "Research paper summary"],
  ["tutorial", "Tutorial / explainer"],
  ["deals", "Deals and offers"],
  ["market_update", "Stock or market update"],
  ["editorial", "Editorial / custom"],
];
const TIMEZONES = [
  "Asia/Kolkata",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "UTC",
];

function emptyRoom(): RoomInput {
  return {
    name: "",
    slug: "",
    description: "",
    category: "Technology",
    topics: [],
    audience: "",
    coverImage: "",
    editorialVoice: "",
    frequency: "weekly",
    timezone: "Asia/Kolkata",
    schedule: {
      generation: { time: "09:00", weekday: "Friday" },
      reviewDeadline: { time: "18:00", weekday: "Saturday" },
      delivery: { time: "09:00", weekday: "Sunday" },
    },
    defaultResearchSettings: {
      sources: [
        { type: "web_search", enabled: true },
        { type: "github", enabled: true },
      ],
      timeRangeDays: 7,
    },
    emailTemplate: "default",
    isPublic: true,
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

export function App() {
  const { user, loading, denied } = useAuth();
  if (loading)
    return (
      <div className="launch-state">
        <span className="brand-symbol">✳</span>Opening Brew House…
      </div>
    );
  return (
    <Routes>
      <Route
        path="/sign-in"
        element={user ? <Navigate to="/" replace /> : <SignInPage denied={denied} />}
      />
      <Route
        path="*"
        element={
          user ? (
            <AdminFrame>
              <AdminRoutes />
            </AdminFrame>
          ) : denied ? (
            <AccessDenied />
          ) : (
            <Navigate to="/sign-in" replace />
          )
        }
      />
    </Routes>
  );
}

function AdminFrame({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  async function logout() {
    await signOut();
    navigate("/sign-in");
  }
  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Link className="admin-brand" to="/">
          <span className="brand-symbol">✳</span>
          <span>
            <b>spill.</b>
            <small>BREW HOUSE</small>
          </span>
        </Link>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Admin navigation">
          <NavLink to="/" end>
            <span>▦</span> Overview
          </NavLink>
          <NavLink to="/tea-rooms">
            <span>◉</span> Tea Rooms
          </NavLink>
          <NavLink to="/concierge">
            <span>✳</span> Tea Concierge
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <div className="curator-avatar">{user?.name.slice(0, 1).toUpperCase()}</div>
          <div className="curator-info">
            <b>{user?.name}</b>
            <small>Curator</small>
          </div>
          <button
            className="icon-button logout-button"
            onClick={() => void logout()}
            aria-label="Sign out"
            title="Sign out"
          >
            ↗
          </button>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="breadcrumb-root">Spill</span>
            <span className="breadcrumb-slash">/</span>
            <span>Brew House</span>
          </div>
          <span className="topbar-note">
            <i /> All systems steeping
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/tea-rooms" element={<TeaRoomsPage />} />
      <Route path="/tea-rooms/new" element={<TeaRoomEditorPage />} />
      <Route path="/tea-rooms/:id" element={<TeaRoomEditorPage />} />
      <Route path="/concierge" element={<ConciergePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function SignInPage({ denied }: { denied: boolean }) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(denied ? "This account does not have Curator access." : "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      navigate("/", { replace: true });
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-art">
        <span className="login-orbit orbit-a" />
        <span className="login-orbit orbit-b" />
        <span className="brand-symbol login-star">✳</span>
        <p>
          Good things
          <br />
          <em>take steeping.</em>
        </p>
        <small>THE WORLD HAS TEA. WE SPILL IT.</small>
      </div>
      <form className="login-card" onSubmit={(event) => void submit(event)}>
        <Link className="login-brand" to="/sign-in">
          spill.<span> / BREW HOUSE</span>
        </Link>
        <p className="eyebrow">CURATOR ACCESS</p>
        <h1>
          Welcome
          <br />
          back.
        </h1>
        <p className="login-intro">Sign in to shape the next good read.</p>
        <label className="field-label">
          Email address
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label className="field-label">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <InlineNotice tone="error">{error}</InlineNotice>}
        <button className="admin-button primary wide" disabled={busy}>
          {busy ? "Checking access…" : "Enter the Brew House"}
          <span>↗</span>
        </button>
        <small className="login-footnote">Curator accounts are created by an administrator.</small>
      </form>
    </div>
  );
}

function AccessDenied() {
  const { signOut } = useAuth();
  return (
    <div className="access-denied">
      <span className="brand-symbol">✳</span>
      <p className="eyebrow">BREW HOUSE ACCESS</p>
      <h1>This account isn’t a Curator.</h1>
      <p>Sign out and use an account with admin permissions.</p>
      <button className="admin-button primary" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

function DashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [rooms, setRooms] = useState<ManagedTeaRoom[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<AdminDashboard>("/admin/dashboard"),
      api<{ teaRooms: ManagedTeaRoom[] }>("/admin/tea-rooms"),
    ])
      .then(([metrics, result]) => {
        setDashboard(metrics);
        setRooms(result.teaRooms.slice(0, 5));
      })
      .catch((reason: unknown) => setError(messageOf(reason)));
  }, []);
  const metrics = dashboard
    ? ([
        ["Tea Rooms", dashboard.teaRooms, `${dashboard.activeTeaRooms} active`, "◉"],
        ["Tea Lovers", dashboard.teaLovers, `${dashboard.activeSubscriptions} following`, "♧"],
        [
          "Issues in motion",
          dashboard.generatedIssues,
          `${dashboard.scheduledIssues} scheduled`,
          "▤",
        ],
        [
          "Needs a taste test",
          dashboard.awaitingApproval,
          `${dashboard.generationFailures} brew errors`,
          "✳",
        ],
      ] as const)
    : [];
  return (
    <div className="page-content dashboard-admin">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">
            SUNDAY,{" "}
            {new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" })
              .format(new Date())
              .toUpperCase()}
          </p>
          <h1>
            Good morning,
            <br />
            <em>Curator.</em>
          </h1>
          <p className="page-subtitle">Here’s what’s happening around the Brew House.</p>
        </div>
        <Link className="admin-button primary" to="/tea-rooms/new">
          ＋ Create Tea Room
        </Link>
      </div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      <section className="metric-grid" aria-label="Platform metrics">
        {metrics.length ? (
          metrics.map(([label, value, note, icon]) => (
            <article className="metric-card" key={label}>
              <div className="metric-top">
                <span>{label}</span>
                <i>{icon}</i>
              </div>
              <b>{value}</b>
              <small>{note}</small>
            </article>
          ))
        ) : (
          <div className="metric-loading">Loading your Brew House…</div>
        )}
      </section>
      <section className="dashboard-block">
        <div className="block-heading">
          <div>
            <p className="eyebrow">YOUR PUBLICATIONS</p>
            <h2>Tea Rooms</h2>
          </div>
          <Link to="/tea-rooms" className="plain-link">
            View all <span>→</span>
          </Link>
        </div>
        <div className="room-table">
          <div className="table-head">
            <span>PUBLICATION</span>
            <span>RHYTHM</span>
            <span>SIPS</span>
            <span>STATUS</span>
            <span>UPDATED</span>
          </div>
          {rooms.length ? (
            rooms.map((room) => (
              <Link className="table-row" to={`/tea-rooms/${room.id}`} key={room.id}>
                <span className="table-name">
                  <i className="room-glyph">✳</i>
                  <span>
                    <b>{room.name}</b>
                    <small>/{room.slug}</small>
                  </span>
                </span>
                <span>{room.frequency}</span>
                <span>{room.sips.length}</span>
                <span>
                  <StatusPill status={room.status} />
                </span>
                <span>{dateLabel(room.updatedAt)}</span>
              </Link>
            ))
          ) : dashboard ? (
            <p className="table-empty">
              No Tea Rooms yet. Create your first publication to get started.
            </p>
          ) : null}
        </div>
      </section>
      <section className="dashboard-lower">
        <article className="onboarding-card">
          <span className="onboarding-icon">✳</span>
          <p className="eyebrow">A NOTE FOR YOUR NEXT POUR</p>
          <h3>Good newsletters start with a point of view.</h3>
          <p>
            Give each Tea Room a clear audience, a steady rhythm, and Sips that earn a place in
            someone’s inbox.
          </p>
          <Link className="plain-link" to="/tea-rooms/new">
            Start with a Tea Room <span>→</span>
          </Link>
        </article>
        <article className="queue-card">
          <p className="eyebrow">THE WORK AHEAD</p>
          <h3>Review queue</h3>
          <div className="queue-stat">
            <span>Waiting for a Taste Test</span>
            <b>{dashboard?.awaitingApproval ?? "—"}</b>
          </div>
          <div className="queue-stat">
            <span>Next scheduled Teas</span>
            <b>{dashboard?.scheduledIssues ?? "—"}</b>
          </div>
          <div className="queue-stat">
            <span>Brew errors</span>
            <b>{dashboard?.generationFailures ?? "—"}</b>
          </div>
        </article>
      </section>
    </div>
  );
}

function TeaRoomsPage() {
  const [rooms, setRooms] = useState<ManagedTeaRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ teaRooms: ManagedTeaRoom[] }>("/admin/tea-rooms")
      .then((result) => setRooms(result.teaRooms))
      .catch((reason: unknown) => setError(messageOf(reason)))
      .finally(() => setLoading(false));
  }, []);
  const visibleRooms = filter === "all" ? rooms : rooms.filter((room) => room.status === filter);
  return (
    <div className="page-content">
      <div className="page-title-row compact-title">
        <div>
          <p className="eyebrow">PUBLICATION CONFIGURATION</p>
          <h1>Tea Rooms</h1>
          <p className="page-subtitle">Shape each room’s voice, rhythm, and collection of Sips.</p>
        </div>
        <Link className="admin-button primary" to="/tea-rooms/new">
          ＋ New Tea Room
        </Link>
      </div>
      <div className="list-toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Filter Tea Rooms">
          {["all", "draft", "active", "paused", "archived"].map((item) => (
            <button
              className={filter === item ? "selected" : ""}
              key={item}
              onClick={() => setFilter(item)}
            >
              {titleCase(item)}
              {item === "all" && <span>{rooms.length}</span>}
            </button>
          ))}
        </div>
      </div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {loading ? (
        <div className="metric-loading">Loading Tea Rooms…</div>
      ) : visibleRooms.length ? (
        <div className="room-list">
          {visibleRooms.map((room, index) => (
            <article className="room-list-card" key={room.id}>
              <div className={`room-list-symbol shade-${index % 4}`}>✳</div>
              <div className="room-list-main">
                <div className="room-list-title">
                  <div>
                    <h2>{room.name}</h2>
                    <span>
                      /{room.slug} · {room.category}
                    </span>
                  </div>
                  <StatusPill status={room.status} />
                </div>
                <p>{room.description}</p>
                <div className="room-list-meta">
                  <span>{room.sips.length} Sips</span>
                  <span>
                    {room.frequency} · {room.timezone}
                  </span>
                  <span>Updated {dateLabel(room.updatedAt)}</span>
                </div>
              </div>
              <Link
                className="row-arrow"
                to={`/tea-rooms/${room.id}`}
                aria-label={`Edit ${room.name}`}
              >
                →
              </Link>
            </article>
          ))}
        </div>
      ) : !error ? (
        <div className="admin-empty">
          <span>◉</span>
          <h2>No {filter === "all" ? "Tea Rooms" : `${filter} Tea Rooms`} yet</h2>
          <p>Start by giving your first publication a name, a voice, and its own pour schedule.</p>
          <Link className="admin-button primary" to="/tea-rooms/new">
            Create a Tea Room
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function TeaRoomEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [room, setRoom] = useState<ManagedTeaRoom | null>(null);
  const [form, setForm] = useState<RoomInput>(emptyRoom());
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingSip, setEditingSip] = useState<AdminSip | "new" | null>(null);

  async function refresh() {
    if (!id || isNew) return;
    const result = await api<{ teaRoom: ManagedTeaRoom }>(`/admin/tea-rooms/${id}`);
    const loaded = result.teaRoom;
    setRoom(loaded);
    setForm({
      name: loaded.name,
      slug: loaded.slug,
      description: loaded.description,
      category: loaded.category,
      topics: loaded.topics,
      audience: loaded.audience,
      coverImage: loaded.coverImage,
      editorialVoice: loaded.editorialVoice,
      frequency: loaded.frequency,
      timezone: loaded.timezone,
      schedule: loaded.schedule,
      defaultResearchSettings: loaded.defaultResearchSettings,
      emailTemplate: loaded.emailTemplate,
      isPublic: loaded.isPublic,
    });
  }

  useEffect(() => {
    if (!isNew)
      void refresh()
        .catch((reason: unknown) => setError(messageOf(reason)))
        .finally(() => setLoading(false));
  }, [id]);

  function update<K extends keyof RoomInput>(key: K, value: RoomInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setSchedulePoint(
    point: "generation" | "reviewDeadline" | "delivery",
    value: SchedulePoint,
  ) {
    setForm((current) => ({ ...current, schedule: { ...current.schedule, [point]: value } }));
  }

  function setFrequency(frequency: RoomInput["frequency"]) {
    const days =
      form.frequency === "weekly"
        ? [
            form.schedule.generation.weekday ?? "Friday",
            form.schedule.reviewDeadline.weekday ?? "Saturday",
            form.schedule.delivery.weekday ?? "Sunday",
          ]
        : ["Friday", "Saturday", "Sunday"];
    const dates =
      form.frequency === "monthly"
        ? [
            form.schedule.generation.dayOfMonth ?? 5,
            form.schedule.reviewDeadline.dayOfMonth ?? 6,
            form.schedule.delivery.dayOfMonth ?? 7,
          ]
        : [5, 6, 7];
    setForm((current) => ({
      ...current,
      frequency,
      schedule: {
        generation:
          frequency === "daily"
            ? { time: current.schedule.generation.time }
            : frequency === "weekly"
              ? { time: current.schedule.generation.time, weekday: days[0]! }
              : { time: current.schedule.generation.time, dayOfMonth: dates[0]! },
        reviewDeadline:
          frequency === "daily"
            ? { time: current.schedule.reviewDeadline.time }
            : frequency === "weekly"
              ? { time: current.schedule.reviewDeadline.time, weekday: days[1]! }
              : { time: current.schedule.reviewDeadline.time, dayOfMonth: dates[1]! },
        delivery:
          frequency === "daily"
            ? { time: current.schedule.delivery.time }
            : frequency === "weekly"
              ? { time: current.schedule.delivery.time, weekday: days[2]! }
              : { time: current.schedule.delivery.time, dayOfMonth: dates[2]! },
      },
    }));
  }

  async function saveRoom(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ teaRoom: ManagedTeaRoom }>(
        isNew ? "/admin/tea-rooms" : `/admin/tea-rooms/${id}`,
        {
          method: isNew ? "POST" : "PATCH",
          body: JSON.stringify(form),
        },
      );
      setRoom(result.teaRoom);
      setForm((current) => ({ ...current, slug: result.teaRoom.slug }));
      setNotice("Tea Room configuration saved.");
      if (isNew) navigate(`/tea-rooms/${result.teaRoom.id}`, { replace: true });
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setSaving(false);
    }
  }

  async function statusAction(action: "activate" | "pause" | "archive") {
    if (!room) return;
    setError("");
    try {
      const result = await api<{ teaRoom: ManagedTeaRoom }>(
        `/admin/tea-rooms/${room.id}/${action}`,
        { method: "POST" },
      );
      setRoom(result.teaRoom);
      setNotice(
        action === "activate"
          ? "Tea Room is now active."
          : action === "pause"
            ? "Tea Room paused."
            : "Tea Room archived.",
      );
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function saveSip(input: SipInput, sip: AdminSip | "new") {
    if (!room) return;
    setError("");
    try {
      if (sip === "new")
        await api(`/admin/tea-rooms/${room.id}/sips`, {
          method: "POST",
          body: JSON.stringify(input),
        });
      else await api(`/admin/sips/${sip.id}`, { method: "PATCH", body: JSON.stringify(input) });
      await refresh();
      setEditingSip(null);
      setNotice(sip === "new" ? "Sip added." : "Sip updated.");
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function sipAction(action: "duplicate" | "delete", sip: AdminSip) {
    if (!room) return;
    try {
      if (action === "duplicate") await api(`/admin/sips/${sip.id}/duplicate`, { method: "POST" });
      else await api(`/admin/sips/${sip.id}`, { method: "DELETE" });
      await refresh();
      setNotice(action === "duplicate" ? "Sip duplicated." : "Sip removed.");
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  async function moveSip(index: number, direction: -1 | 1) {
    if (!room) return;
    const ordered = [...room.sips];
    const other = index + direction;
    if (other < 0 || other >= ordered.length) return;
    [ordered[index], ordered[other]] = [ordered[other]!, ordered[index]!];
    try {
      await api(`/admin/tea-rooms/${room.id}/sips/order`, {
        method: "PUT",
        body: JSON.stringify({ sipIds: ordered.map((sip) => sip.id) }),
      });
      await refresh();
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  const sourceList = useMemo(
    () =>
      SOURCE_TYPES.map((type) => ({
        type,
        enabled: form.defaultResearchSettings.sources.some((source) => source.type === type),
      })),
    [form.defaultResearchSettings.sources],
  );
  if (loading)
    return (
      <div className="page-content">
        <div className="metric-loading">Loading configuration…</div>
      </div>
    );
  if (!isNew && !room)
    return (
      <div className="page-content">
        <InlineNotice tone="error">{error || "Tea Room not found."}</InlineNotice>
        <Link className="plain-link" to="/tea-rooms">
          ← Tea Rooms
        </Link>
      </div>
    );

  return (
    <div className="page-content editor-page">
      <div className="editor-breadcrumb">
        <Link to="/tea-rooms">Tea Rooms</Link>
        <span>/</span>
        <b>{isNew ? "New Tea Room" : room?.name}</b>
      </div>
      <div className="editor-title-row">
        <div>
          <p className="eyebrow">{isNew ? "NEW PUBLICATION" : "TEA ROOM CONFIGURATION"}</p>
          <h1>{isNew ? "Create a Tea Room" : room?.name}</h1>
          <p className="page-subtitle">
            Set the point of view, pour schedule, and Sips that make this room yours.
          </p>
        </div>
        {room && <StatusPill status={room.status} />}
      </div>
      {error && <InlineNotice tone="error">{error}</InlineNotice>}
      {notice && <InlineNotice tone="success">{notice}</InlineNotice>}
      {room && (
        <div className="editor-toolbar">
          <span>Last saved {dateLabel(room.updatedAt)}</span>
          <div className="toolbar-actions">
            <a
              className="admin-button quiet"
              href={`${READER_APP_URL}/tea-rooms/${form.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Preview reader page ↗
            </a>
            {room.status === "draft" || room.status === "paused" ? (
              <button
                className="admin-button primary"
                onClick={() => void statusAction("activate")}
              >
                Activate
              </button>
            ) : room.status === "active" ? (
              <button className="admin-button secondary" onClick={() => void statusAction("pause")}>
                Pause room
              </button>
            ) : null}
            {room.status !== "archived" && (
              <button
                className="admin-button danger-quiet"
                onClick={() => void statusAction("archive")}
              >
                Archive
              </button>
            )}
          </div>
        </div>
      )}
      <form onSubmit={(event) => void saveRoom(event)}>
        <div className="editor-grid">
          <div className="editor-column">
            <section className="editor-card">
              <CardHeading
                number="01"
                title="The room"
                description="Give your publication a name, a home, and a clear reason to exist."
              />
              <div className="field-grid two">
                <label className="field-label">
                  Tea Room name
                  <input
                    maxLength={120}
                    required
                    value={form.name}
                    onChange={(event) => {
                      const name = event.target.value;
                      setForm((current) => ({
                        ...current,
                        name,
                        ...(isNew && !current.slug ? { slug: slugify(name) } : {}),
                      }));
                    }}
                  />
                </label>
                <label className="field-label">
                  URL slug
                  <input
                    maxLength={120}
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    value={form.slug}
                    onChange={(event) => update("slug", slugify(event.target.value))}
                  />
                  <small>Lowercase letters, numbers, and hyphens.</small>
                </label>
              </div>
              <label className="field-label">
                Description
                <textarea
                  required
                  maxLength={2000}
                  rows={3}
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  placeholder="What will readers find in this Tea Room?"
                />
              </label>
              <div className="field-grid two">
                <label className="field-label">
                  Category
                  <input
                    required
                    maxLength={80}
                    value={form.category}
                    onChange={(event) => update("category", event.target.value)}
                  />
                </label>
                <label className="field-label">
                  Topics
                  <input
                    value={form.topics.join(", ")}
                    onChange={(event) =>
                      update(
                        "topics",
                        event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean)
                          .slice(0, 30),
                      )
                    }
                    placeholder="AI, engineering, culture"
                  />
                  <small>Separate topics with commas.</small>
                </label>
              </div>
              <label className="field-label">
                Audience
                <textarea
                  rows={2}
                  maxLength={500}
                  value={form.audience}
                  onChange={(event) => update("audience", event.target.value)}
                  placeholder="Who is this publication for?"
                />
              </label>
              <label className="field-label">
                Cover image URL
                <input
                  type="url"
                  value={form.coverImage}
                  onChange={(event) => update("coverImage", event.target.value)}
                  placeholder="https://…"
                />
              </label>
            </section>

            <section className="editor-card">
              <CardHeading
                number="02"
                title="Editorial voice"
                description="The perspective should stay consistent even as each Sip covers a different subject."
              />
              <label className="field-label">
                Voice and style
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={form.editorialVoice}
                  onChange={(event) => update("editorialVoice", event.target.value)}
                  placeholder="Clear, curious, and generous with context. Write for a smart reader who is short on time…"
                />
              </label>
              <div className="check-setting">
                <label>
                  <input
                    type="checkbox"
                    checked={form.isPublic}
                    onChange={(event) => update("isPublic", event.target.checked)}
                  />
                  <span>
                    <b>Visible in public discovery</b>
                    <small>Readers can browse and follow this Tea Room when it’s active.</small>
                  </span>
                </label>
              </div>
            </section>

            <section className="editor-card">
              <CardHeading
                number="03"
                title="The pour schedule"
                description="Set local generation, review, and delivery times. The review always happens before serving."
              />
              <div className="field-grid two">
                <label className="field-label">
                  Frequency
                  <select
                    value={form.frequency}
                    onChange={(event) => setFrequency(event.target.value as RoomInput["frequency"])}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </label>
                <label className="field-label">
                  IANA timezone
                  <select
                    value={form.timezone}
                    onChange={(event) => update("timezone", event.target.value)}
                  >
                    {TIMEZONES.map((zone) => (
                      <option key={zone}>{zone}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="schedule-grid">
                {(["generation", "reviewDeadline", "delivery"] as const).map((key) => (
                  <ScheduleEditor
                    key={key}
                    label={
                      key === "generation"
                        ? "Generate"
                        : key === "reviewDeadline"
                          ? "Review by"
                          : "Deliver"
                    }
                    point={form.schedule[key]}
                    frequency={form.frequency}
                    onChange={(value) => setSchedulePoint(key, value)}
                  />
                ))}
              </div>
              <p className="schedule-footnote">
                All times use {form.timezone}. Weekly days and monthly dates are ordered to keep
                review ahead of delivery.
              </p>
            </section>

            <section className="editor-card">
              <CardHeading
                number="04"
                title="Default research"
                description="These source settings are offered to Sips as a starting point."
              />
              <div className="source-options">
                {sourceList.map(({ type, enabled }) => (
                  <label className="source-option" key={type}>
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => {
                        const existing = form.defaultResearchSettings.sources;
                        const sources = event.target.checked
                          ? [...existing, { type, enabled: true }]
                          : existing.filter((source) => source.type !== type);
                        update("defaultResearchSettings", {
                          ...form.defaultResearchSettings,
                          sources,
                        });
                      }}
                    />
                    <span>{sourceLabel(type)}</span>
                  </label>
                ))}
              </div>
              <label className="field-label range-field">
                Default research time range{" "}
                <span>{form.defaultResearchSettings.timeRangeDays} days</span>
                <input
                  type="range"
                  min="1"
                  max="90"
                  value={form.defaultResearchSettings.timeRangeDays}
                  onChange={(event) =>
                    update("defaultResearchSettings", {
                      ...form.defaultResearchSettings,
                      timeRangeDays: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field-label">
                Email template identifier
                <input
                  maxLength={120}
                  value={form.emailTemplate}
                  onChange={(event) => update("emailTemplate", event.target.value)}
                />
              </label>
            </section>

            <div className="save-bar">
              <span>
                {room ? `Status: ${titleCase(room.status)}` : "A new Tea Room starts as a draft."}
              </span>
              <div>
                <Link className="admin-button quiet" to="/tea-rooms">
                  Cancel
                </Link>
                <button className="admin-button primary" disabled={saving}>
                  {saving ? "Saving…" : isNew ? "Create Tea Room" : "Save configuration"}
                </button>
              </div>
            </div>
          </div>
          <aside className="editor-aside">
            <section className="preview-card">
              <p className="eyebrow">FIRST SIP PREVIEW</p>
              <div className="preview-art">
                <span>✳</span>
                <small>{form.category || "CATEGORY"}</small>
              </div>
              <div className="preview-body">
                <h2>{form.name || "Your Tea Room"}</h2>
                <p>
                  {form.description || "Your room description will show here as readers explore."}
                </p>
                <div className="preview-topics">
                  {form.topics.length ? (
                    form.topics.slice(0, 4).map((topic) => <span key={topic}>{topic}</span>)
                  ) : (
                    <span>Topics</span>
                  )}
                </div>
                <div className="preview-footer">
                  <span>{form.frequency} pour</span>
                  <span>{room?.sips.length ?? 0} Sips</span>
                </div>
              </div>
            </section>
            <section className="checklist-card">
              <p className="eyebrow">BEFORE YOU ACTIVATE</p>
              <h3>Make it ready for readers.</h3>
              <ChecklistRow
                complete={Boolean(form.name && form.slug && form.description)}
                text="Name, URL, and description"
              />
              <ChecklistRow complete={Boolean(form.editorialVoice)} text="Editorial voice" />
              <ChecklistRow complete={Boolean(room?.sips.length)} text="At least one Sip" />
              <ChecklistRow
                complete={Boolean(
                  form.schedule.generation.time &&
                  form.schedule.reviewDeadline.time &&
                  form.schedule.delivery.time,
                )}
                text="Pour and review schedule"
              />
              <p>Rooms need at least one Sip before they can be activated.</p>
            </section>
          </aside>
        </div>
      </form>

      {room && (
        <section className="sips-builder" aria-labelledby="sips-title">
          <div className="sip-builder-heading">
            <div>
              <p className="eyebrow">05 · SECTION CONFIGURATION</p>
              <h2 id="sips-title">
                Build the <em>Sips.</em>
              </h2>
              <p>
                Each Sip researches and writes independently. Arrange them in the order readers will
                see.
              </p>
            </div>
            <button
              className="admin-button primary"
              disabled={room.status === "archived"}
              onClick={() => setEditingSip("new")}
            >
              ＋ Add Sip
            </button>
          </div>
          {room.sips.length ? (
            <div className="sip-builder-list">
              {room.sips.map((sip, index) => (
                <article className="admin-sip-card" key={sip.id}>
                  <div className="sip-order-controls">
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <button
                      onClick={() => void moveSip(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${sip.title} up`}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => void moveSip(index, 1)}
                      disabled={index === room.sips.length - 1}
                      aria-label={`Move ${sip.title} down`}
                    >
                      ↓
                    </button>
                  </div>
                  <div className="admin-sip-content">
                    <div className="sip-card-title">
                      <div>
                        <h3>{sip.title}</h3>
                        <p>{sip.description}</p>
                      </div>
                      <span className="type-tag">{titleCase(sip.type.replaceAll("_", " "))}</span>
                    </div>
                    <div className="sip-card-meta">
                      <span>{sip.itemCount} items</span>
                      <span>{sip.timeRangeDays} day research window</span>
                      <span>
                        {sip.researchSources.filter((source) => source.enabled).length} sources
                      </span>
                      <span>{titleCase(sip.contentLength)} read</span>
                    </div>
                    <div className="sip-card-instructions">{sip.instructions}</div>
                  </div>
                  <div className="sip-card-actions">
                    <button onClick={() => setEditingSip(sip)}>Edit</button>
                    <button onClick={() => void sipAction("duplicate", sip)}>Duplicate</button>
                    <button className="remove-action" onClick={() => void sipAction("delete", sip)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="sips-empty">
              <span>✳</span>
              <div>
                <h3>This room is waiting for its first Sip.</h3>
                <p>Start with a ranked list, a news roundup, or something entirely your own.</p>
              </div>
              <button className="admin-button secondary" onClick={() => setEditingSip("new")}>
                Add the first Sip
              </button>
            </div>
          )}
        </section>
      )}
      {editingSip && room && (
        <SipEditor
          sip={editingSip === "new" ? null : editingSip}
          onCancel={() => setEditingSip(null)}
          onSave={(input) => void saveSip(input, editingSip)}
        />
      )}
    </div>
  );
}

function ScheduleEditor({
  label,
  point,
  frequency,
  onChange,
}: {
  label: string;
  point: SchedulePoint;
  frequency: RoomInput["frequency"];
  onChange(value: SchedulePoint): void;
}) {
  return (
    <div className="schedule-point">
      <span>{label}</span>
      {frequency === "weekly" ? (
        <select
          aria-label={`${label} weekday`}
          value={point.weekday ?? "Monday"}
          onChange={(event) => onChange({ ...point, weekday: event.target.value })}
        >
          {WEEKDAYS.map((day) => (
            <option key={day}>{day}</option>
          ))}
        </select>
      ) : frequency === "monthly" ? (
        <select
          aria-label={`${label} day of month`}
          value={point.dayOfMonth ?? 1}
          onChange={(event) => onChange({ ...point, dayOfMonth: Number(event.target.value) })}
        >
          {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
            <option value={day} key={day}>
              {ordinal(day)}
            </option>
          ))}
        </select>
      ) : (
        <small>Every day</small>
      )}
      <input
        type="time"
        aria-label={`${label} time`}
        value={point.time}
        onChange={(event) => onChange({ ...point, time: event.target.value })}
      />
    </div>
  );
}

function SipEditor({
  sip,
  onCancel,
  onSave,
}: {
  sip: AdminSip | null;
  onCancel(): void;
  onSave(input: SipInput): void;
}) {
  const [title, setTitle] = useState(sip?.title ?? "");
  const [description, setDescription] = useState(sip?.description ?? "");
  const [type, setType] = useState(sip?.type ?? "latest_news");
  const [itemCount, setItemCount] = useState(sip?.itemCount ?? 5);
  const [instructions, setInstructions] = useState(sip?.instructions ?? "");
  const [sources, setSources] = useState(
    sip?.researchSources ?? [{ type: "web_search", enabled: true }],
  );
  const [timeRangeDays, setTimeRangeDays] = useState(sip?.timeRangeDays ?? 7);
  const [writingStyle, setWritingStyle] = useState(sip?.writingStyle ?? "Clear and curious");
  const [contentLength, setContentLength] = useState<SipInput["contentLength"]>(
    sip?.contentLength ?? "medium",
  );
  const [outputSchemaText, setOutputSchemaText] = useState(
    sip?.outputSchema ? JSON.stringify(sip.outputSchema, null, 2) : "{}",
  );
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const outputSchema = JSON.parse(outputSchemaText) as unknown;
      if (typeof outputSchema !== "object" || outputSchema === null || Array.isArray(outputSchema))
        throw new Error("Output schema must be a JSON object.");
      onSave({
        title,
        description,
        type,
        itemCount,
        instructions,
        researchSources: sources,
        timeRangeDays,
        writingStyle,
        contentLength,
        outputSchema: outputSchema as Record<string, unknown>,
      });
    } catch (reason) {
      setError(messageOf(reason));
    }
  }

  function toggleSource(sourceType: string, enabled: boolean) {
    const next = sources.filter((source) => source.type !== sourceType);
    if (enabled) next.push({ type: sourceType, enabled: true });
    setSources(next);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className="sip-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sip-modal-title"
      >
        <div className="modal-heading">
          <div>
            <p className="eyebrow">SIP BUILDER</p>
            <h2 id="sip-modal-title">{sip ? "Edit Sip" : "Add a Sip"}</h2>
          </div>
          <button className="icon-button" onClick={onCancel} aria-label="Close editor">
            ×
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="field-grid two">
            <label className="field-label">
              Sip title
              <input
                required
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="field-label">
              Section type
              <select value={type} onChange={(event) => setType(event.target.value)}>
                {SIP_TYPES.map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field-label">
            Description
            <textarea
              required
              maxLength={2000}
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What should this Sip cover?"
            />
          </label>
          <label className="field-label">
            Research and writing instructions
            <textarea
              required
              maxLength={5000}
              rows={4}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Describe what to look for, how to rank it, and what makes a useful item…"
            />
          </label>
          <div className="field-grid three">
            <label className="field-label">
              Number of items
              <input
                type="number"
                min={1}
                max={20}
                value={itemCount}
                onChange={(event) => setItemCount(Number(event.target.value))}
              />
            </label>
            <label className="field-label">
              Look back (days)
              <input
                type="number"
                min={1}
                max={365}
                value={timeRangeDays}
                onChange={(event) => setTimeRangeDays(Number(event.target.value))}
              />
            </label>
            <label className="field-label">
              Content length
              <select
                value={contentLength}
                onChange={(event) =>
                  setContentLength(event.target.value as SipInput["contentLength"])
                }
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
                <option value="long">Long</option>
              </select>
            </label>
          </div>
          <label className="field-label">
            Writing style
            <input
              maxLength={500}
              value={writingStyle}
              onChange={(event) => setWritingStyle(event.target.value)}
            />
          </label>
          <div className="field-label source-config">
            <span>Research sources</span>
            <div className="source-options">
              {SOURCE_TYPES.map((sourceType) => (
                <label className="source-option" key={sourceType}>
                  <input
                    type="checkbox"
                    checked={sources.some((source) => source.type === sourceType && source.enabled)}
                    onChange={(event) => toggleSource(sourceType, event.target.checked)}
                  />
                  <span>{sourceLabel(sourceType)}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="field-label">
            Output schema <small>JSON object describing the structured content you expect.</small>
            <textarea
              className="schema-editor"
              spellCheck={false}
              rows={7}
              value={outputSchemaText}
              onChange={(event) => setOutputSchemaText(event.target.value)}
            />
          </label>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          <div className="modal-actions">
            <button type="button" className="admin-button quiet" onClick={onCancel}>
              Cancel
            </button>
            <button className="admin-button primary">{sip ? "Save Sip" : "Add Sip"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CardHeading({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card-heading">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ChecklistRow({ complete, text }: { complete: boolean; text: string }) {
  return (
    <div className={`checklist-row ${complete ? "complete" : ""}`}>
      <span>{complete ? "✓" : "○"}</span>
      {text}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill status-${status}`}>
      <i />
      {titleCase(status)}
    </span>
  );
}

function InlineNotice({ children, tone }: { children: ReactNode; tone: "error" | "success" }) {
  return (
    <p className={`inline-notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </p>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function sourceLabel(source: string) {
  return (
    {
      web_search: "Web search",
      rss: "RSS feeds",
      github: "GitHub",
      hacker_news: "Hacker News",
      hugging_face: "Hugging Face",
    }[source] ?? source
  );
}
function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}
function ordinal(day: number) {
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";
  return `${day}${suffix}`;
}
