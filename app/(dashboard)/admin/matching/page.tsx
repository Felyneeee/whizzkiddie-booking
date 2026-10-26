"use client";

import { useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Modal, PageHeader, Textarea, peso } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/dates";
import { matchTutors } from "@/lib/logic";
import { useStore } from "@/lib/store";
import type { Booking } from "@/lib/types";

export default function Matching() {
  const s = useStore();
  const [msg, setMsg] = useState<Record<string, string>>({});
  const [rej, setRej] = useState<Booking | null>(null);
  const [reason, setReason] = useState("The requested schedule is not available.");
  const pending = s.db.bookings.filter((b) => b.status === "awaiting_admin");

  return (
    <>
      <PageHeader title="Tutor–tutee matching" subtitle="Review system recommendations and confirm assignments. Only admin-approved availability is considered." />
      {pending.length === 0 && <Empty>No booking requests waiting for review.</Empty>}
      <div className="space-y-5">
        {pending.map((b) => {
          const tutee = s.db.tutees.find((t) => t.userId === b.tuteeId);
          const assess = b.assessmentId ? s.db.assessments.find((a) => a.id === b.assessmentId) : undefined;
          const matches = matchTutors(s.db, {
            program: b.program as "reading" | "academic",
            subject: b.subject,
            gradeLevel: b.gradeLevel,
            modality: b.modality,
            dates: b.dates,
            time: b.time,
            ignoreBookingId: b.id,
          });
          return (
            <Card key={b.id} className="space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-extrabold">
                    {tutee?.fullName} <span className="text-sm font-normal text-slate-500">· {tutee?.gradeLevel}</span>
                  </div>
                  <div className="text-sm text-slate-600">
                    {b.subject} · {b.bookingType} · {b.dates.length} session(s) at {fmtTime(b.time)} · <Badge status={b.modality} /> · {peso(b.ratePerHour)}/h (total {peso(b.totalFee)})
                  </div>
                  <div className="text-xs text-slate-500">
                    {fmtDate(b.dates[0])}
                    {b.dates.length > 1 && ` → ${fmtDate(b.dates[b.dates.length - 1])}`}
                  </div>
                </div>
                <Badge status={b.status} />
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm">
                <b>Learning needs:</b> {b.learningNeeds || "—"}
                {assess && (
                  <div className="mt-1">
                    <b>Assessment:</b> {assess.readingLevel} — {assess.results}
                  </div>
                )}
              </div>
              {b.bookingType === "recurring" && <p className="text-xs text-slate-500">Recurring: prefer the same tutor for the whole period; reassign only when necessary.</p>}
              <div>
                <div className="mb-2 text-sm font-extrabold">Recommended tutors</div>
                {matches.length === 0 ? (
                  <Alert kind="warn">No compatible tutor is currently free (availability may have changed). Reject to request rescheduling.</Alert>
                ) : (
                  <div className="space-y-2">
                    {matches.slice(0, 5).map((m, i) => (
                      <div key={m.tutor.userId} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 p-3">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-sm font-extrabold text-brand-700">{i + 1}</div>
                        <div className="min-w-[160px] flex-1">
                          <div className="font-bold">{m.tutor.fullName}</div>
                          <div className="text-xs text-slate-500">
                            {m.tutor.subjects.join(", ")} · {m.rating ? `${m.rating.toFixed(1)} ★` : "no ratings yet"} · {peso(m.tutor.hourlyRate)}/h pay
                          </div>
                        </div>
                        <Badge status={m.full ? "approved" : "pending"}>{m.full ? "covers all dates" : `${m.coverage}/${m.total} dates`}</Badge>
                        <Button
                          size="sm"
                          variant={m.full ? "success" : "secondary"}
                          onClick={() => {
                            if (!m.full && !confirm(`${m.tutor.fullName} can only cover ${m.coverage} of ${m.total} dates. Confirm anyway? Uncovered dates will be removed from the booking.`)) return;
                            const r = s.confirmBooking(b.id, m.tutor.userId, !m.full);
                            setMsg({ ...msg, [b.id]: r.ok ? "" : r.error });
                          }}
                        >
                          Confirm assignment
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                {msg[b.id] && <div className="mt-2"><Alert kind="error">{msg[b.id]}</Alert></div>}
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="danger" onClick={() => setRej(b)}>
                  Reject / request rescheduling
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
      <Modal open={!!rej} onClose={() => setRej(null)} title="Request rescheduling">
        <div className="space-y-4">
          <Field label="Message to parent">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button
            variant="danger"
            onClick={() => {
              s.rejectBooking(rej!.id, reason);
              setRej(null);
            }}
          >
            Release slots & notify
          </Button>
        </div>
      </Modal>
    </>
  );
}
