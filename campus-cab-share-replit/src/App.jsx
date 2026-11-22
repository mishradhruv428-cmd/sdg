import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Campus Cab Share — Supabase-connected app shell and Rides screen.
// Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local
// or the Replit Secrets panel. Database setup is in supabase/schema.sql.
// Never put a service-role key in browser code. Row-level security in the
// SQL schema protects student contacts and ride ownership.
//
// File layout:
//   1. Settings     (Supabase connection + campus destinations)
//   2. Helpers      (formatting, route, fare, filters)
//   3. Icons
//   4. Ride list    (filters, cards, empty state)
//   5. Other tabs   (Post, My rides, Impact placeholders)
//   6. Auth         (sign-in, sign-up, profile setup)
//   7. App shell    (auth gate, database reads, navigation)

/* ------------------------------------------------------------------ */
/* 1. Settings                                                         */
/* ------------------------------------------------------------------ */

// Vite exposes only VITE_-prefixed variables in browser code. Use the public
// publishable key with RLS; never use a Supabase secret/service-role key here.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
const supabase = SUPABASE_CONFIGURED
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const CAMPUS = "Bennett University";
const UNIVERSITY_EMAIL_SUFFIX = "@bennett.edu.in";

// Distance is in km from campus. "Other" has no fixed distance.
const DESTINATIONS = [
  { id: "pari-chowk", name: "Pari Chowk metro station", km: 8 },
  { id: "noida-sector-18", name: "Noida Sector 18", km: 33 },
  { id: "botanical-garden", name: "Botanical Garden metro station", km: 35 },
  { id: "anand-vihar", name: "Anand Vihar", km: 40 },
  { id: "new-delhi-station", name: "New Delhi railway station", km: 50 },
  { id: "igi-airport", name: "IGI Airport Delhi", km: 65 },
  { id: "other", name: "Other", km: null },
];


/* ------------------------------------------------------------------ */
/* 2. Helpers                                                          */
/* ------------------------------------------------------------------ */

function getDestination(id) {
  return DESTINATIONS.find((destination) => destination.id === id);
}

// Returns the two place names in travel order.
function getRoute(ride) {
  const destination = getDestination(ride.destinationId);
  // A ride to "Other" can carry its own place name in ride.placeName.
  const place = ride.placeName || (destination ? destination.name : "Other");
  return { from: ride.from, to: place };
}

function getSeatsLeft(ride) {
  return Math.max(ride.seatsTotal - ride.seatsTaken, 0);
}

// Cost per person if every seat is filled: the estimated total fare split
// between the poster and all offered seats (fare divided by seats + 1).
function getCostPerPerson(ride) {
  return Math.round(ride.fare / (ride.seatsTotal + 1));
}

// 1600 -> "₹1,600"
function formatRupees(amount) {
  return "₹" + amount.toLocaleString("en-IN");
}

function formatDate(date) {
  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatTime(date) {
  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// "2025-06-14" in local time, the same format a date input uses.
function toDateKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function getInitials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// Upcoming rides that match the filters, soonest first.
// Cancelled and completed rides are not shown on the home screen.
function getVisibleRides(rides, filters) {
  const now = new Date();
  return rides
    .filter((ride) => ride.status === "open" || ride.status === "full")
    .filter((ride) => ride.departAt > now)
    .filter(
      (ride) =>
        filters.destinationId === "all" ||
        ride.destinationId === filters.destinationId
    )
    .filter((ride) => !filters.date || toDateKey(ride.departAt) === filters.date)
    .sort((a, b) => a.departAt - b.departAt);
}

/* ------------------------------------------------------------------ */
/* 3. Icons                                                            */
/* ------------------------------------------------------------------ */

function Icon({ children, className = "h-6 w-6" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

function CarIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7a2 2 0 0 1 1.9 1.3L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="2" />
      <path d="M6 17v2M18 17v2" />
      <path d="M7 14h.01M17 14h.01" />
    </Icon>
  );
}

function PlusIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </Icon>
  );
}

function TicketIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h13A1.5 1.5 0 0 1 20 7.5V10a2 2 0 0 0 0 4v2.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 16.5V14a2 2 0 0 0 0-4z" />
      <path d="M14 6v12" strokeDasharray="2 2.5" />
    </Icon>
  );
}

function LeafIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 19c0-8 5-13 15-14 0 9-4 14-11 14a6 6 0 0 1-4-1.5" />
      <path d="M5 19c2-4 5-7 9-9" />
    </Icon>
  );
}

function CalendarIcon(props) {
  return (
    <Icon {...props}>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16" />
    </Icon>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Ride list                                                        */
/* ------------------------------------------------------------------ */

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2";

const FIELD =
  "h-12 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 " +
  FOCUS_RING;

function PostRideButton({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-11 items-center justify-center rounded-full bg-green-700 px-5 text-base font-semibold text-white transition-colors hover:bg-green-800 " +
        FOCUS_RING
      }
    >
      Post a ride
    </button>
  );
}

function Filters({ filters, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block min-w-0">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          Destination
        </span>
        <select
          value={filters.destinationId}
          onChange={(event) =>
            onChange({ ...filters, destinationId: event.target.value })
          }
          className={FIELD}
        >
          <option value="all">All destinations</option>
          {DESTINATIONS.map((destination) => (
            <option key={destination.id} value={destination.id}>
              {destination.name}
              {destination.km ? ` (${destination.km} km)` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block min-w-0">
        <span className="mb-1.5 block text-sm font-medium text-slate-600">
          Date
        </span>
        <input
          type="date"
          value={filters.date}
          min={toDateKey(new Date())}
          onChange={(event) => onChange({ ...filters, date: event.target.value })}
          className={FIELD}
        />
      </label>
    </div>
  );
}

// The dot-line-dot marker beside the two place names.
function RouteMarker() {
  return (
    <div className="flex flex-col items-center py-1.5" aria-hidden="true">
      <span className="h-3 w-3 rounded-full border-2 border-slate-400 bg-white" />
      <span className="w-px flex-1 bg-slate-300" />
      <span className="h-3 w-3 rounded-full bg-green-700" />
    </div>
  );
}

function RideCard({ ride }) {
  const { from, to } = getRoute(ride);
  const seatsLeft = getSeatsLeft(ride);
  const cost = getCostPerPerson(ride);

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      {/* Route and cost */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <RouteMarker />
          <div className="min-w-0">
            <p className="text-base font-semibold leading-6 text-slate-900">
              <span className="sr-only">From </span>
              {from}
            </p>
            <p className="mt-2 text-base font-semibold leading-6 text-slate-900">
              <span className="sr-only">to </span>
              {to}
            </p>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xl font-semibold leading-6 text-slate-900">
            {formatRupees(cost)}
          </p>
          <p className="mt-1 text-xs leading-4 text-slate-500">
            per person if full
          </p>
        </div>
      </div>

      {/* Date, time and label */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-slate-700">
          <CalendarIcon className="h-4 w-4 text-slate-500" />
          <span>
            {formatDate(ride.departAt)} · {formatTime(ride.departAt)}
          </span>
        </p>
        {ride.womenOnly && (
          <span className="rounded-full border border-slate-300 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            Women only
          </span>
        )}
      </div>

      {/* Posted by and seats */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-800"
            aria-hidden="true"
          >
            {getInitials(ride.postedBy)}
          </span>
          <p className="truncate text-sm text-slate-700">
            <span className="sr-only">Posted by </span>
            {ride.postedBy}
          </p>
        </div>
        <p
          className={
            "shrink-0 text-sm font-semibold " +
            (seatsLeft > 0 ? "text-green-700" : "text-slate-500")
          }
        >
          {seatsLeft > 0
            ? `${seatsLeft} of ${ride.seatsTotal} seats left`
            : "Full"}
        </p>
      </div>
    </li>
  );
}

function EmptyState({ onPost }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700">
        <CarIcon />
      </span>
      <p className="mt-4 text-base font-semibold text-slate-900">
        No rides yet. Post the first one.
      </p>
      <div className="mt-5">
        <PostRideButton onClick={onPost} />
      </div>
    </div>
  );
}

function RidesScreen({ rides, onPost, loading }) {
  const [filters, setFilters] = useState({ destinationId: "all", date: "" });

  const visibleRides = getVisibleRides(rides, filters);
  const hasFilters = filters.destinationId !== "all" || filters.date !== "";

  return (
    <div>
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-green-700">Campus Cab Share</p>
          <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">Rides</h1>
        </div>
        <PostRideButton onClick={onPost} />
      </header>

      <section className="mt-6" aria-label="Filters">
        <Filters filters={filters} onChange={setFilters} />
      </section>

      <section className="mt-6" aria-label="Upcoming rides">
        <div className="mb-1 flex min-h-[2.75rem] items-center justify-between">
          <p className="text-sm text-slate-600" aria-live="polite">
            {loading
              ? "Loading available rides…"
              : visibleRides.length === 1
                ? "1 upcoming ride"
                : `${visibleRides.length} upcoming rides`}
          </p>
          {hasFilters && (
            <button
              type="button"
              onClick={() => setFilters({ destinationId: "all", date: "" })}
              className={
                "-mr-2 h-11 rounded-md px-2 text-sm font-semibold text-green-700 hover:text-green-800 " +
                FOCUS_RING
              }
            >
              Clear filters
            </button>
          )}
        </div>

        {loading ? (
          <div role="status" className="rounded-2xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-600">
            Loading rides from the database…
          </div>
        ) : visibleRides.length > 0 ? (
          <ul className="space-y-3">
            {visibleRides.map((ride) => (
              <RideCard key={ride.id} ride={ride} />
            ))}
          </ul>
        ) : (
          <EmptyState onPost={onPost} />
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Other tabs (placeholders, to be built step by step)              */
/* ------------------------------------------------------------------ */

function PlaceholderScreen({ title, text }) {
  return (
    <div>
      <header>
        <p className="text-sm font-medium text-green-700">Campus Cab Share</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">{title}</h1>
      </header>
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
        <p className="text-base text-slate-700">{text}</p>
        <p className="mt-2 text-sm text-slate-500">Coming in a later step.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. App shell                                                        */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { id: "rides", label: "Rides", IconComponent: CarIcon },
  { id: "post", label: "Post", IconComponent: PlusIcon },
  { id: "my-rides", label: "My rides", IconComponent: TicketIcon },
  { id: "impact", label: "Impact", IconComponent: LeafIcon },
];

function BottomNav({ activeTab, onChange }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-md border-t border-slate-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {NAV_ITEMS.map(({ id, label, IconComponent }) => {
          const isActive = id === activeTab;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-current={isActive ? "page" : undefined}
                className={
                  "flex h-16 w-full flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-700 " +
                  (isActive
                    ? "text-green-700"
                    : "text-slate-500 hover:text-slate-800")
                }
              >
                <IconComponent />
                <span className={isActive ? "font-semibold" : ""}>{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function ConfigScreen() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-green-700">Campus Cab Share</p>
        <h1 className="mt-2 text-2xl font-semibold">Connect Supabase</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Supabase environment variables are missing. Add VITE_SUPABASE_URL and
          VITE_SUPABASE_PUBLISHABLE_KEY to .env.local or Replit Secrets, then restart the app.
        </p>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
          <p className="font-semibold">Setup checklist</p>
          <ol className="mt-2 list-inside list-decimal space-y-1.5">
            <li>Confirm the schema has been run in Supabase SQL Editor.</li>
            <li>Add the project URL and publishable key to app secrets.</li>
            <li>Restart the Vite app.</li>
          </ol>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">
          Never put a service-role key in client code. The schema enables row-level security
          and keeps phone numbers private to ride-mates.
        </p>
      </div>
    </div>
  );
}

function AuthScreen({ mode, setMode, onSubmit, busy, error, notice, clearMessages }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  function submit(event) {
    event.preventDefault();
    onSubmit({ email: email.trim().toLowerCase(), password, mode });
  }

  function switchMode(nextMode) {
    clearMessages();
    setMode(nextMode);
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md">
        <header className="mb-7">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-green-700 text-white">
            <CarIcon />
          </span>
          <p className="mt-4 text-sm font-semibold text-green-700">Bennett University · Greater Noida</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Campus Cab Share</h1>
          <p className="mt-2 text-base text-slate-600">Share the ride. Split the fare. Cut the carbon.</p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              aria-pressed={mode === "signin"}
              className={"h-10 rounded-lg text-sm font-semibold " + (mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              aria-pressed={mode === "signup"}
              className={"h-10 rounded-lg text-sm font-semibold " + (mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
            >
              Create account
            </button>
          </div>

          <h2 className="text-xl font-semibold">{mode === "signin" ? "Welcome back" : "Join your campus rides"}</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use your Bennett University email to continue.
          </p>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mt-4 rounded-xl bg-green-50 px-3 py-2.5 text-sm text-green-800">
              {notice}
            </p>
          )}

          <form onSubmit={submit} className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">University email</span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@bennett.edu.in"
                className={FIELD}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
                  className={FIELD + " pr-20"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-2 my-1 h-10 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={busy}
              className={"h-12 w-full rounded-xl bg-green-700 px-4 text-base font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 " + FOCUS_RING}
            >
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">
            Only <span className="font-semibold">@bennett.edu.in</span> accounts can use this app.
          </p>
        </section>
      </div>
    </div>
  );
}

function ProfileSetupScreen({ user, onSave, busy, error }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");

  function submit(event) {
    event.preventDefault();
    onSave({ name: name.trim(), phone: phone.trim(), gender: gender || null });
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <p className="text-sm font-semibold text-green-700">One quick step</p>
        <h1 className="mt-1 text-2xl font-semibold">Set up your student profile</h1>
        <p className="mt-2 break-all text-sm text-slate-600">Signed in as {user.email}</p>
        <p className="mt-2 text-sm leading-5 text-slate-600">
          Your phone number is kept private and is only readable by students who share a ride with you.
        </p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Name</span>
            <input required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className={FIELD} autoComplete="name" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Phone number</span>
            <input required minLength={7} type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className={FIELD} autoComplete="tel" placeholder="Your contact number" />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Gender <span className="font-normal text-slate-500">(optional)</span></span>
            <select value={gender} onChange={(event) => setGender(event.target.value)} className={FIELD}>
              <option value="">Prefer not to say</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="non_binary">Non-binary</option>
            </select>
          </label>
          <button type="submit" disabled={busy} className={"h-12 w-full rounded-xl bg-green-700 px-4 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-60 " + FOCUS_RING}>
            {busy ? "Saving profile…" : "Save and continue"}
          </button>
          <p className="text-center text-xs text-slate-500">Your profile can be updated later.</p>
        </form>
      </div>
    </div>
  );
}

function LoadingScreen({ message }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-center">
      <p role="status" className="text-sm font-medium text-slate-600">{message}</p>
    </div>
  );
}

function mapDatabaseRide(row) {
  const destination = DESTINATIONS.find((item) => item.name === row.to_location);
  const memberCount = Array.isArray(row.ride_members)
    ? Number(row.ride_members[0]?.count || 0)
    : 0;
  const poster = Array.isArray(row.poster) ? row.poster[0] : row.poster;

  return {
    id: row.id,
    from: row.from_location,
    to: row.to_location,
    destinationId: destination ? destination.id : "other",
    placeName: row.to_location,
    km: Number(row.distance_km),
    departAt: new Date(row.depart_at),
    seatsTotal: Number(row.seats_total),
    seatsTaken: memberCount,
    fare: Number(row.estimated_total_fare),
    postedBy: poster?.name || "Bennett student",
    womenOnly: Boolean(row.women_only),
    status: row.status,
  };
}

export default function App() {
  const [mode, setMode] = useState("signin");
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [rides, setRides] = useState([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [ridesError, setRidesError] = useState("");
  const [activeTab, setActiveTab] = useState("rides");
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAuthError(error.message);
      const currentUser = data?.session?.user || null;
      if (currentUser && !isBennettEmail(currentUser.email)) {
        supabase.auth.signOut();
        setAuthError("Please use your Bennett University email.");
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setAuthLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user || null;
      if (nextUser && !isBennettEmail(nextUser.email)) {
        setAuthError("Please use your Bennett University email.");
        supabase.auth.signOut();
        setUser(null);
        return;
      }
      setUser(nextUser);
      if (!nextUser) {
        setProfile(null);
        setRides([]);
        setActiveTab("rides");
      }
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user) {
      setProfile(null);
      setProfileLoading(false);
      return undefined;
    }

    let alive = true;
    setProfileLoading(true);
    setProfileError("");
    supabase
      .from("students")
      .select("id, name, gender")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setProfileError(error.message);
          setProfile(null);
        } else {
          setProfile(data || null);
        }
        setProfileLoading(false);
      });

    return () => { alive = false; };
  }, [user?.id]);

  async function submitAuth({ email, password, mode: selectedMode }) {
    setAuthError("");
    setAuthNotice("");
    if (!isBennettEmail(email)) {
      setAuthError("Please use your Bennett University email.");
      return;
    }
    if (selectedMode === "signup" && password.length < 8) {
      setAuthError("Use a password with at least 8 characters.");
      return;
    }

    setAuthBusy(true);
    try {
      if (selectedMode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data?.session?.user) {
          setUser(data.session.user);
        } else {
          setAuthNotice("Account created. Check your Bennett University inbox to confirm your email, then sign in.");
          setMode("signin");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setUser(data.user);
      }
    } catch (error) {
      setAuthError(error?.message || "We couldn't sign you in. Please try again.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function saveProfile({ name, phone, gender }) {
    setProfileError("");
    setProfileBusy(true);
    try {
      const { error } = await supabase.rpc("complete_student_profile", {
        p_name: name,
        p_phone: phone,
        p_gender: gender,
      });
      if (error) throw error;
      const { data, error: readError } = await supabase
        .from("students")
        .select("id, name, gender")
        .eq("id", user.id)
        .single();
      if (readError) throw readError;
      setProfile(data);
    } catch (error) {
      setProfileError(error?.message || "We couldn't save your profile. Please try again.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadRides() {
    if (!supabase || !user || !profile) return;
    setRidesLoading(true);
    setRidesError("");
    try {
      const { data, error } = await supabase
        .from("rides")
        .select("id, from_location, to_location, depart_at, seats_total, estimated_total_fare, distance_km, women_only, posted_by, status, poster:students!rides_posted_by_fkey(name), ride_members(count)")
        .in("status", ["open", "full"])
        .gte("depart_at", new Date().toISOString())
        .order("depart_at", { ascending: true });

      if (error) throw error;
      setRides((data || []).map(mapDatabaseRide));
    } catch (error) {
      setRidesError("Couldn't load rides. Check your Supabase connection and schema, then try again.");
    } finally {
      setRidesLoading(false);
    }
  }

  useEffect(() => {
    if (user && profile) loadRides();
    else setRides([]);
  }, [user?.id, profile?.id]);

  async function signOut() {
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError(error.message);
  }

  if (!SUPABASE_CONFIGURED) return <ConfigScreen />;
  if (authLoading) return <LoadingScreen message="Checking your session…" />;
  if (!user) {
    return (
      <AuthScreen
        mode={mode}
        setMode={setMode}
        onSubmit={submitAuth}
        busy={authBusy}
        error={authError}
        notice={authNotice}
        clearMessages={() => { setAuthError(""); setAuthNotice(""); }}
      />
    );
  }
  if (profileLoading) return <LoadingScreen message="Loading your student profile…" />;
  if (!profile) {
    return (
      <ProfileSetupScreen
        user={user}
        onSave={saveProfile}
        busy={profileBusy}
        error={profileError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');`}</style>
      <div className="mx-auto flex max-w-md items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-green-700">Campus Cab Share</p>
          <p className="text-xs text-slate-500">Bennett University</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "rides" && (
            <button type="button" onClick={loadRides} disabled={ridesLoading} className={"h-10 rounded-lg px-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50 " + FOCUS_RING}>
              {ridesLoading ? "Loading…" : "Refresh"}
            </button>
          )}
          <button type="button" onClick={signOut} className={"h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 " + FOCUS_RING}>
            Sign out
          </button>
        </div>
      </div>
      <main className="mx-auto w-full max-w-md px-4 pb-28 pt-5">
        {signOutError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{signOutError}</p>}
        {profileError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{profileError}</p>}
        {activeTab === "rides" && (
          <>
            {ridesError && (
              <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                <span>{ridesError}</span>
                <button type="button" onClick={loadRides} className="shrink-0 rounded-lg px-2 py-1 font-semibold underline">Retry</button>
              </div>
            )}
            <RidesScreen rides={rides} onPost={() => setActiveTab("post")} loading={ridesLoading} />
          </>
        )}
        {activeTab === "post" && <PlaceholderScreen title="Post a ride" text="The ride form will save trips to your Supabase database in the next step." />}
        {activeTab === "my-rides" && <PlaceholderScreen title="My rides" text="Your posted and joined rides will appear here in a later step." />}
        {activeTab === "impact" && <PlaceholderScreen title="Impact" text="Rides shared, cabs avoided, CO2 saved and money saved will show here in a later step." />}
      </main>
      <BottomNav activeTab={activeTab} onChange={setActiveTab} />
    </div>
  );
}

function isBennettEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(UNIVERSITY_EMAIL_SUFFIX);
}
