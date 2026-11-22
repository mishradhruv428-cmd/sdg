import { useEffect, useRef, useState } from "react";
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
const APP_TAGLINE = "Share the ride. Split the fare. Cut the carbon.";
const CO2_KG_PER_KM = 0.14;
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

function getEffectiveRideStatus(status, departure) {
  const departAt = departure instanceof Date ? departure : new Date(departure);
  if (status === "cancelled" || status === "completed") return status;
  return departAt.getTime() <= Date.now() ? "completed" : status;
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

function toLocalDateTimeInput(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
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

function getCompletedRideRiderCount(ride) {
  const membershipValue = Array.isArray(ride.ride_members)
    ? ride.ride_members[0]?.count
    : ride.ride_members?.count;
  const joined = Number(membershipValue ?? ride.joinedCount ?? 0);
  return joined + 1; // The poster is rider one.
}

function summarizeImpact(rides) {
  const shared = rides.filter((ride) =>
    ride.status === "completed" && getCompletedRideRiderCount(ride) >= 2
  );
  return shared.reduce((totals, ride) => {
    const riders = getCompletedRideRiderCount(ride);
    const additionalRiders = riders - 1;
    return {
      ridesShared: totals.ridesShared + 1,
      cabsAvoided: totals.cabsAvoided + additionalRiders,
      co2Saved: totals.co2Saved + Number(ride.distance_km || 0) * CO2_KG_PER_KM * additionalRiders,
      rupeesSaved: totals.rupeesSaved + Number(ride.estimated_total_fare || 0) * additionalRiders,
    };
  }, { ridesShared: 0, cabsAvoided: 0, co2Saved: 0, rupeesSaved: 0 });
}

function startOfWeek(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const daysSinceMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - daysSinceMonday);
  return start;
}

function getLastEightWeeks(rides, referenceDate = new Date()) {
  const currentWeek = startOfWeek(referenceDate);
  const starts = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(currentWeek);
    start.setDate(start.getDate() - (7 * (7 - index)));
    return start;
  });
  const counts = starts.map(() => 0);
  rides.forEach((ride) => {
    if (ride.status !== "completed" || getCompletedRideRiderCount(ride) < 2) return;
    const departAt = new Date(ride.depart_at);
    const index = starts.findIndex((start, weekIndex) => {
      const end = new Date(start);
      end.setDate(end.getDate() + 7);
      return departAt >= start && departAt < end;
    });
    if (index >= 0) counts[index] += 1;
  });
  return starts.map((start, index) => ({
    start,
    label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    count: counts[index],
  }));
}

const DEMO_STUDENTS = [
  "Aarav Mehta", "Diya Sharma", "Kabir Singh", "Ishita Rao",
  "Rehan Khan", "Ananya Gupta", "Vivaan Patel", "Simran Kaur",
  "Rohan Das", "Meera Nair", "Arjun Verma", "Sara Thomas",
];
const DEMO_NOTES = [
  "2 big suitcases", "Can share a stop near Pari Chowk", "One cabin bag",
  "Flexible pickup at the main gate", "Please arrive 10 minutes early", "No extra luggage",
];

