"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type {
  Availability,
  Booking,
  DB,
  Material,
  Modality,
  Notification,
  Program,
  Session,
  TuteeProfile,
  TutorProfile,
  User,
} from "./types";
import { ADMIN_ID, buildSeed } from "./seed";
import { addDays, ageFromBirthday, isBirthdayToday, nowISO, todayISO, uid, fmtDate, fmtTime, rangeDates } from "./dates";
import {
  cohortSessionDates,
  computeRate,
  matchTutors,
  onApprovedLeave,
  payrollFor,
  roomFreeFor,
  tutorBusy,
  tutorFreeOn,
  approvedSlot,
} from "./logic";
import { PLAYGROUP_MONTHLY_FEE } from "./constants";

const DB_KEY = "whizzkids-db-v1";
const SESSION_KEY = "whizzkids-session-v1";
const CLEAN_START_KEY = "whizzkids-clean-start-v2";

type Result<T = {}> = ({ ok: true } & T) | { ok: false; error: string };

export interface Store {
  db: DB;
  ready: boolean;
  me: User | null;
  login: (identifier: string, password: string) => Result<{ user: User }>;
  logout: () => void;
  resetDemo: () => void;

  registerTutee: (v: { email: string; username: string; password: string }) => Result<{ user: User }>;
  registerTutor: (v: {
    email: string;
    username: string;
    password: string;
    applicantType: "new" | "existing";
    fullName: string;
    age: number | null;
    contact: string;
    photo: string;
    resumeName: string;
    resumeData: string;
    subjects: string[];
    gradeBands: string[];
    bio: string;
    birthday?: string;
  }) => Result<{ user: User }>;

  notify: (userId: string, text: string, channels?: Notification["channels"]) => void;
  markNotificationsRead: (userId: string) => void;
  sendMessage: (threadId: string, fromId: string, text: string) => void;

  saveTuteeProfile: (userId: string, p: Partial<TuteeProfile>) => void;
  saveTutorProfile: (userId: string, p: Partial<TutorProfile>) => void;

  bookAssessment: (tuteeId: string, modality: Modality, date: string, time: string) => Result<{ id: string }>;
  completeAssessment: (id: string, v: { results: string; learningNeeds: string; readingLevel: string }) => void;
  cancelAssessment: (id: string) => void;
  bookPlaygroup: (tuteeId: string, cohortId: string) => Result<{ bookingId: string }>;
  submitTutorialBooking: (v: {
    tuteeId: string;
    program: "reading" | "academic";
    subject: string;
    gradeLevel: string;
    modality: Modality;
    learningNeeds: string;
    bookingType: "one-time" | "recurring";
    dates: string[];
    time: string;
    recurrence?: { days: number[]; start: string; end: string };
    assessmentId?: string;
  }) => Result<{ bookingId: string }>;
  placeOrder: (tuteeId: string, items: { sku: string; name: string; qty: number; price: number }[]) => void;
  rateSession: (sessionId: string, rating: number, feedback: string) => void;

  // tutor
  submitAvailability: (
    tutorId: string,
    entries: { date: string; slots: string[] }[],
    modalities: Modality[],
    note: string,
  ) => Result<{ conflicts: string[] }>;
  submitLeave: (tutorId: string, startDate: string, endDate: string, reason: string) => void;

  // admin
  scheduleInterview: (tutorId: string, at: string, notes: string) => void;
  evaluateApplicant: (tutorId: string, accept: boolean, reason?: string) => void;
  verifyExistingTutor: (tutorId: string, approve: boolean, reason?: string) => void;
  setTutorPay: (tutorId: string, hourlyRate: number, fixedSalary: number) => void;
  approveAvailability: (batchId: string) => void;
  rejectAvailability: (batchId: string, reason: string) => void;
  decideLeave: (leaveId: string, approve: boolean) => void;
  adminLeave: (adminId: string, startDate: string, endDate: string, reason: string) => void;
  confirmBooking: (bookingId: string, tutorId: string, allowPartial?: boolean) => Result<{ missing: string[] }>;
  rejectBooking: (bookingId: string, reason: string) => void;
  terminateBooking: (bookingId: string, reason: string) => void;
  completeSession: (sessionId: string, attended: boolean) => void;
  reassignSession: (sessionId: string, tutorId: string) => Result;
  cancelSession: (sessionId: string) => void;
  updateCohort: (id: string, p: Partial<DB["cohorts"][number]>) => void;
  addCohort: (c: Omit<DB["cohorts"][number], "id" | "enrolled">) => void;
  removeFromCohort: (cohortId: string, tuteeId: string) => void;
  addRoom: (name: string, capacity: number) => void;
  updatePurchase: (id: string, status: "pending" | "paid" | "released") => void;
  addMaterial: (m: Omit<Material, "id" | "uploadedAt" | "revoked">) => void;
  updateMaterial: (id: string, p: Partial<Material>) => void;
  deleteMaterial: (id: string) => void;
  logMaterialAccess: (materialId: string, userId: string) => void;
  generatePayroll: (period: string) => void;
  markPayrollPaid: (id: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => ({ users: [] } as unknown as DB));
  const [ready, setReady] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const ref = useRef<DB>(db);

