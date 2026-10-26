import type { DB, Modality, Program, TutorProfile } from "./types";
import {
  BASE_RATES,
  FACE_TO_FACE_PREMIUM,
  HOURS,
  PLAYGROUP_MONTHLY_FEE,
  READING_PREMIUM,
  bandOf,
} from "./constants";
import { addDays, parseISO, rangeDates, todayISO, weekday } from "./dates";

// ---------- Rates ----------
export function computeRate(program: Program, grade: string, modality: Modality): number {
  if (program === "playgroup") return PLAYGROUP_MONTHLY_FEE;
  let rate = BASE_RATES[bandOf(grade || "Grade 1")];
  if (program === "reading") rate += READING_PREMIUM;
  if (modality === "face-to-face") rate += FACE_TO_FACE_PREMIUM;
  return rate;
}

// ---------- Dates for a booking ----------
export function expandBookingDates(opts: {
  type: "one-time" | "recurring";
  date?: string;
  days?: number[];
  start?: string;
  end?: string;
}): string[] {
  if (opts.type === "one-time") return opts.date ? [opts.date] : [];
  if (!opts.start || !opts.end || !opts.days?.length) return [];
  return rangeDates(opts.start, opts.end).filter((d) => opts.days!.includes(weekday(d)));
}

// ---------- Leave / availability / sessions ----------
export function onApprovedLeave(db: DB, tutorId: string, date: string) {
  return db.leaves.some((l) => l.tutorId === tutorId && l.status === "approved" && date >= l.startDate && date <= l.endDate);
}

/** Only ADMIN-APPROVED availability counts. Pending/rejected are ignored. */
export function approvedSlot(db: DB, tutorId: string, date: string, time: string, modality: Modality) {
  return db.availability.some(
    (a) =>
      a.tutorId === tutorId &&
      a.status === "approved" &&
      a.date === date &&
      a.slots.includes(time) &&
      a.modalities.includes(modality),
  );
}

export function tutorBusy(db: DB, tutorId: string, date: string, time: string, ignoreBookingId?: string) {
  const hasSession = db.sessions.some(
    (s) =>
      s.tutorId === tutorId &&
      s.date === date &&
      s.time === time &&
      (s.status === "scheduled" || s.status === "needs_reassignment") &&
      s.bookingId !== ignoreBookingId,
  );
  if (hasSession) return true;
  // Temporary reservation: top recommendation of a booking still awaiting admin review.
  return db.bookings.some(
    (b) =>
      b.id !== ignoreBookingId &&
      b.status === "awaiting_admin" &&
      b.recommendations[0] === tutorId &&
      b.time === time &&
      b.dates.includes(date),
  );
}

export function tutorAssessmentBusy(db: DB, tutorId: string, date: string, time: string) {
  return tutorBusy(db, tutorId, date, time);
}

export function roomFreeFor(db: DB, date: string, time: string, ignoreBookingId?: string): string | null {
  for (const r of db.rooms) {
    if (r.name.toLowerCase().includes("playroom")) continue;
    const usedBySession = db.sessions.some(
      (s) =>
        s.roomId === r.id &&
        s.date === date &&
        s.time === time &&
        s.status === "scheduled" &&
        s.bookingId !== ignoreBookingId,
    );
    const usedByAssessment = db.assessments.some(
      (a) => a.roomId === r.id && a.date === date && a.time === time && a.status === "booked",
    );
    if (!usedBySession && !usedByAssessment) return r.id;
  }
  return null;
}

// ---------- Ratings ----------
export function tutorRating(db: DB, tutorId: string): number | null {
  const rated = db.sessions.filter((s) => s.tutorId === tutorId && typeof s.rating === "number");
  if (!rated.length) return null;
  return rated.reduce((a, s) => a + (s.rating || 0), 0) / rated.length;
}

// ---------- Matching ----------
export interface MatchParams {
  program: Exclude<Program, "playgroup">;
  subject: string;
  gradeLevel: string;
  modality: Modality;
  dates: string[];
  time: string;
  ignoreBookingId?: string;
  preferTutorId?: string;
}