function createDemoDataset(userId, userName) {
  const now = new Date();
  const destinations = DESTINATIONS.filter((destination) => destination.id !== "other");
  const firstWeek = startOfWeek(now);
  firstWeek.setDate(firstWeek.getDate() - 49);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(20, 0, 0, 0);
  const spanDays = Math.max(0, Math.floor((yesterday.getTime() - firstWeek.getTime()) / 86400000));

  function buildRide(index, kind) {
    const globalIndex = kind === "completed" ? index : 15 + index;
    const destination = destinations[globalIndex % destinations.length];
    const riderCount = 2 + (globalIndex % 3);
    const postedByMe = globalIndex % 5 === 0;
    const joinedByMe = !postedByMe && globalIndex % 5 === 1;
    const posterName = postedByMe ? userName : DEMO_STUDENTS[globalIndex % DEMO_STUDENTS.length];
    const postedById = postedByMe ? userId : `demo-poster-${globalIndex}`;
    const memberCount = riderCount - 1;
    const demoMembers = Array.from({ length: memberCount }, (_, memberIndex) => {
      const currentUserIsMember = joinedByMe && memberIndex === 0;
      return {
        id: currentUserIsMember ? userId : `demo-member-${globalIndex}-${memberIndex}`,
        name: currentUserIsMember ? userName : DEMO_STUDENTS[(globalIndex + memberIndex + 3) % DEMO_STUDENTS.length],
        joinedAt: now.toISOString(),
      };
    });

    let departAt;
    let status;
    let seatsTotal;
    if (kind === "completed") {
      const daysOffset = spanDays === 0 ? 0 : Math.round((index / 14) * spanDays);
      departAt = new Date(firstWeek);
      departAt.setDate(firstWeek.getDate() + daysOffset);
      departAt.setHours(9 + (globalIndex % 10), (globalIndex % 2) * 30, 0, 0);
      if (departAt >= now) departAt = new Date(yesterday);
      status = "completed";
      seatsTotal = memberCount;
    } else {
      departAt = new Date(now);
      departAt.setDate(now.getDate() + 1 + (index * 2));
      departAt.setHours(8 + (index % 10), (index % 2) * 30, 0, 0);
      const rideIsFull = index % 2 === 0;
      seatsTotal = memberCount + (rideIsFull ? 0 : 1);
      status = rideIsFull ? "full" : "open";
    }

    return {
      id: `demo-${kind}-${index + 1}`,
      from: CAMPUS,
      to: destination.name,
      destinationId: destination.id,
      placeName: destination.name,
      km: destination.km,
      departAt,
      seatsTotal,
      seatsTaken: memberCount,
      fare: Math.round(destination.km * 22 + 180 + (globalIndex % 5) * 85),
      note: DEMO_NOTES[globalIndex % DEMO_NOTES.length],
      postedBy: posterName,
      postedById,
      womenOnly: globalIndex % 7 === 2,
      status,
      isDemo: true,
      demoMembers,
      demoParticipation: postedByMe || joinedByMe,
    };
  }

  const completedRides = Array.from({ length: 15 }, (_, index) => buildRide(index, "completed"));
  const upcomingRides = Array.from({ length: 6 }, (_, index) => buildRide(index, "upcoming"));
  const myRides = [...completedRides, ...upcomingRides]
    .filter((ride) => ride.demoParticipation)
    .sort((a, b) => a.departAt - b.departAt);
  const toImpactRow = (ride) => ({
    status: ride.status,
    depart_at: ride.departAt.toISOString(),
    distance_km: ride.km,
    estimated_total_fare: ride.fare,
    posted_by: ride.postedById,
    ride_members: [{ count: ride.demoMembers.length }],
  });
  const campusRows = completedRides.map(toImpactRow);
  const myRows = completedRides.filter((ride) => ride.demoParticipation).map(toImpactRow);

  return {
    completedRides,
    upcomingRides,
    myRides,
    impactData: {
      campus: summarizeImpact(campusRows),
      mine: summarizeImpact(myRows),
      weeks: getLastEightWeeks(campusRows, now),
    },
  };
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

function RideCard({ ride, onSelect, currentUserId }) {
  const { from, to } = getRoute(ride);
  const seatsLeft = getSeatsLeft(ride);
  const cost = getCostPerPerson(ride);
  const isCancelled = ride.status === "cancelled";
  const isCompleted = ride.status === "completed";
  const isPoster = currentUserId && ride.postedById === currentUserId;

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(ride)}
        className={"block min-h-11 w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-green-300 hover:shadow-md " + FOCUS_RING}
        aria-label={`Ride from ${from} to ${to}, ${formatDate(ride.departAt)} at ${formatTime(ride.departAt)}. Open details.`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <RouteMarker />
            <div className="min-w-0">
              <p className="break-words text-base font-semibold leading-6 text-slate-900">{from}</p>
              <p className="mt-2 break-words text-base font-semibold leading-6 text-slate-900">{to}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold leading-6 text-slate-900">{formatRupees(cost)}</p>
            <p className="mt-1 text-xs leading-4 text-slate-500">per person if full</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm text-slate-700">
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <span>{formatDate(ride.departAt)} · {formatTime(ride.departAt)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {ride.isDemo && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Demo</span>}
            {ride.womenOnly && <span className="rounded-full border border-pink-200 bg-pink-50 px-2.5 py-0.5 text-xs font-semibold text-pink-800">Women only</span>}
            {isCancelled && <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">Cancelled</span>}
            {isCompleted && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">Completed</span>}
            {isPoster && <span className="rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-800">Posted by you</span>}
            {currentUserId && !isPoster && <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-800">Joined by you</span>}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-50 text-xs font-semibold text-green-800" aria-hidden="true">{getInitials(ride.postedBy)}</span>
            <p className="truncate text-sm text-slate-700"><span className="sr-only">Posted by </span>{ride.postedBy}</p>
          </div>
          <p className={"shrink-0 text-sm font-semibold " + (isCancelled ? "text-red-700" : seatsLeft > 0 ? "text-green-700" : "text-slate-500")}>
            {isCancelled ? "Cancelled" : isCompleted ? "Completed" : seatsLeft > 0 ? `${seatsLeft} of ${ride.seatsTotal} seats left` : "Full"}
          </p>
        </div>
        <span className="sr-only">Tap to view ride details</span>
      </button>
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

function RidesScreen({ rides, onPost, onSelect, loading }) {
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
        <div className="mb-1 flex min-h-[2.75rem] flex-wrap items-center justify-between gap-2">
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
            Loading upcoming rides…
          </div>
        ) : visibleRides.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {visibleRides.map((ride) => (
              <RideCard key={ride.id} ride={ride} onSelect={onSelect} />
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
/* 5. Other screens                                                   */
/* ------------------------------------------------------------------ */

function MyRideCard({ ride, past, onSelect }) {
  const { from, to } = getRoute(ride);
  const riderCount = 1 + Number(ride.seatsTaken || 0);
  const statusLabel = ride.status === "cancelled" ? "Cancelled"
    : ride.status === "completed" ? "Completed"
      : ride.status === "full" ? "Full" : "Open";
  const statusClass = ride.status === "cancelled" ? "bg-red-50 text-red-800"
    : ride.status === "completed" ? "bg-slate-200 text-slate-700"
      : ride.status === "full" ? "bg-amber-50 text-amber-800" : "bg-green-50 text-green-800";

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(ride)}
        className={"block min-h-11 w-full rounded-2xl border p-4 text-left transition hover:border-green-300 hover:shadow-sm " + FOCUS_RING + (past ? " border-slate-200 bg-slate-50" : " border-slate-200 bg-white")}
        aria-label={`Ride from ${from} to ${to}, ${formatDate(ride.departAt)} at ${formatTime(ride.departAt)}, ${riderCount} riders, ${statusLabel}. Open details.`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <RouteMarker />
            <div className="min-w-0">
              <p className={"break-words text-base font-semibold leading-6 " + (past ? "text-slate-700" : "text-slate-900")}>{from}</p>
              <p className={"mt-2 break-words text-base font-semibold leading-6 " + (past ? "text-slate-700" : "text-slate-900")}>{to}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {ride.isDemo && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Demo</span>}
            <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + statusClass}>{statusLabel}</span>
          </div>
        </div>
        <div className={"mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 " + (past ? "border-slate-200" : "border-slate-100")}>
          <p className={"flex items-center gap-2 text-sm " + (past ? "text-slate-600" : "text-slate-700")}>
            <CalendarIcon className="h-4 w-4 text-slate-500" />
            <span>{formatDate(ride.departAt)} · {formatTime(ride.departAt)}</span>
          </p>
          <p className={"text-sm font-medium " + (past ? "text-slate-600" : "text-slate-700")}>{riderCount} {riderCount === 1 ? "rider" : "riders"}</p>
        </div>
      </button>
    </li>
  );
}

function MyRidesScreen({ rides, loading, error, onRetry, onSelect, userId, onPost, onBrowse, activeSection, onSectionChange }) {
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const isPosted = activeSection === "posted";
  const filtered = rides
    .filter((ride) => isPosted ? ride.postedById === userId : ride.postedById !== userId)
    .map((ride) => ({ ...ride, status: getEffectiveRideStatus(ride.status, ride.departAt) }));
  const now = clock;
  const upcoming = filtered.filter((ride) => ride.departAt.getTime() > now).sort((a, b) => a.departAt - b.departAt);
  const past = filtered.filter((ride) => ride.departAt.getTime() <= now).sort((a, b) => b.departAt - a.departAt);
  const emptyMessage = isPosted ? "You have not posted a ride yet" : "You have not joined a ride yet";

  function renderRideGroup(title, items, isPast) {
    if (!items.length) return null;
    return (
      <section className="mt-6" aria-label={title}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          <span className="text-xs text-slate-500">{items.length}</span>
        </div>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((ride) => <MyRideCard key={ride.id} ride={ride} past={isPast} onSelect={onSelect} />)}
        </ul>
      </section>
    );
  }

  return (
    <div>
      <header>
        <p className="text-sm font-medium text-green-700">Your trips</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">My rides</h1>
      </header>
      <div className="mt-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="My rides categories">
        <button type="button" role="tab" aria-selected={isPosted} onClick={() => onSectionChange("posted")} className={"h-11 rounded-lg px-2 text-sm font-semibold " + (isPosted ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>Posted by me</button>
        <button type="button" role="tab" aria-selected={!isPosted} onClick={() => onSectionChange("joined")} className={"h-11 rounded-lg px-2 text-sm font-semibold " + (!isPosted ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>Joined</button>
      </div>
      {error && <div role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={onRetry} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold underline">Retry</button></div>}
      {loading ? (
        <div role="status" className="mt-6 rounded-2xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-600">Loading your rides…</div>
      ) : filtered.length ? (
        <div role="tabpanel">
          {renderRideGroup("Upcoming", upcoming, false)}
          {renderRideGroup("Past", past, true)}
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-dashed border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="font-semibold text-slate-900">{emptyMessage}</p>
            <p className="mt-1 text-sm text-slate-600">{isPosted ? "Share your next trip with other students." : "Browse upcoming trips from other students."}</p>
          </div>
          <button type="button" onClick={isPosted ? onPost : onBrowse} className={"h-11 shrink-0 rounded-xl bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 " + FOCUS_RING}>
            {isPosted ? "Post a ride" : "Find a ride"}
          </button>
        </div>
      )}
    </div>
  );
}

function ImpactMetric({ label, value, unit, subdued = false }) {
  return (
    <div className={"min-w-0 rounded-2xl border p-4 " + (subdued ? "border-slate-200 bg-slate-50" : "border-slate-200 bg-white")}>
      <p className="text-xs font-medium leading-4 text-slate-600">{label}</p>
      <p className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {value}<span className="ml-1 text-sm font-medium text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

function ImpactMetricsGrid({ title, metrics, subdued = false, description }) {
  return (
    <section className="mt-5" aria-label={title}>
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ImpactMetric label="Rides shared" value={metrics.ridesShared.toLocaleString("en-IN")} unit="rides" subdued={subdued} />
        <ImpactMetric label="Cabs avoided" value={metrics.cabsAvoided.toLocaleString("en-IN")} unit="cabs" subdued={subdued} />
        <ImpactMetric label="CO₂ saved" value={metrics.co2Saved.toFixed(1)} unit="kg" subdued={subdued} />
        <ImpactMetric label="Money saved" value={formatRupees(metrics.rupeesSaved)} unit="" subdued={subdued} />
      </div>
    </section>
  );
}

function WeeklyRidesChart({ weeks }) {
  const peak = Math.max(1, ...weeks.map((week) => week.count));
  const total = weeks.reduce((sum, week) => sum + week.count, 0);
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="weekly-rides-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="weekly-rides-heading" className="text-base font-semibold text-slate-900">Shared rides per week</h2>
          <p className="mt-1 text-xs text-slate-500">Campus · last 8 weeks</p>
        </div>
        <p className="text-xs font-medium text-slate-500">{total} total</p>
      </div>
      <div className="mt-5 flex h-40 items-end justify-between gap-1.5" role="img" aria-label={`Shared rides per week for the last eight weeks. ${weeks.map((week) => `${week.label}: ${week.count}`).join(", ")}`}>
        {weeks.map((week) => {
          const barHeight = week.count === 0 ? 4 : Math.max(10, Math.round((week.count / peak) * 112));
          return (
            <div key={week.start.toISOString()} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-medium text-slate-600">{week.count}</span>
              <div className={"w-full max-w-[1.75rem] rounded-t-md " + (week.count ? "bg-green-700" : "bg-slate-200")} style={{ height: `${barHeight}px` }} aria-hidden="true" />
              <span className="whitespace-nowrap text-[9px] leading-3 text-slate-500">{week.label}</span>
            </div>
          );
        })}
      </div>
      {total === 0 && <p className="mt-3 text-center text-xs text-slate-500">No shared rides in the last 8 weeks yet.</p>}
      <ul className="sr-only">
        {weeks.map((week) => <li key={`text-${week.start.toISOString()}`}>{week.label}: {week.count} shared rides</li>)}
      </ul>
    </section>
  );
}

function ImpactScreen({ data, loading, error, onRetry }) {
  if (!data && !error) return <div role="status" className="rounded-2xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-600">{loading ? "Calculating completed-ride impact…" : "Preparing impact totals…"}</div>;
  if (error && !data) return <div><h1 className="text-2xl font-semibold text-slate-900">Impact</h1><p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<button type="button" onClick={onRetry} className="ml-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold underline">Retry</button></p></div>;
  const zero = { ridesShared: 0, cabsAvoided: 0, co2Saved: 0, rupeesSaved: 0 };
  const campus = data?.campus || zero;
  const mine = data?.mine || zero;
  const weeks = data?.weeks || [];
  return (
    <div>
      <header>
        <p className="text-sm font-medium text-green-700">Every shared trip counts</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">Impact</h1>
        <p className="mt-2 text-sm leading-5 text-slate-600">Based on completed rides with at least two riders.</p>
      </header>
      {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{error} Showing the latest available numbers.</p>}
      <ImpactMetricsGrid title="Whole campus" metrics={campus} />
      <ImpactMetricsGrid title="My impact" metrics={mine} subdued description="Completed rides you posted or joined." />
      <p className="mt-4 text-xs leading-5 text-slate-500">Assumes each rider would otherwise have taken a separate cab, at {CO2_KG_PER_KM.toFixed(2)} kg CO2 per km.</p>
      <WeeklyRidesChart weeks={weeks} />
    </div>
  );
}

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

function FieldError({ id, message }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-sm text-red-700" role="alert">{message}</p>;
}

function PostRideScreen({ onSave, onCancel, busy, error }) {
  const [form, setForm] = useState({
    from: CAMPUS,
    destinationId: "",
    otherDestination: "",
    departure: "",
    seats: "1",
    fare: "",
    distance: "",
    womenOnly: false,
    note: "",
  });
  const [errors, setErrors] = useState({});
  const selectedDestination = getDestination(form.destinationId);
  const isOther = form.destinationId === "other";
  const previewFare = Number(form.fare);
  const previewSeats = Number(form.seats);
  const previewCost = Number.isFinite(previewFare) && previewFare > 0 && previewSeats >= 1
    ? Math.round(previewFare / (previewSeats + 1))
    : null;

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (key === "destinationId") {
        delete next.otherDestination;
        delete next.distance;
      }
      return next;
    });
  }

  function validate() {
    const next = {};
    const from = form.from.trim();
    const otherDestination = form.otherDestination.trim();
    const note = form.note.trim();
    const seats = Number(form.seats);
    const fare = Number(form.fare);
    const departure = form.departure ? new Date(form.departure) : null;

    if (!from) next.from = "Enter a pickup location.";
    else if (from.length < 2 || from.length > 120) next.from = "Use 2–120 characters.";

    if (!form.destinationId) next.destinationId = "Choose a destination.";
    else if (!selectedDestination) next.destinationId = "Choose a valid destination.";
    else if (isOther) {
      if (!otherDestination) next.otherDestination = "Enter the destination name.";
      else if (otherDestination.length < 2 || otherDestination.length > 120) next.otherDestination = "Use 2–120 characters.";
      const distance = Number(form.distance);
      if (form.distance === "" || !Number.isFinite(distance) || distance <= 0 || distance > 10000) {
        next.distance = "Enter a distance greater than 0 and no more than 10,000 km.";
      }
    }

    if (!departure || Number.isNaN(departure.getTime())) next.departure = "Choose a date and time.";
    else if (departure.getTime() <= Date.now()) next.departure = "Choose a future date and time.";

    if (!Number.isInteger(seats) || seats < 1 || seats > 6) next.seats = "Choose 1–6 seats for other students.";
    if (form.fare === "" || !Number.isInteger(fare) || fare < 1 || fare > 2147483647) {
      next.fare = "Enter a whole-rupee fare greater than 0.";
    }
    if (note.length > 240) next.note = "Keep the note to 240 characters or fewer.";
    return next;
  }

  async function submit(event) {
    event.preventDefault();
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const destinationName = isOther ? form.otherDestination.trim() : selectedDestination.name;
    await onSave({
      from: form.from.trim(),
      to: destinationName,
      departAt: new Date(form.departure).toISOString(),
      seatsTotal: Number(form.seats),
      fare: Number(form.fare),
      distanceKm: isOther ? Number(form.distance) : Number(selectedDestination.km),
      womenOnly: form.womenOnly,
      note: form.note.trim() || null,
    });
  }

  const invalidClass = (field) => errors[field] ? " border-red-500" : "";

  return (
    <div className="mx-auto max-w-3xl">
      <button
        type="button"
        onClick={onCancel}
        className={"mb-4 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 " + FOCUS_RING}
      >
        <span aria-hidden="true">←</span> Back to rides
      </button>
      <header>
        <p className="text-sm font-medium text-green-700">Make the trip easier together</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">Post a ride</h1>
        <p className="mt-2 text-sm leading-5 text-slate-600">Share your route and the seats you can offer to other Bennett students.</p>
      </header>

      <form onSubmit={submit} noValidate className="mt-6 space-y-5">
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">{error}</p>}

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="route-heading">
          <h2 id="route-heading" className="text-base font-semibold text-slate-900">Your route</h2>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">From</span>
            <input
              type="text" required maxLength={120} value={form.from}
              onChange={(event) => updateField("from", event.target.value)}
              className={FIELD + invalidClass("from")}
              aria-invalid={Boolean(errors.from)} aria-describedby={errors.from ? "post-from-error" : undefined}
            />
            <FieldError id="post-from-error" message={errors.from} />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">To</span>
            <select
              required value={form.destinationId}
              onChange={(event) => updateField("destinationId", event.target.value)}
              className={FIELD + invalidClass("destinationId")}
              aria-invalid={Boolean(errors.destinationId)} aria-describedby={errors.destinationId ? "post-destination-error" : undefined}
            >
              <option value="">Choose a destination</option>
              {DESTINATIONS.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destination.name}{destination.km ? ` · ${destination.km} km` : ""}
                </option>
              ))}
            </select>
            <FieldError id="post-destination-error" message={errors.destinationId} />
          </label>

          {isOther ? (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Destination name</span>
                <input
                  type="text" required maxLength={120} value={form.otherDestination}
                  onChange={(event) => updateField("otherDestination", event.target.value)}
                  placeholder="Enter a place"
                  className={FIELD + invalidClass("otherDestination")}
                  aria-invalid={Boolean(errors.otherDestination)} aria-describedby={errors.otherDestination ? "post-other-error" : undefined}
                />
                <FieldError id="post-other-error" message={errors.otherDestination} />
              </label>
              <label className="block min-w-0">
                <span className="mb-1.5 block text-sm font-medium text-slate-700">Distance (km)</span>
                <input
                  type="number" required min="0.1" max="10000" step="0.1" inputMode="decimal"
                  value={form.distance} onChange={(event) => updateField("distance", event.target.value)}
                  placeholder="e.g. 42"
                  className={FIELD + invalidClass("distance")}
                  aria-invalid={Boolean(errors.distance)} aria-describedby={errors.distance ? "post-distance-error" : "post-distance-help"}
                />
                <FieldError id="post-distance-error" message={errors.distance} />
                {!errors.distance && <p id="post-distance-help" className="mt-1.5 text-xs text-slate-500">Add an approximate one-way distance.</p>}
              </label>
            </div>
          ) : selectedDestination?.km ? (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600" role="status">
              Estimated distance: <span className="font-semibold text-slate-900">{selectedDestination.km} km</span> <span className="text-slate-500">· filled automatically</span>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="trip-heading">
          <h2 id="trip-heading" className="text-base font-semibold text-slate-900">Trip details</h2>
          <label className="mt-4 block">
            <span className="mb-1.5 block text-sm font-medium text-slate-700">Date and time</span>
            <input
              type="datetime-local" required min={toLocalDateTimeInput(new Date())}
              value={form.departure} onChange={(event) => updateField("departure", event.target.value)}
              className={FIELD + invalidClass("departure")}
              aria-invalid={Boolean(errors.departure)} aria-describedby={errors.departure ? "post-departure-error" : "post-departure-help"}
            />
            <FieldError id="post-departure-error" message={errors.departure} />
            {!errors.departure && <p id="post-departure-help" className="mt-1.5 text-xs text-slate-500">Departure must be in the future.</p>}
          </label>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Seats available for others</span>
              <select
                required value={form.seats} onChange={(event) => updateField("seats", event.target.value)}
                className={FIELD + invalidClass("seats")}
                aria-invalid={Boolean(errors.seats)} aria-describedby={errors.seats ? "post-seats-error" : undefined}
              >
                {[1, 2, 3, 4, 5, 6].map((seatCount) => <option key={seatCount} value={seatCount}>{seatCount} {seatCount === 1 ? "seat" : "seats"}</option>)}
              </select>
              <FieldError id="post-seats-error" message={errors.seats} />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Estimated total fare (Rs)</span>
              <input
                type="number" required min="1" max="2147483647" step="1" inputMode="numeric"
                value={form.fare} onChange={(event) => updateField("fare", event.target.value)}
                placeholder="e.g. 1800"
                className={FIELD + invalidClass("fare")}
                aria-invalid={Boolean(errors.fare)} aria-describedby={errors.fare ? "post-fare-error" : undefined}
              />
              <FieldError id="post-fare-error" message={errors.fare} />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4" aria-live="polite">
            <p className="text-sm font-medium text-green-900">Cost per person if full:</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-green-900">
              Rs {previewCost === null ? "—" : previewCost.toLocaleString("en-IN")}
            </p>
            <p className="mt-1 text-xs leading-5 text-green-800">Split across {previewSeats + 1} people, including you.</p>
          </div>

          <button
            type="button" role="switch" aria-checked={form.womenOnly}
            onClick={() => updateField("womenOnly", !form.womenOnly)}
            className={"mt-4 flex min-h-12 w-full items-center justify-between gap-4 rounded-xl border border-slate-200 px-3 py-2 text-left " + FOCUS_RING}
          >
            <span>
              <span className="block text-sm font-medium text-slate-800">Women only</span>
              <span className="mt-0.5 block text-xs text-slate-500">Only women students can join this ride.</span>
            </span>
            <span className={"relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors " + (form.womenOnly ? "bg-green-700" : "bg-slate-300")}>
              <span className={"absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform " + (form.womenOnly ? "translate-x-5" : "translate-x-0.5")} />
            </span>
          </button>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="note-heading">
          <label className="block">
            <span id="note-heading" className="block text-base font-semibold text-slate-900">Note <span className="text-sm font-normal text-slate-500">(optional)</span></span>
            <textarea
              rows={3} maxLength={240} value={form.note}
              onChange={(event) => updateField("note", event.target.value)}
              placeholder="For example: 2 big suitcases"
              className={"mt-3 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-700 focus-visible:ring-offset-2" + invalidClass("note")}
              aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? "post-note-error" : "post-note-count"}
            />
            <FieldError id="post-note-error" message={errors.note} />
            {!errors.note && <p id="post-note-count" className="mt-1.5 text-xs text-slate-500">{form.note.length}/240 characters</p>}
          </label>
        </section>

        <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">You count as the first rider. The available seats are for other students.</p>
        <button
          type="submit" disabled={busy}
          className={"h-12 w-full rounded-xl bg-green-700 px-4 text-base font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-60 " + FOCUS_RING}
        >
          {busy ? "Posting ride…" : "Post ride"}
        </button>
      </form>
    </div>
  );
}

function RideDetailsScreen({ ride, user, profile, confirmation, onBack, onDataChanged }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState(confirmation || "");
  const [posterPhone, setPosterPhone] = useState("");
  const [contactError, setContactError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    if (ride.isDemo) {
      setDetails({
        ...ride,
        status: getEffectiveRideStatus(ride.status, ride.departAt),
        members: ride.demoMembers || [],
      });
      setPosterPhone("");
      setLoading(false);
      return () => { alive = false; };
    }
    const initialLoad = !details;
    async function loadDetails() {
      if (initialLoad) setLoading(true);
      setDetailError("");
      try {
        const { error: completionError } = await supabase.rpc("mark_departed_rides_completed");
        if (completionError) throw completionError;
        const { data, error } = await supabase
          .from("rides")
          .select("id, from_location, to_location, depart_at, seats_total, estimated_total_fare, distance_km, women_only, posted_by, status, note, poster:students!rides_posted_by_fkey(id, name), ride_members(student_id, joined_at, student:students!ride_members_student_id_fkey(id, name))")
          .eq("id", ride.id)
          .single();
        if (error) throw error;

        const poster = Array.isArray(data.poster) ? data.poster[0] : data.poster;
        const members = (data.ride_members || []).map((member) => {
          const student = Array.isArray(member.student) ? member.student[0] : member.student;
          return { id: member.student_id, name: student?.name || "Bennett student", joinedAt: member.joined_at };
        }).sort((a, b) => new Date(a.joinedAt) - new Date(b.joinedAt));
        const nextDetails = {
          id: data.id,
          from: data.from_location,
          to: data.to_location,
          departAt: new Date(data.depart_at),
          seatsTotal: Number(data.seats_total),
          fare: Number(data.estimated_total_fare),
          km: Number(data.distance_km),
          womenOnly: Boolean(data.women_only),
          postedById: data.posted_by,
          postedBy: poster?.name || "Bennett student",
          note: data.note || "",
          status: getEffectiveRideStatus(data.status, data.depart_at),
          members,
        };
        if (!alive) return;
        setDetails(nextDetails);
        setPosterPhone("");
        setContactError("");

        const currentUserJoined = members.some((member) => member.id === user.id);
        if (currentUserJoined) {
          const { data: contact, error: phoneError } = await supabase
            .from("student_private")
            .select("phone")
            .eq("student_id", data.posted_by)
            .maybeSingle();
          if (!alive) return;
          if (phoneError) setContactError("Couldn’t load the poster’s phone number. Try refreshing the ride details.");
          else setPosterPhone(contact?.phone || "");
        }
      } catch (error) {
        if (alive) setDetailError("We couldn’t load this ride. Check your connection and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    loadDetails();
    return () => { alive = false; };
  }, [ride.id, user.id, ride.isDemo, reloadKey]);

  async function refreshLists() {
    if (onDataChanged) await onDataChanged();
  }

  function refreshDetails() {
    setReloadKey((value) => value + 1);
  }

  async function joinRide() {
    if (!details) return;
    if (ride.isDemo) {
      setActionError("Demo rides are read-only. Remove demo data to manage live rides.");
      return;
    }
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      const { error } = await supabase.rpc("join_ride", { p_ride_id: details.id });
      if (error) throw error;
      setDetails((current) => {
        if (!current) return current;
        const members = [...current.members, { id: user.id, name: profile.name, joinedAt: new Date().toISOString() }];
        return { ...current, members, status: members.length >= current.seatsTotal ? "full" : current.status };
      });
      setNotice("You joined this ride.");
      refreshDetails();
      await refreshLists();
    } catch (error) {
      setActionError("We couldn’t join this ride. It may no longer have seats, or your connection may have dropped. Please refresh and try again.");
      refreshDetails();
    } finally {
      setActionBusy(false);
    }
  }

  async function leaveRide() {
    if (!details) return;
    if (ride.isDemo) {
      setActionError("Demo rides are read-only. Remove demo data to manage live rides.");
      return;
    }
    setActionBusy(true);
    setActionError("");
    setNotice("");
    try {
      const { error } = await supabase.rpc("leave_ride", { p_ride_id: details.id });
      if (error) throw error;
      setPosterPhone("");
      setDetails((current) => {
        if (!current) return current;
        const members = current.members.filter((member) => member.id !== user.id);
        return { ...current, members, status: current.status === "cancelled" ? "cancelled" : "open" };
      });
      setNotice("You left this ride.");
      refreshDetails();
      await refreshLists();
    } catch (error) {
      setActionError("We couldn’t leave this ride right now. Check your connection and try again.");
      refreshDetails();
    } finally {
      setActionBusy(false);
    }
  }

  async function cancelRide() {
    if (!details) return;
    if (ride.isDemo) {
      setActionError("Demo rides are read-only. Remove demo data to manage live rides.");
      return;
    }
    setActionBusy(true);
    setActionError("");
    try {
      const { error } = await supabase
        .from("rides")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", details.id)
        .eq("posted_by", user.id)
        .select("id")
        .single();
      if (error) throw error;
      setDetails((current) => current ? { ...current, status: "cancelled" } : current);
      setNotice("Ride cancelled. It no longer appears in Rides.");
      setConfirmCancel(false);
      await refreshLists();
    } catch (error) {
      setActionError("We couldn’t cancel this ride right now. Check your connection and try again.");
    } finally {
      setActionBusy(false);
    }
  }

  const members = details?.members || [];
  const seatsLeft = details ? Math.max(details.seatsTotal - members.length, 0) : 0;
  const currentRiders = 1 + members.length;
  const currentCost = details ? details.fare / currentRiders : 0;
  const isPoster = details?.postedById === user.id;
  const hasJoined = members.some((member) => member.id === user.id);
  const womenBlocked = details?.womenOnly && profile?.gender !== "female";
  const isCancelled = details?.status === "cancelled";
  const isCompleted = details?.status === "completed";
  const isFull = details?.status === "full" || seatsLeft === 0;
  const whatsappDigits = posterPhone.replace(/\D/g, "");
  const whatsappNumber = whatsappDigits.length === 10
    ? `91${whatsappDigits}`
    : whatsappDigits.startsWith("0") && whatsappDigits.length === 11
      ? `91${whatsappDigits.slice(1)}`
      : whatsappDigits;

  if (loading && !details) return <div role="status" className="rounded-2xl border border-slate-200 px-5 py-10 text-center text-sm text-slate-600">Loading ride details…</div>;
  if (detailError && !details) return <div><button type="button" onClick={onBack} className={"mb-4 h-11 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 " + FOCUS_RING}>← Back</button><div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{detailError}<button type="button" onClick={refreshDetails} className="ml-2 inline-flex min-h-11 items-center rounded-lg px-2 font-semibold underline">Retry</button></div></div>;
  if (!details) return null;

  return (
    <article>
      <button type="button" onClick={onBack} className={"mb-4 inline-flex h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 " + FOCUS_RING}><span aria-hidden="true">←</span> Back</button>
      <header>
        <p className="text-sm font-medium text-green-700">{isPoster ? "Your ride" : "Ride details"}</p>
        <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">{details.from} → {details.to}</h1>
      </header>
      {notice && <p role="status" className="mt-4 rounded-xl bg-green-50 px-3 py-2.5 text-sm font-medium text-green-900">{notice}</p>}
      {actionError && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-800">{actionError}</p>}
      {detailError && <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{detailError}</p>}

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <RouteMarker />
          <div className="min-w-0 flex-1">
            <p className="break-words text-base font-semibold text-slate-900">{details.from}</p>
            <p className="mt-3 break-words text-base font-semibold text-slate-900">{details.to}</p>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
          <div><p className="text-xs text-slate-500">Date</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatDate(details.departAt)}</p></div>
          <div><p className="text-xs text-slate-500">Time</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatTime(details.departAt)}</p></div>
          <div><p className="text-xs text-slate-500">Seats left</p><p className="mt-1 text-sm font-semibold text-slate-900" aria-live="polite">{seatsLeft}</p></div>
          <div><p className="text-xs text-slate-500">Current cost per person</p><p className="mt-1 text-sm font-semibold text-green-800" aria-live="polite">Rs {currentCost.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p></div>
          <div><p className="text-xs text-slate-500">Estimated total fare</p><p className="mt-1 text-sm font-semibold text-slate-900">{formatRupees(details.fare)}</p></div>
          <div><p className="text-xs text-slate-500">Distance</p><p className="mt-1 text-sm font-semibold text-slate-900">{details.km} km</p></div>
        </div>
        <p className="mt-4 text-sm text-slate-600">Posted by <span className="font-semibold text-slate-900">{details.postedBy}</span>{isPoster ? " · you are rider 1" : " · rider 1"}</p>
        {details.womenOnly && <p className="mt-3 inline-flex rounded-full border border-pink-200 bg-pink-50 px-3 py-1 text-xs font-semibold text-pink-800">Women only</p>}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Note</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{details.note || "No note added."}</p>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="joined-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="joined-heading" className="text-base font-semibold text-slate-900">Students who joined</h2>
          <span className="text-xs font-medium text-slate-500">{members.length} joined · {seatsLeft} seats left</span>
        </div>
        {members.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {members.map((member) => <li key={member.id} className="flex items-center gap-3 py-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700" aria-hidden="true">{getInitials(member.name)}</span><span className="text-sm font-medium text-slate-800">{member.name}{member.id === user.id ? " (you)" : ""}</span></li>)}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-600">No students have joined yet.</p>}
        <p className="mt-2 text-xs text-slate-500">The poster is counted as the first rider; available seats are for other students.</p>
      </section>

      {hasJoined && posterPhone && (
        <section className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4" aria-label="Poster contact">
          <p className="text-sm font-semibold text-green-950">Contact the poster</p>
          <p className="mt-1 text-sm text-green-900">{posterPhone}</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a href={`tel:${posterPhone}`} className={"inline-flex h-11 items-center justify-center rounded-xl bg-green-700 px-3 text-sm font-semibold text-white hover:bg-green-800 " + FOCUS_RING}>Call</a>
            <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className={"inline-flex h-11 items-center justify-center rounded-xl border border-green-700 bg-white px-3 text-sm font-semibold text-green-800 hover:bg-green-100 " + FOCUS_RING}>WhatsApp</a>
          </div>
        </section>
      )}
      {hasJoined && contactError && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{contactError}</p>}

      {!ride.isDemo && confirmCancel && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4" role="alertdialog" aria-modal="false" aria-labelledby="cancel-confirm-title">
          <h2 id="cancel-confirm-title" className="font-semibold text-red-950">Cancel this ride?</h2>
          <p className="mt-1 text-sm leading-5 text-red-900">It will disappear from Rides and show as cancelled in My rides.</p>
          <div className="mt-3 flex gap-3">
            <button type="button" disabled={actionBusy} onClick={() => setConfirmCancel(false)} className={"h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 " + FOCUS_RING}>Keep ride</button>
            <button type="button" disabled={actionBusy} onClick={cancelRide} className={"h-11 flex-1 rounded-xl bg-red-700 px-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 " + FOCUS_RING}>{actionBusy ? "Cancelling…" : "Yes, cancel"}</button>
          </div>
        </div>
      )}

      {ride.isDemo ? (
        <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950">Demo preview · joining, leaving, and cancelling are disabled.</p>
      ) : <div className="mt-5">
        {isPoster ? (
          isCancelled ? <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800">Cancelled</p> : isCompleted ? <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700">Completed</p> : !confirmCancel && <button type="button" disabled={actionBusy} onClick={() => setConfirmCancel(true)} className={"h-12 w-full rounded-xl border border-red-300 bg-white px-4 text-base font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60 " + FOCUS_RING}>Cancel ride</button>
        ) : isCompleted ? (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm font-semibold text-slate-700">Completed</p>
        ) : hasJoined ? (
          <button type="button" disabled={actionBusy} onClick={leaveRide} className={"h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 " + FOCUS_RING}>{actionBusy ? "Updating…" : "Leave ride"}</button>
        ) : isCancelled ? (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-center text-sm font-semibold text-red-800">Cancelled</p>
        ) : isFull ? (
          <button type="button" disabled className="h-12 w-full cursor-not-allowed rounded-xl bg-slate-200 px-4 text-base font-semibold text-slate-600">Full</button>
        ) : womenBlocked ? (
          <p className="rounded-xl bg-pink-50 px-4 py-3 text-center text-sm font-semibold text-pink-900">This ride is women only</p>
        ) : (
          <button type="button" disabled={actionBusy} onClick={joinRide} className={"h-12 w-full rounded-xl bg-green-700 px-4 text-base font-semibold text-white hover:bg-green-800 disabled:opacity-60 " + FOCUS_RING}>{actionBusy ? "Joining…" : "Join ride"}</button>
        )}
      </div>}
      {loading && details && <p role="status" className="mt-3 text-center text-xs text-slate-500">Refreshing ride details…</p>}
    </article>
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
      className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-6xl border-t border-slate-200 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
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
          <p className="mt-2 text-base text-slate-600">{APP_TAGLINE}</p>
        </header>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              aria-pressed={mode === "signin"}
              className={"h-11 rounded-lg text-sm font-semibold " + (mode === "signin" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              aria-pressed={mode === "signup"}
              className={"h-11 rounded-lg text-sm font-semibold " + (mode === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600")}
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
                  className="absolute inset-y-0 right-2 my-1 h-11 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
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
    note: row.note || "",
    postedBy: poster?.name || "Bennett student",
    postedById: row.posted_by,
    womenOnly: Boolean(row.women_only),
    status: getEffectiveRideStatus(row.status, row.depart_at),
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
  const [myRides, setMyRides] = useState([]);
  const [myRidesLoading, setMyRidesLoading] = useState(false);
  const [myRidesError, setMyRidesError] = useState("");
  const [impactData, setImpactData] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impactError, setImpactError] = useState("");
  const [demoMode, setDemoMode] = useState(false);
  const demoModeRef = useRef(false);
  const [myRidesTab, setMyRidesTab] = useState("posted");
  const [activeTab, setActiveTab] = useState("rides");
  const [selectedRide, setSelectedRide] = useState(null);
  const [postConfirmation, setPostConfirmation] = useState("");
  const [ridePostBusy, setRidePostBusy] = useState(false);
  const [ridePostError, setRidePostError] = useState("");
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return undefined;
    }

    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setAuthError("We couldn’t restore your sign-in session. Please refresh and try again.");
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
        setMyRides([]);
        setImpactData(null);
        setImpactError("");
        demoModeRef.current = false;
        setDemoMode(false);
        setSelectedRide(null);
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
          setProfileError("We couldn’t load your profile. Check your connection and try again.");
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
      setAuthError("We couldn’t complete that sign-in request. Check your details and try again.");
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
      setProfileError("We couldn’t save your profile. Check your connection and try again.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function loadRides() {
    if (!supabase || !user || !profile) return;
    setRidesLoading(true);
    setRidesError("");
    try {
      const { error: completionError } = await supabase.rpc("mark_departed_rides_completed");
      if (completionError) throw completionError;
      const { data, error } = await supabase
        .from("rides")
        .select("id, from_location, to_location, depart_at, seats_total, estimated_total_fare, distance_km, women_only, posted_by, status, note, poster:students!rides_posted_by_fkey(name), ride_members(count)")
        .in("status", ["open", "full"])
        .gte("depart_at", new Date().toISOString())
        .order("depart_at", { ascending: true });

      if (error) throw error;
      if (demoModeRef.current) return;
      setRides((data || []).map(mapDatabaseRide));
    } catch (error) {
      if (!demoModeRef.current) setRidesError("We couldn’t load rides right now. Check your connection and try again.");
    } finally {
      setRidesLoading(false);
    }
  }

  async function loadMyRides() {
    if (!supabase || !user || !profile) return;
    setMyRidesLoading(true);
    setMyRidesError("");
    const selection = "id, from_location, to_location, depart_at, seats_total, estimated_total_fare, distance_km, women_only, posted_by, status, note, poster:students!rides_posted_by_fkey(name), ride_members(count)";
    try {
      const { error: completionError } = await supabase.rpc("mark_departed_rides_completed");
      if (completionError) throw completionError;
      const [{ data: posted, error: postedError }, { data: memberships, error: membershipError }] = await Promise.all([
        supabase.from("rides").select(selection).eq("posted_by", user.id),
        supabase.from("ride_members").select("ride_id").eq("student_id", user.id),
      ]);
      if (postedError) throw postedError;
      if (membershipError) throw membershipError;
      const joinedIds = [...new Set((memberships || []).map((item) => item.ride_id))];
      let joined = [];
      if (joinedIds.length) {
        const { data, error } = await supabase.from("rides").select(selection).in("id", joinedIds);
        if (error) throw error;
        joined = data || [];
      }
      const rows = new Map();
      [...(posted || []), ...joined].forEach((row) => rows.set(row.id, row));
      const mapped = [...rows.values()].map(mapDatabaseRide).sort((a, b) => a.departAt - b.departAt);
      if (demoModeRef.current) return;
      setMyRides(mapped);
    } catch (error) {
      if (!demoModeRef.current) setMyRidesError("We couldn’t load your rides right now. Please try again.");
    } finally {
      setMyRidesLoading(false);
    }
  }

  async function refreshRideLists() {
    await Promise.all([loadRides(), loadMyRides()]);
  }

  async function loadImpact() {
    if (!supabase || !user || !profile) return;
    setImpactLoading(true);
    setImpactError("");
    try {
      const { error: completionError } = await supabase.rpc("mark_departed_rides_completed");
      if (completionError) throw completionError;
      const [{ data: completedRides, error: ridesError }, { data: memberships, error: membershipsError }] = await Promise.all([
        supabase
          .from("rides")
          .select("id, depart_at, distance_km, estimated_total_fare, posted_by, status, ride_members(count)")
          .eq("status", "completed")
          .lte("depart_at", new Date().toISOString())
          .order("depart_at", { ascending: false }),
        supabase.from("ride_members").select("ride_id").eq("student_id", user.id),
      ]);
      if (ridesError) throw ridesError;
      if (membershipsError) throw membershipsError;
      const rows = completedRides || [];
      const joinedIds = new Set((memberships || []).map((item) => item.ride_id));
      const myCompletedRides = rows.filter((ride) => ride.posted_by === user.id || joinedIds.has(ride.id));
      if (demoModeRef.current) return;
      setImpactData({
        campus: summarizeImpact(rows),
        mine: summarizeImpact(myCompletedRides),
        weeks: getLastEightWeeks(rows),
      });
    } catch (error) {
      if (!demoModeRef.current) setImpactError("We couldn’t load impact totals right now. Please try again.");
    } finally {
      setImpactLoading(false);
    }
  }

  function loadDemoData(preserveTab = false) {
    const demo = createDemoDataset(user.id, profile?.name || "You");
    demoModeRef.current = true;
    setDemoMode(true);
    setRides(demo.upcomingRides);
    setMyRides(demo.myRides);
    setImpactData(demo.impactData);
    setRidesError("");
    setMyRidesError("");
    setImpactError("");
    setRidesLoading(false);
    setMyRidesLoading(false);
    setImpactLoading(false);
    setSelectedRide(null);
    setPostConfirmation("");
    if (!preserveTab) setActiveTab("rides");
  }

  function removeDemoData() {
    demoModeRef.current = false;
    setDemoMode(false);
    setSelectedRide(null);
    setPostConfirmation("");
    setImpactData(null);
    setRidesError("");
    setMyRidesError("");
    setImpactError("");
    setRides([]);
    setMyRides([]);
    setActiveTab("rides");
    loadRides();
    loadMyRides();
  }

  async function saveRide(draft) {
    setRidePostError("");
    if (demoModeRef.current) {
      setRidePostError("Demo mode is read-only. Remove demo data to post a live ride.");
      return;
    }
    setRidePostBusy(true);
    try {
      const { data, error } = await supabase
        .from("rides")
        .insert({
          from_location: draft.from,
          to_location: draft.to,
          depart_at: draft.departAt,
          seats_total: draft.seatsTotal,
          estimated_total_fare: draft.fare,
          distance_km: draft.distanceKm,
          women_only: draft.womenOnly,
          note: draft.note,
          posted_by: user.id,
        })
        .select("id, from_location, to_location, depart_at, seats_total, estimated_total_fare, distance_km, women_only, posted_by, status, note")
        .single();

      if (error) throw error;
      const ride = mapDatabaseRide({
        ...data,
        poster: { name: profile.name },
        ride_members: [{ count: 0 }],
      });
      setRides((current) => [ride, ...current.filter((item) => item.id !== ride.id)]);
      setSelectedRide(ride);
      setPostConfirmation("Ride posted successfully. You’re the first rider.");
      setActiveTab("rides");
      loadMyRides();
    } catch (error) {
      setRidePostError("We couldn’t post the ride right now. Check your connection and try again.");
    } finally {
      setRidePostBusy(false);
    }
  }

  useEffect(() => {
    if (user && profile) loadRides();
    else setRides([]);
  }, [user?.id, profile?.id]);

  useEffect(() => {
    if (activeTab === "my-rides" && user && profile && !demoMode) loadMyRides();
    else if (!user || !profile) setMyRides([]);
  }, [activeTab, user?.id, profile?.id, demoMode]);

  useEffect(() => {
    if (activeTab === "impact" && user && profile && !demoMode) loadImpact();
  }, [activeTab, user?.id, profile?.id, demoMode]);

  async function signOut() {
    setSignOutError("");
    const { error } = await supabase.auth.signOut();
    if (error) setSignOutError("We couldn’t sign out right now. Please try again.");
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
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green-700 text-white" aria-hidden="true"><CarIcon className="h-6 w-6" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">Campus Cab Share</p>
              <p className="max-w-[17rem] text-xs leading-4 text-slate-500">{APP_TAGLINE}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {(activeTab === "rides" || activeTab === "impact") && !selectedRide && (
              <button type="button" onClick={demoMode ? () => loadDemoData(true) : activeTab === "rides" ? loadRides : loadImpact} disabled={!demoMode && (activeTab === "rides" ? ridesLoading : impactLoading)} className={"h-11 rounded-lg px-3 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50 " + FOCUS_RING}>
                {!demoMode && (activeTab === "rides" ? ridesLoading : impactLoading) ? "Loading…" : "Refresh"}
              </button>
            )}
            {!demoMode && <button type="button" onClick={loadDemoData} className={"h-11 rounded-lg px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 " + FOCUS_RING}>Load demo data</button>}
            <button type="button" onClick={signOut} className={"h-11 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 " + FOCUS_RING}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-5">
        {demoMode && <div role="status" className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"><span><strong>DEMO DATA</strong> · local preview only; not saved to Supabase. Includes 15 completed and 6 upcoming rides.</span><button type="button" onClick={removeDemoData} className={"inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-amber-950 underline " + FOCUS_RING}>Remove demo data</button></div>}
        {signOutError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{signOutError}</p>}
        {profileError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{profileError}</p>}
        {activeTab === "rides" && (
          selectedRide ? (
            <RideDetailsScreen key={selectedRide.id} ride={selectedRide} user={user} profile={profile} confirmation={postConfirmation} onBack={() => { setSelectedRide(null); setPostConfirmation(""); }} onDataChanged={refreshRideLists} />
          ) : (
            <>
              {ridesError && !demoMode && (
                <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                  <span>{ridesError}</span>
                  <button type="button" onClick={loadRides} className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 font-semibold underline">Retry</button>
                </div>
              )}
              <RidesScreen
                rides={rides}
                onPost={() => { setSelectedRide(null); setPostConfirmation(""); setRidePostError(""); setActiveTab("post"); }}
                onSelect={(ride) => { setSelectedRide(ride); setPostConfirmation(""); }}
                loading={ridesLoading}
              />
            </>
          )
        )}
        {activeTab === "post" && (
          <PostRideScreen
            onSave={saveRide}
            onCancel={() => { setRidePostError(""); setActiveTab("rides"); }}
            busy={ridePostBusy}
            error={ridePostError}
          />
        )}
        {activeTab === "my-rides" && (
          selectedRide ? (
            <RideDetailsScreen key={selectedRide.id} ride={selectedRide} user={user} profile={profile} confirmation={postConfirmation} onBack={() => { setSelectedRide(null); setPostConfirmation(""); }} onDataChanged={refreshRideLists} />
          ) : (
            <MyRidesScreen
              rides={myRides}
              loading={myRidesLoading}
              error={myRidesError}
              onRetry={loadMyRides}
              userId={user.id}
              onSelect={(ride) => { setSelectedRide(ride); setPostConfirmation(""); }}
              onPost={() => { setSelectedRide(null); setPostConfirmation(""); setRidePostError(""); setActiveTab("post"); }}
              onBrowse={() => { setSelectedRide(null); setPostConfirmation(""); setActiveTab("rides"); }}
              activeSection={myRidesTab}
              onSectionChange={setMyRidesTab}
            />
          )
        )}
        {activeTab === "impact" && <ImpactScreen data={impactData} loading={impactLoading} error={impactError} onRetry={loadImpact} />}
      </main>
      <BottomNav
        activeTab={activeTab}
        onChange={(tab) => { setSelectedRide(null); setPostConfirmation(""); setRidePostError(""); setActiveTab(tab); }}
      />
    </div>
  );
}

function isBennettEmail(email) {
  return typeof email === "string" && email.trim().toLowerCase().endsWith(UNIVERSITY_EMAIL_SUFFIX);
}
