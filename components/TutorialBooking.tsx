"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Repeat, Calendar as CalIcon } from "lucide-react";
import { Calendar } from "@/components/Calendar";
import { Alert, Badge, Button, Card, Field, Input, cn, peso } from "@/components/ui";
import { DAY_NAMES, addDays, fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { HOURS } from "@/lib/constants";
import { alternativeSlots, computeRate, dateHasTutors, expandBookingDates, matchTutors, timesForDate } from "@/lib/logic";
import { useStore } from "@/lib/store";
import type { Modality } from "@/lib/types";

export interface TutorialParams {
  program: "reading" | "academic";
  subject: string;
  gradeLevel: string;
  modality: Modality;
  learningNeeds: string;
  assessmentId?: string;
}

export function TutorialBooking({ params, tuteeId, onBack }: { params: TutorialParams; tuteeId: string; onBack?: () => void }) {
  const s = useStore();
  const [type, setType] = useState<"one-time" | "recurring">("one-time");
  const [date, setDate] = useState<string>("");
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState(addDays(todayISO(), 1));
  const [end, setEnd] = useState(addDays(todayISO(), 29));
  const [time, setTime] = useState("");
  const [err, setErr] = useState("");
  const [doneId, setDoneId] = useState<string | null>(null);

  const base = useMemo(
    () => ({ program: params.program, subject: params.subject, gradeLevel: params.gradeLevel, modality: params.modality }),
    [params.program, params.subject, params.gradeLevel, params.modality],
  );
  const rate = computeRate(params.program, params.gradeLevel, params.modality);

  const dates = useMemo(
    () => (type === "one-time" ? expandBookingDates({ type, date }) : expandBookingDates({ type, days, start, end })),
    [type, date, days, start, end],
  );

  // Time slots available (one-time: for that date; recurring: across all dates)
  const times = useMemo(() => {
    if (!dates.length) return [];
    if (type === "one-time") return timesForDate(s.db, base, dates[0]).map((t) => ({ time: t.time, full: t.count, any: t.count }));
    return HOURS.map((h) => {
      const m = matchTutors(s.db, { ...base, dates, time: h });
      return { time: h, full: m.filter((x) => x.full).length, any: m.length };
    });
  }, [s.db, base, dates, type]);

  const matches = useMemo(() => (dates.length && time ? matchTutors(s.db, { ...base, dates, time }) : []), [s.db, base, dates, time]);
  const noTutors = !!dates.length && !!time && matches.length === 0;
  const alts = useMemo(() => (noTutors ? alternativeSlots(s.db, base, dates[0]) : []), [noTutors, s.db, base, dates]);

  const calMarks = useMemo(() => {
    const cache: Record<string, boolean> = {};
    return (d: string) => (cache[d] ??= dateHasTutors(s.db, base, d));
  }, [s.db, base]);

  if (doneId) {
    const b = s.db.bookings.find((x) => x.id === doneId)!;
    return (
      <Card className="text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-mint-500" />
        <h2 className="mt-2 text-xl font-extrabold">Booking request submitted!</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Your {b.dates.length} slot(s) are temporarily reserved. Our admin will review the recommended tutors and confirm the assignment — you&apos;ll be notified on the web, by email and SMS.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/tutee/requests">
            <Button>View pending requests</Button>
          </Link>
          <Link href="/tutee">
            <Button variant="secondary">Back to overview</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const submit = () => {
    setErr("");
    const r = s.submitTutorialBooking({
      tuteeId,
      program: params.program,
      subject: params.subject,
      gradeLevel: params.gradeLevel,
      modality: params.modality,
      learningNeeds: params.learningNeeds,
      bookingType: type,
      dates,
      time,
      recurrence: type === "recurring" ? { days, start, end } : undefined,
      assessmentId: params.assessmentId,
    });
    if (!r.ok) return setErr(r.error);
    setDoneId(r.bookingId);
  };

  const topFull = matches.find((m) => m.full);

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-extrabold">{params.program === "reading" ? "Reading Program" : params.subject}</h2>
          <Badge status={params.modality} />
          <span className="text-sm text-slate-500">{params.gradeLevel}</span>
          <span className="ml-auto rounded-xl bg-mint-50 px-3 py-1 text-sm font-extrabold text-mint-600">{peso(rate)} / hour</span>
        </div>
        {params.learningNeeds && <p className="mt-2 text-sm text-slate-500">Learning needs: {params.learningNeeds}</p>}
        {onBack && (
          <button onClick={onBack} className="mt-2 text-xs font-bold text-brand-600">
            ← Change details
          </button>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {([["one-time", "One-time session", CalIcon], ["recurring", "Recurring sessions", Repeat]] as const).map(([k, label, Icon]) => (
          <button
            key={k}
            onClick={() => {
              setType(k);
              setTime("");
              setDate("");
            }}
            className={cn("flex items-center gap-2 rounded-xl border-2 p-3 text-left font-bold", type === k ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white")}
          >
            <Icon className="h-5 w-5 text-brand-600" /> {label}
          </button>
        ))}
      </div>

      {type === "one-time" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-bold">1. Pick a date <span className="font-normal text-slate-400">(dates with approved tutor availability only)</span></p>
            <Calendar
              selected={date ? [date] : []}
              onSelect={(d) => {
                setDate(d);
                setTime("");
              }}
              isDisabled={(d) => !calMarks(d)}
              mark={(d) => (calMarks(d) ? { text: "open", tone: "mint" } : null)}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-bold">2. Pick a time</p>
            <TimeGrid times={times} value={time} onChange={setTime} empty="Select a date to see time slots." />
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-4">
            <Field label="Preferred days">
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setDays(days.includes(i) ? days.filter((x) => x !== i) : [...days, i]);
                      setTime("");
                    }}
                    className={cn("h-10 w-12 rounded-xl border text-sm font-bold", days.includes(i) ? "border-brand-500 bg-brand-500 text-white" : "border-slate-200")}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date">
                <Input type="date" min={addDays(todayISO(), 1)} value={start} onChange={(e) => { setStart(e.target.value); setTime(""); }} />
              </Field>
              <Field label="End date">
                <Input type="date" min={start} value={end} onChange={(e) => { setEnd(e.target.value); setTime(""); }} />
              </Field>
            </div>
            <p className="text-xs text-slate-500">{dates.length ? `${dates.length} session(s) from ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}` : "Choose at least one day."}</p>
            <Calendar selected={dates} initialMonth={start} mark={(d) => (dates.includes(d) ? { text: "•", tone: "brand" } : null)} />
          </Card>
          <div>
            <p className="mb-2 text-sm font-bold">Pick a time <span className="font-normal text-slate-400">(tutors with full coverage shown)</span></p>
            <TimeGrid times={times} value={time} onChange={setTime} recurring empty="Select days and a date range." />
          </div>
        </div>
      )}

      {time && dates.length > 0 && (
        <Card>
          <h3 className="font-extrabold">Availability check</h3>
          {noTutors ? (
            <div className="mt-2 space-y-3">
              <Alert kind="warn">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                No compatible tutors are available for that schedule. Choose one of these alternatives:
              </Alert>
              <div className="flex flex-wrap gap-2">
                {alts.length === 0 && <span className="text-sm text-slate-400">No alternatives in the next 30 days.</span>}
                {alts.map((a) => (
                  <button
                    key={a.date + a.time}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold hover:border-brand-400 hover:bg-brand-50"
                    onClick={() => {
                      setType("one-time");
                      setDate(a.date);
                      setTime(a.time);
                    }}
                  >
                    {fmtDate(a.date)} · {fmtTime(a.time)}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-2 space-y-3">
              <Alert kind="success">
                {matches.length} compatible tutor(s) found. {topFull ? "At least one can cover every session." : "No single tutor covers every date — the admin may arrange reassignment."}
              </Alert>
              <p className="text-xs text-slate-500">Only admin-approved availability counts; pending requests and approved leaves are excluded. Slots are held temporarily once you submit, then the admin reviews and confirms the tutor.</p>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm">
                <span>
                  {dates.length} session(s) × {peso(rate)} = <b>{peso(rate * dates.length)}</b>
                </span>
                <Button onClick={submit}>Submit booking request</Button>
              </div>
              {err && <Alert kind="error">{err}</Alert>}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function TimeGrid({ times, value, onChange, recurring, empty }: { times: { time: string; full: number; any: number }[]; value: string; onChange: (t: string) => void; recurring?: boolean; empty: string }) {
  if (!times.length) return <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">{empty}</div>;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {times.map((t) => {
        const disabled = t.any === 0;
        return (
          <button
            key={t.time}
            disabled={disabled}
            onClick={() => onChange(t.time)}
            className={cn(
              "rounded-xl border p-2 text-sm font-bold transition",
              value === t.time ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white",
              disabled ? "cursor-not-allowed text-slate-300 line-through" : "hover:border-brand-400",
            )}
          >
            {fmtTime(t.time)}
            <div className={cn("text-[10px] font-semibold", value === t.time ? "text-white/80" : "text-slate-400")}>
              {disabled ? "unavailable" : recurring ? `${t.full} full · ${t.any} partial` : `${t.any} tutor(s)`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