export interface TutorMatch {
  tutor: TutorProfile;
  coverage: number;
  total: number;
  full: boolean;
  score: number;
  rating: number | null;
  missingDates: string[];
}

export function tutorQualifies(t: TutorProfile, p: Pick<MatchParams, "program" | "subject" | "gradeLevel">) {
  if (t.status !== "active") return false;
  const needSubject = p.program === "reading" ? "Reading" : p.subject;
  if (!t.subjects.includes(needSubject)) return false;
  return t.gradeBands.includes(bandOf(p.gradeLevel));
}

export function tutorFreeOn(db: DB, t: TutorProfile, p: MatchParams, date: string) {
  if (date < todayISO()) return false;
  if (!approvedSlot(db, t.userId, date, p.time, p.modality)) return false;
  if (onApprovedLeave(db, t.userId, date)) return false;
  if (tutorBusy(db, t.userId, date, p.time, p.ignoreBookingId)) return false;
  if (p.modality === "face-to-face" && !roomFreeFor(db, date, p.time, p.ignoreBookingId)) return false;
  return true;
}

export function matchTutors(db: DB, p: MatchParams): TutorMatch[] {
  const out: TutorMatch[] = [];
  for (const t of db.tutors) {
    if (!tutorQualifies(t, p)) continue;
    const ok = p.dates.filter((d) => tutorFreeOn(db, t, p, d));
    if (!ok.length) continue;
    const rating = tutorRating(db, t.userId);
    const full = ok.length === p.dates.length;
    const sameTutorBonus = p.preferTutorId === t.userId ? 15 : 0;
    const score = (ok.length / p.dates.length) * 100 + (rating ?? 4) * 4 + sameTutorBonus + (full ? 40 : 0);
    out.push({
      tutor: t,
      coverage: ok.length,
      total: p.dates.length,
      full,
      score,
      rating,
      missingDates: p.dates.filter((d) => !ok.includes(d)),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Time slots on a date with number of compatible tutors who are free. */
export function timesForDate(db: DB, base: Omit<MatchParams, "dates" | "time">, date: string) {
  return HOURS.map((time) => {
    const m = matchTutors(db, { ...base, dates: [date], time });
    return { time, count: m.length };
  });
}

export function dateHasTutors(db: DB, base: Omit<MatchParams, "dates" | "time">, date: string) {
  return timesForDate(db, base, date).some((t) => t.count > 0);
}

/** Alternative slots: first on same date other hours, then upcoming days. */
export function alternativeSlots(db: DB, base: Omit<MatchParams, "dates" | "time">, aroundDate: string, limit = 8) {
  const out: { date: string; time: string; count: number }[] = [];
  const startFrom = aroundDate < todayISO() ? todayISO() : aroundDate;
  for (let i = 0; i < 30 && out.length < limit; i++) {
    const date = addDays(startFrom, i);
    for (const t of timesForDate(db, base, date)) {
      if (t.count > 0 && out.length < limit) out.push({ date, time: t.time, count: t.count });
    }
  }
  return out;
}

// ---------- Playgroup ----------
export function cohortSessionDates(c: { startDate: string; weekdays: number[]; sessionsCount: number }) {
  const dates: string[] = [];
  let cur = c.startDate;
  let guard = 0;
  while (dates.length < c.sessionsCount && guard++ < 120) {
    if (c.weekdays.includes(weekday(cur))) dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

// ---------- Payroll ----------
export function payrollFor(db: DB, tutorId: string, period: string) {
  const t = db.tutors.find((x) => x.userId === tutorId);
  if (!t) return null;
  const done = db.sessions.filter(
    (s) => s.tutorId === tutorId && s.status === "completed" && s.attended !== false && s.date.startsWith(period),
  );
  const hours = done.length; // 1-hour sessions
  const amount = hours * t.hourlyRate + t.fixedSalary;
  return { tutorId, period, hours, hourlyRate: t.hourlyRate, fixedSalary: t.fixedSalary, amount };
}

export function isPastSession(date: string, time: string) {
  const d = parseISO(date);
  const [h, m] = time.split(":").map(Number);
  d.setHours(h + 1, m, 0, 0);
  return d.getTime() < Date.now();
}