  const commit = useCallback((next: DB) => {
    ref.current = next;
    setDb(next);
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(next));
    } catch {
      /* quota exceeded – mock storage only */
    }
  }, []);

  const mutate = useCallback(
    <T,>(fn: (d: DB) => T): T => {
      const next = structuredClone(ref.current);
      const out = fn(next);
      commit(next);
      return out;
    },
    [commit],
  );

  // ---- hydrate ----
  useEffect(() => {
    let initial: DB;
    let cleanStart = false;
    try {
      cleanStart = localStorage.getItem(CLEAN_START_KEY) !== "done";
    } catch {
      cleanStart = true;
    }
    if (cleanStart) {
      // Clear the old mock dataset once, while retaining the admin account for testing.
      initial = buildSeed();
      try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.setItem(CLEAN_START_KEY, "done");
      } catch {}
    } else {
      try {
        const raw = localStorage.getItem(DB_KEY);
        initial = raw ? JSON.parse(raw) : buildSeed();
      } catch {
        initial = buildSeed();
      }
      if (!initial.users?.length) initial = buildSeed();
    }
    ref.current = initial;
    setDb(initial);
    if (cleanStart) {
      try {
        localStorage.setItem(DB_KEY, JSON.stringify(initial));
      } catch {}
    }
    try {
      setMeId(localStorage.getItem(SESSION_KEY));
    } catch {}
    setReady(true);
  }, []);

  // cross-tab sync
  useEffect(() => {
    const on = (e: StorageEvent) => {
      if (e.key === DB_KEY && e.newValue) {
        try {
          const n = JSON.parse(e.newValue);
          ref.current = n;
          setDb(n);
        } catch {}
      }
    };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);

  const pushNotif = (d: DB, userId: string, text: string, channels: Notification["channels"] = ["web", "email"]) => {
    d.notifications.unshift({ id: uid("n"), userId, text, at: nowISO(), read: false, channels });
  };
  const pushAdmins = (d: DB, text: string) => d.users.filter((u) => u.role === "admin").forEach((a) => pushNotif(d, a.id, text, ["web"]));
  const logAct = (d: DB, userId: string, kind: DB["activities"][number]["kind"], text: string) =>
    d.activities.unshift({ id: uid("a"), userId, kind, text, at: nowISO() });
  const nameOf = (d: DB, id: string) =>
    d.tutees.find((t) => t.userId === id)?.fullName || d.tutors.find((t) => t.userId === id)?.fullName || (id === ADMIN_ID ? "Admin" : id);

  const me = useMemo(() => db.users?.find((u) => u.id === meId) ?? null, [db, meId]);

  // ---- automated birthday greetings ----
  useEffect(() => {
    if (!ready) return;
    const year = new Date().getFullYear();
    const d = ref.current;
    const due = [
      ...d.tutees.filter((t) => isBirthdayToday(t.birthday) && t.lastGreetingYear !== year).map((t) => ({ kind: "tutee" as const, id: t.userId, name: t.fullName })),
      ...d.tutors.filter((t) => t.birthday && isBirthdayToday(t.birthday) && t.lastGreetingYear !== year).map((t) => ({ kind: "tutor" as const, id: t.userId, name: t.fullName })),
    ];
    if (!due.length) return;
    mutate((n) => {
      due.forEach((p) => {
        const text = `🎂 Happy Birthday, ${p.name.split(" ")[0]}! All of us at Whizzkids wish you a day full of joy and learning.`;
        n.messages.push({ id: uid("m"), threadId: p.id, fromId: ADMIN_ID, text, at: nowISO(), auto: true });
        pushNotif(n, p.id, text, ["web", "email", "sms"]);
        if (p.kind === "tutee") {
          const t = n.tutees.find((x) => x.userId === p.id)!;
          t.lastGreetingYear = year;
        } else {
          const t = n.tutors.find((x) => x.userId === p.id)!;
          t.lastGreetingYear = year;
        }
      });
    });
  }, [ready, mutate]);

  const store: Store = useMemo(() => {
    const get = () => ref.current;

    const s: Store = {
      db,
      ready,
      me,

      // ---------- Auth ----------
      login(identifier, password) {
        const id = identifier.trim().toLowerCase();
        const u = get().users.find((x) => (x.email.toLowerCase() === id || x.username.toLowerCase() === id) && x.password === password);
        if (!u) return { ok: false, error: "Invalid email/username or password." };
        setMeId(u.id);
        try {
          localStorage.setItem(SESSION_KEY, u.id);
        } catch {}
        return { ok: true, user: u };
      },
      logout() {
        setMeId(null);
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {}
      },
      resetDemo() {
        const seed = buildSeed();
        commit(seed);
        setMeId(null);
        try {
          localStorage.removeItem(SESSION_KEY);
        } catch {}
      },

      registerTutee(v) {
        const d = get();
        if (d.users.some((u) => u.email.toLowerCase() === v.email.toLowerCase())) return { ok: false, error: "Email is already registered." };
        if (d.users.some((u) => u.username.toLowerCase() === v.username.toLowerCase())) return { ok: false, error: "Username is taken." };
        const user: User = { id: uid("u"), role: "tutee", email: v.email, username: v.username, password: v.password, createdAt: nowISO() };
        mutate((n) => {
          n.users.push(user);
          n.tutees.push({ userId: user.id, fullName: "", age: null, birthday: "", gradeLevel: "", contact: "", guardianName: "", complete: false });
          n.messages.push({ id: uid("m"), threadId: user.id, fromId: ADMIN_ID, text: "Welcome to Whizzkids! Please complete your child's profile to start booking.", at: nowISO(), auto: true });
          pushNotif(n, user.id, "Welcome to Whizzkids! Complete your child's profile to start booking.");
          pushAdmins(n, `New tutee/parent account registered: ${v.username}`);
        });
        setMeId(user.id);
        try {
          localStorage.setItem(SESSION_KEY, user.id);
        } catch {}
        return { ok: true, user };
      },

      registerTutor(v) {
        const d = get();
        if (d.users.some((u) => u.email.toLowerCase() === v.email.toLowerCase())) return { ok: false, error: "Email is already registered." };
        if (d.users.some((u) => u.username.toLowerCase() === v.username.toLowerCase())) return { ok: false, error: "Username is taken." };
        const user: User = { id: uid("u"), role: "tutor", email: v.email, username: v.username, password: v.password, createdAt: nowISO() };
        mutate((n) => {
          n.users.push(user);
          n.tutors.push({
            userId: user.id,
            applicantType: v.applicantType,
            status: v.applicantType === "new" ? "pending_review" : "pending_verification",
            fullName: v.fullName,
            photo: v.photo,
            age: v.age,
            contact: v.contact,
            resumeName: v.resumeName,
            resumeData: v.resumeData,
            bio: v.bio,
            subjects: v.subjects,
            gradeBands: v.gradeBands,
            hourlyRate: 200,
            fixedSalary: 0,
            birthday: v.birthday,
          });
          pushAdmins(n, `${v.applicantType === "new" ? "New tutor application" : "Existing tutor registration"} from ${v.fullName}`);
          pushNotif(n, user.id, v.applicantType === "new" ? "Application received. Status: Pending Review." : "Registration received. Status: Pending Verification.");
        });
        setMeId(user.id);
        try {
          localStorage.setItem(SESSION_KEY, user.id);
        } catch {}
        return { ok: true, user };
      },

      // ---------- Generic ----------
      notify(userId, text, channels = ["web", "email"]) {
        mutate((n) => pushNotif(n, userId, text, channels));
      },
      markNotificationsRead(userId) {
        mutate((n) => n.notifications.filter((x) => x.userId === userId).forEach((x) => (x.read = true)));
      },
      sendMessage(threadId, fromId, text) {
        if (!text.trim()) return;
        mutate((n) => {
          n.messages.push({ id: uid("m"), threadId, fromId, text: text.trim(), at: nowISO() });
          const fromAdmin = n.users.find((u) => u.id === fromId)?.role === "admin";
          if (fromAdmin) pushNotif(n, threadId, "New message from Admin", ["web", "email", "sms"]);
          else pushAdmins(n, `New message from ${nameOf(n, fromId)}`);
        });
      },
      saveTuteeProfile(userId, p) {
        mutate((n) => {
          const t = n.tutees.find((x) => x.userId === userId);
          if (!t) return;
          Object.assign(t, p);
          if (t.birthday) t.age = ageFromBirthday(t.birthday);
          t.complete = !!(t.fullName && t.birthday && t.gradeLevel && t.contact);
        });
      },
      saveTutorProfile(userId, p) {
        mutate((n) => {
          const t = n.tutors.find((x) => x.userId === userId);
          if (t) Object.assign(t, p);
        });
      },

      // ---------- Tutee flows ----------
      bookAssessment(tuteeId, modality, date, time) {
        const d = get();
        if (d.assessments.some((a) => a.tuteeId === tuteeId && a.status === "booked"))
          return { ok: false, error: "You already have an upcoming assessment. Cancel it first to rebook." };
        if (d.assessments.some((a) => a.date === date && a.time === time && a.status === "booked"))
          return { ok: false, error: "That slot was just taken. Please pick another." };
        let roomId: string | undefined;
        if (modality === "face-to-face") {
          const r = roomFreeFor(d, date, time);
          if (!r) return { ok: false, error: "No room is free at that time." };
          roomId = r;
        }
        const id = uid("as");
        mutate((n) => {
          n.assessments.push({ id, tuteeId, modality, date, time, status: "booked", roomId });
          pushNotif(n, tuteeId, `Assessment booked: ${fmtDate(date)} at ${fmtTime(time)} (${modality}).`, ["web", "email", "sms"]);
          pushAdmins(n, `Reading assessment booked by ${nameOf(n, tuteeId)} — ${fmtDate(date)} ${fmtTime(time)}`);
          logAct(n, tuteeId, "booking", `Booked initial reading assessment on ${fmtDate(date)} ${fmtTime(time)}`);
        });
        return { ok: true, id };
      },
      completeAssessment(id, v) {
        mutate((n) => {
          const a = n.assessments.find((x) => x.id === id);
          if (!a) return;
          a.status = "completed";
          a.results = v.results;
          a.learningNeeds = v.learningNeeds;
          a.readingLevel = v.readingLevel;
          pushNotif(n, a.tuteeId, "Your assessment results are in! You can now proceed to Reading Program booking & matching.", ["web", "email", "sms"]);
          logAct(n, a.tuteeId, "match", `Assessment completed — level: ${v.readingLevel}`);
        });
      },
      cancelAssessment(id) {
        mutate((n) => {
          const a = n.assessments.find((x) => x.id === id);
          if (a) a.status = "cancelled";
        });
      },
      bookPlaygroup(tuteeId, cohortId) {
        const d = get();
        const c = d.cohorts.find((x) => x.id === cohortId);
        if (!c) return { ok: false, error: "Class not found." };
        if (c.enrolled.includes(tuteeId)) return { ok: false, error: "You are already enrolled in this class." };
        if (c.enrolled.length >= c.capacity) return { ok: false, error: "This class is full. Please choose another schedule." };
        const bookingId = uid("b");
        const tutee = d.tutees.find((t) => t.userId === tuteeId);
        mutate((n) => {
          const cc = n.cohorts.find((x) => x.id === cohortId)!;
          cc.enrolled.push(tuteeId);
          const dates = cohortSessionDates(cc);
          n.bookings.push({
            id: bookingId,
            tuteeId,
            program: "playgroup",
            subject: "Playgroup",
            gradeLevel: tutee?.gradeLevel || "Nursery",
            modality: "face-to-face",
            learningNeeds: "",
            bookingType: "recurring",
            dates,
            time: cc.time,
            ratePerHour: PLAYGROUP_MONTHLY_FEE,
            totalFee: PLAYGROUP_MONTHLY_FEE,
            status: "confirmed",
            recommendations: [],
            createdAt: nowISO(),
            cohortId,
            tutorId: cc.tutorId,
          });
          pushNotif(n, tuteeId, `Playgroup slot reserved: ${cc.label}, starting ${fmtDate(cc.startDate)}.`, ["web", "email", "sms"]);
          pushAdmins(n, `${nameOf(n, tuteeId)} reserved a slot in ${cc.label} (${cc.enrolled.length}/${cc.capacity})`);
          logAct(n, tuteeId, "booking", `Reserved playgroup slot: ${cc.label}`);
        });
        return { ok: true, bookingId };
      },
      submitTutorialBooking(v) {
        const d = get();
        const matches = matchTutors(d, {
          program: v.program,
          subject: v.subject,
          gradeLevel: v.gradeLevel,
          modality: v.modality,
          dates: v.dates,
          time: v.time,
        });
        if (!matches.length) return { ok: false, error: "No compatible tutors are available for that schedule." };
        const bookingId = uid("b");
        const rate = computeRate(v.program, v.gradeLevel, v.modality);
        mutate((n) => {
          const b: Booking = {
            id: bookingId,
            tuteeId: v.tuteeId,
            program: v.program,
            subject: v.program === "reading" ? "Reading" : v.subject,
            gradeLevel: v.gradeLevel,
            modality: v.modality,
            learningNeeds: v.learningNeeds,
            bookingType: v.bookingType,
            dates: v.dates,
            time: v.time,
            recurrence: v.recurrence,
            ratePerHour: rate,
            totalFee: rate * v.dates.length,
            status: "awaiting_admin",
            recommendations: matches.slice(0, 5).map((m) => m.tutor.userId),
            createdAt: nowISO(),
            assessmentId: v.assessmentId,
          };
          n.bookings.push(b);
          pushNotif(n, v.tuteeId, "Booking request submitted. Slots are temporarily reserved while our admin reviews tutor recommendations.", ["web", "email"]);
          pushAdmins(n, `New booking request from ${nameOf(n, v.tuteeId)} — ${b.subject}, ${v.dates.length} session(s). Review recommendations.`);
          logAct(n, v.tuteeId, "booking", `Requested ${b.subject} ${v.bookingType} booking (${v.dates.length} session/s)`);
        });
        return { ok: true, bookingId };
      },
      placeOrder(tuteeId, items) {
        const total = items.reduce((a, i) => a + i.qty * i.price, 0);
        mutate((n) => {
          n.purchases.unshift({ id: uid("p"), tuteeId, items, total, status: "pending", at: nowISO() });
          pushAdmins(n, `New purchase order from ${nameOf(n, tuteeId)} — ₱${total.toLocaleString()}`);
          pushNotif(n, tuteeId, `Order placed (₱${total.toLocaleString()}). Please settle payment at the center.`);
        });
      },
      rateSession(sessionId, rating, feedback) {
        mutate((n) => {
          const se = n.sessions.find((x) => x.id === sessionId);
          if (!se) return;
          se.rating = rating;
          se.feedback = feedback;
          logAct(n, se.tutorId, "rating", `Received ${rating}★ from ${nameOf(n, se.tuteeId)} (${fmtDate(se.date)})`);
          logAct(n, se.tuteeId, "rating", `Rated session on ${fmtDate(se.date)} ${rating}★`);
          logAct(n, ADMIN_ID, "rating", `${nameOf(n, se.tuteeId)} rated ${nameOf(n, se.tutorId)} ${rating}★`);
        });
      },

      // ---------- Tutor ----------
      submitAvailability(tutorId, entries, modalities, note) {
        const d = get();
        const conflicts: string[] = [];
        entries.forEach((e) => {
          d.sessions
            .filter((s) => s.tutorId === tutorId && s.date === e.date && s.status === "scheduled" && !e.slots.includes(s.time))
            .forEach((s) => conflicts.push(`${fmtDate(s.date)} ${fmtTime(s.time)}`));
        });
        const batchId = uid("batch");
        mutate((n) => {
          entries.forEach((e) => {
            // replace earlier pending records for this date
            n.availability = n.availability.filter((a) => !(a.tutorId === tutorId && a.date === e.date && a.status === "pending"));
            n.availability.push({
              id: uid("av"),
              batchId,
              tutorId,
              date: e.date,
              slots: e.slots,
              modalities,
              status: "pending",
              submittedAt: nowISO(),
              note: note + (conflicts.length ? ` [Conflicts with confirmed sessions: ${conflicts.join(", ")}]` : ""),
            });
          });
          pushAdmins(n, `${nameOf(n, tutorId)} submitted availability for ${entries.length} day(s)${conflicts.length ? " — conflicts with confirmed sessions!" : ""}`);
          pushNotif(n, tutorId, "Availability submitted. Status: Pending Approval. Pending slots cannot be booked.", ["web"]);
        });
        return { ok: true, conflicts };
      },
      submitLeave(tutorId, startDate, endDate, reason) {
        mutate((n) => {
          n.leaves.push({ id: uid("lv"), tutorId, startDate, endDate, reason, status: "pending", submittedAt: nowISO() });
          pushAdmins(n, `${nameOf(n, tutorId)} requested leave ${fmtDate(startDate)} – ${fmtDate(endDate)}`);
          pushNotif(n, tutorId, "Leave request submitted. Status: Pending Approval.", ["web"]);
        });
      },

      // ---------- Admin ----------
      scheduleInterview(tutorId, at, notes) {
        mutate((n) => {
          const t = n.tutors.find((x) => x.userId === tutorId);
          if (!t) return;
          t.status = "interview";
          t.interviewAt = at;
          t.interviewNotes = notes;
          pushNotif(n, tutorId, `Interview scheduled: ${new Date(at).toLocaleString()}. ${notes}`, ["web", "email", "sms"]);
        });
      },
      evaluateApplicant(tutorId, accept, reason) {
        mutate((n) => {
          const t = n.tutors.find((x) => x.userId === tutorId);
          if (!t) return;
          t.status = accept ? "active" : "rejected";
          t.rejectionReason = accept ? undefined : reason;
          pushNotif(
            n,
            tutorId,
            accept ? "Congratulations! Your application is approved. Your account is now a Tutor account." : `Your application was not approved. ${reason || ""}`,
            ["web", "email", "sms"],
          );
        });
      },
      verifyExistingTutor(tutorId, approve, reason) {
        mutate((n) => {
          const t = n.tutors.find((x) => x.userId === tutorId);
          if (!t) return;
          t.status = approve ? "active" : "rejected";
          t.rejectionReason = approve ? undefined : reason;
          pushNotif(n, tutorId, approve ? "Your tutor account is verified and active." : `Verification not approved: ${reason || "Please contact the admin."}`, ["web", "email"]);
        });
      },
      setTutorPay(tutorId, hourlyRate, fixedSalary) {
        mutate((n) => {
          const t = n.tutors.find((x) => x.userId === tutorId);
          if (t) {
            t.hourlyRate = hourlyRate;
            t.fixedSalary = fixedSalary;
          }
        });
      },
      approveAvailability(batchId) {
        mutate((n) => {
          const recs = n.availability.filter((a) => a.batchId === batchId && a.status === "pending");
          if (!recs.length) return;
          const tutorId = recs[0].tutorId;
          const flagged: string[] = [];
          recs.forEach((r) => {
            // supersede previously-approved record for the same day
            n.availability = n.availability.filter((a) => !(a.tutorId === r.tutorId && a.date === r.date && a.status === "approved" && a.id !== r.id));
            const rec = n.availability.find((a) => a.id === r.id)!;
            rec.status = "approved";
            // flag scheduled sessions that fall outside new slots
            n.sessions.forEach((s) => {
              if (s.tutorId === r.tutorId && s.date === r.date && s.status === "scheduled" && (!rec.slots.includes(s.time) || !rec.modalities.includes(s.modality))) {
                s.status = "needs_reassignment";
                flagged.push(s.id);
              }
            });
          });
          pushNotif(n, tutorId, "Your availability was approved. Approved slots are now bookable.", ["web", "email"]);
          if (flagged.length) pushAdmins(n, `${flagged.length} confirmed session(s) of ${nameOf(n, tutorId)} conflict with approved availability changes — reassign them.`);
        });
      },
      rejectAvailability(batchId, reason) {
        mutate((n) => {
          const recs = n.availability.filter((a) => a.batchId === batchId && a.status === "pending");
          recs.forEach((r) => {
            r.status = "rejected";
            r.note = (r.note || "") + ` Rejected: ${reason}`;
          });
          if (recs[0]) pushNotif(n, recs[0].tutorId, `Availability rejected. ${reason} You may revise and resubmit.`, ["web", "email"]);
        });
      },
      decideLeave(leaveId, approve) {
        mutate((n) => {
          const l = n.leaves.find((x) => x.id === leaveId);
          if (!l) return;
          l.status = approve ? "approved" : "rejected";
          if (!approve) {
            pushNotif(n, l.tutorId, "Your leave request was not approved. Existing schedule remains unchanged.", ["web", "email"]);
            return;
          }
          const affected = n.sessions.filter((s) => s.tutorId === l.tutorId && s.status === "scheduled" && s.date >= l.startDate && s.date <= l.endDate);
          affected.forEach((s) => (s.status = "needs_reassignment"));
          l.affectedSessionIds = affected.map((s) => s.id);
          pushNotif(n, l.tutorId, "Your leave request was approved.", ["web", "email"]);
          if (affected.length) pushAdmins(n, `Approved leave of ${nameOf(n, l.tutorId)} affects ${affected.length} confirmed session(s). Arrange rescheduling or tutor reassignment.`);
        });
      },
      adminLeave(adminId, startDate, endDate, reason) {
        mutate((n) => {
          n.leaves.push({ id: uid("lv"), tutorId: adminId, startDate, endDate, reason, status: "approved", submittedAt: nowISO() });
        });
      },
      confirmBooking(bookingId, tutorId, allowPartial = false) {
        const d = get();
        const b = d.bookings.find((x) => x.id === bookingId);
        if (!b) return { ok: false, error: "Booking not found." };
        const t = d.tutors.find((x) => x.userId === tutorId);
        if (!t) return { ok: false, error: "Tutor not found." };
        const p = {
          program: b.program as "reading" | "academic",
          subject: b.subject,
          gradeLevel: b.gradeLevel,
          modality: b.modality,
          dates: b.dates,
          time: b.time,
          ignoreBookingId: b.id,
        };
        const okDates = b.dates.filter((dt) => tutorFreeOn(d, t, p, dt));
        const missing = b.dates.filter((dt) => !okDates.includes(dt));
        if (!okDates.length) return { ok: false, error: "That tutor is no longer available for any requested date." };
        if (missing.length && !allowPartial) return { ok: false, error: `Tutor can't cover: ${missing.map(fmtDate).join(", ")}` };
        mutate((n) => {
          const bb = n.bookings.find((x) => x.id === bookingId)!;
          bb.status = "confirmed";
          bb.tutorId = tutorId;
          bb.dates = okDates;
          bb.totalFee = bb.ratePerHour * okDates.length;
          okDates.forEach((dt) => {
            const roomId = bb.modality === "face-to-face" ? roomFreeFor(n, dt, bb.time, bb.id) || undefined : undefined;
            const s: Session = { id: uid("s"), bookingId: bb.id, tutorId, tuteeId: bb.tuteeId, date: dt, time: bb.time, modality: bb.modality, roomId, status: "scheduled" };
            n.sessions.push(s);
          });
          const tn = nameOf(n, tutorId);
          const first = fmtDate(okDates[0]);
          pushNotif(n, bb.tuteeId, `Booking confirmed! Tutor ${tn} — ${bb.subject}, ${okDates.length} session(s) starting ${first} at ${fmtTime(bb.time)}.${missing.length ? ` Dates removed (tutor unavailable): ${missing.map(fmtDate).join(", ")}.` : ""}`, ["web", "email", "sms"]);
          pushNotif(n, tutorId, `New assignment: ${nameOf(n, bb.tuteeId)} — ${bb.subject}, ${okDates.length} session(s) from ${first} at ${fmtTime(bb.time)} (${bb.modality}).`, ["web", "email"]);
          logAct(n, bb.tuteeId, "match", `Matched with ${tn} for ${bb.subject}`);
          logAct(n, tutorId, "match", `Assigned to ${nameOf(n, bb.tuteeId)} for ${bb.subject}`);
          logAct(n, ADMIN_ID, "match", `Confirmed ${tn} ↔ ${nameOf(n, bb.tuteeId)} (${bb.subject})`);
        });
        return { ok: true, missing };
      },
      rejectBooking(bookingId, reason) {
        mutate((n) => {
          const b = n.bookings.find((x) => x.id === bookingId);
          if (!b) return;
          b.status = "rejected";
          b.terminationReason = reason;
          pushNotif(n, b.tuteeId, `We couldn't confirm your booking. ${reason} Please choose another schedule.`, ["web", "email", "sms"]);
        });
      },
      terminateBooking(bookingId, reason) {
        mutate((n) => {
          const b = n.bookings.find((x) => x.id === bookingId);
          if (!b) return;
          b.status = "terminated";
          b.terminatedAt = nowISO();
          b.terminationReason = reason;
          const today = todayISO();
          n.sessions.forEach((s) => {
            if (s.bookingId === bookingId && s.status !== "completed" && s.date >= today) s.status = "cancelled";
          });
          if (b.cohortId) {
            const c = n.cohorts.find((x) => x.id === b.cohortId);
            if (c) c.enrolled = c.enrolled.filter((x) => x !== b.tuteeId);
          }
          const txt = `Contract terminated: ${b.subject} (${reason || "completed"}).`;
          logAct(n, b.tuteeId, "termination", txt);
          if (b.tutorId) {
            logAct(n, b.tutorId, "termination", `${txt} Tutee: ${nameOf(n, b.tuteeId)}`);
            pushNotif(n, b.tutorId, `Contract with ${nameOf(n, b.tuteeId)} ended.`, ["web"]);
          }
          logAct(n, ADMIN_ID, "termination", `${txt} Tutee: ${nameOf(n, b.tuteeId)}`);
          pushNotif(n, b.tuteeId, txt, ["web", "email"]);
        });
      },
      completeSession(sessionId, attended) {
        mutate((n) => {
          const s = n.sessions.find((x) => x.id === sessionId);
          if (!s) return;
          s.status = "completed";
          s.attended = attended;
          const open = n.sessions.some((x) => x.bookingId === s.bookingId && x.status !== "completed" && x.status !== "cancelled");
          if (!open) {
            const b = n.bookings.find((x) => x.id === s.bookingId);
            if (b && b.status === "confirmed") b.status = "completed";
          }
          if (attended) pushNotif(n, s.tuteeId, `Session on ${fmtDate(s.date)} marked completed. Please rate your tutor!`, ["web"]);
        });
      },
      reassignSession(sessionId, tutorId) {
        const d = get();
        const s = d.sessions.find((x) => x.id === sessionId);
        if (!s) return { ok: false, error: "Session not found." };
        const t = d.tutors.find((x) => x.userId === tutorId);
        if (!t || t.status !== "active") return { ok: false, error: "Tutor not active." };
        if (!approvedSlot(d, tutorId, s.date, s.time, s.modality) || onApprovedLeave(d, tutorId, s.date) || tutorBusy(d, tutorId, s.date, s.time, undefined))
          return { ok: false, error: "That tutor is not free for this slot (approved availability, leave and existing sessions are checked)." };
        mutate((n) => {
          const ss = n.sessions.find((x) => x.id === sessionId)!;
          const old = ss.tutorId;
          ss.tutorId = tutorId;
          ss.status = "scheduled";
          const b = n.bookings.find((x) => x.id === ss.bookingId);
          if (b && b.tutorId === old) b.tutorId = tutorId;
          pushNotif(n, ss.tuteeId, `Your session on ${fmtDate(ss.date)} now has a new tutor: ${nameOf(n, tutorId)}.`, ["web", "email", "sms"]);
          pushNotif(n, tutorId, `You were assigned a session on ${fmtDate(ss.date)} at ${fmtTime(ss.time)}.`, ["web", "email"]);
          pushNotif(n, old, `Your session on ${fmtDate(ss.date)} was reassigned.`, ["web"]);
        });
        return { ok: true };
      },
      cancelSession(sessionId) {
        mutate((n) => {
          const s = n.sessions.find((x) => x.id === sessionId);
          if (!s) return;
          s.status = "cancelled";
          pushNotif(n, s.tuteeId, `Your session on ${fmtDate(s.date)} was cancelled. We'll contact you about rescheduling.`, ["web", "email", "sms"]);
        });
      },
      updateCohort(id, p) {
        mutate((n) => {
          const c = n.cohorts.find((x) => x.id === id);
          if (c) Object.assign(c, p);
        });
      },
      addCohort(c) {
        mutate((n) => {
          n.cohorts.push({ ...c, id: uid("pg"), enrolled: [] });
        });
      },
      removeFromCohort(cohortId, tuteeId) {
        mutate((n) => {
          const c = n.cohorts.find((x) => x.id === cohortId);
          if (c) c.enrolled = c.enrolled.filter((x) => x !== tuteeId);
          n.bookings.forEach((b) => {
            if (b.cohortId === cohortId && b.tuteeId === tuteeId) b.status = "terminated";
          });
        });
      },
      addRoom(name, capacity) {
        mutate((n) => {
          n.rooms.push({ id: uid("room"), name, capacity });
        });
      },
      updatePurchase(id, status) {
        mutate((n) => {
          const p = n.purchases.find((x) => x.id === id);
          if (!p) return;
          p.status = status;
          pushNotif(n, p.tuteeId, `Your order is now marked "${status}".`, ["web", "email"]);
        });
      },
      addMaterial(m) {
        mutate((n) => {
          n.materials.unshift({ ...m, id: uid("mat"), uploadedAt: nowISO(), revoked: false });
          logAct(n, ADMIN_ID, "upload", `Uploaded learning material: ${m.title}`);
          if (m.allowTutees) n.tutees.forEach((t) => pushNotif(n, t.userId, `New learning material available: ${m.title}`, ["web"]));
          if (m.allowTutors) n.tutors.filter((t) => t.status === "active").forEach((t) => pushNotif(n, t.userId, `New learning material available: ${m.title}`, ["web"]));
        });
      },
      updateMaterial(id, p) {
        mutate((n) => {
          const m = n.materials.find((x) => x.id === id);
          if (m) Object.assign(m, p);
        });
      },
      deleteMaterial(id) {
        mutate((n) => {
          n.materials = n.materials.filter((m) => m.id !== id);
        });
      },
      logMaterialAccess(materialId, userId) {
        mutate((n) => {
          n.materialLogs.unshift({ id: uid("ml"), materialId, userId, at: nowISO() });
          const m = n.materials.find((x) => x.id === materialId);
          if (m) logAct(n, userId, "upload", `Viewed material: ${m.title}`);
        });
      },
      generatePayroll(period) {
        mutate((n) => {
          n.tutors
            .filter((t) => t.status === "active")
            .forEach((t) => {
              const p = payrollFor(n, t.userId, period);
              if (!p) return;
              const existing = n.payroll.find((r) => r.tutorId === t.userId && r.period === period);
              if (existing) {
                if (!existing.paid) Object.assign(existing, { hours: p.hours, hourlyRate: p.hourlyRate, fixedSalary: p.fixedSalary, amount: p.amount });
              } else {
                n.payroll.push({ id: uid("pr"), ...p, paid: false });
              }
            });
        });
      },
      markPayrollPaid(id) {
        mutate((n) => {
          const r = n.payroll.find((x) => x.id === id);
          if (!r) return;
          r.paid = true;
          r.paidAt = nowISO();
          pushNotif(n, r.tutorId, `Payroll for ${r.period} (₱${r.amount.toLocaleString()}) has been released.`, ["web", "email", "sms"]);
        });
      },
    };
    return s;
  }, [db, ready, me, commit, mutate]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

// helper re-exports for convenience
export { addDays, rangeDates };
export type { Availability, Program };
