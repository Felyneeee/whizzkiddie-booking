"use client";

import { useState } from "react";
import { Calendar } from "@/components/Calendar";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { onApprovedLeave } from "@/lib/logic";
import { useStore } from "@/lib/store";

export default function TutorCalendar() {
  const s = useStore();
  const id = s.me!.id;
  const [sel, setSel] = useState(todayISO());
  const mine = s.db.sessions.filter((x) => x.tutorId === id && x.status !== "cancelled");
  const day = mine.filter((x) => x.date === sel).sort((a, b) => a.time.localeCompare(b.time));
  const nm = (tid: string) => s.db.tutees.find((x) => x.userId === tid)?.fullName || "Student";
  const subj = (bid: string) => s.db.bookings.find((b) => b.id === bid)?.subject;
  const cohorts = s.db.cohorts.filter((c) => c.tutorId === id);

  return (
    <>
      <PageHeader title="My calendar" subtitle="Confirmed tutorial schedules. Red = approved leave." />
      <div className="grid gap-4 md:grid-cols-2">
        <Calendar
          selected={[sel]}
          onSelect={setSel}
          isDisabled={() => false}
          mark={(d) => {
            const n = mine.filter((x) => x.date === d).length;
            if (onApprovedLeave(s.db, id, d)) return { text: "leave", tone: "coral" };
            return n ? { text: `${n} sess.`, tone: "brand" } : null;
          }}
        />
        <div className="space-y-3">
          <h2 className="font-extrabold">{fmtDate(sel)}</h2>
          {day.length === 0 && <Empty>No sessions.</Empty>}
          {day.map((x) => (
            <Card key={x.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div className="font-bold">{fmtTime(x.time)} · {nm(x.tuteeId)}</div>
                <Badge status={x.status} />
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                {subj(x.bookingId)} <Badge status={x.modality} /> {x.roomId && s.db.rooms.find((r) => r.id === x.roomId)?.name}
              </div>
            </Card>
          ))}
          {cohorts.length > 0 && (
            <Card className="!p-4 text-sm">
              <div className="font-extrabold">Playgroup classes</div>
              {cohorts.map((c) => (
                <div key={c.id} className="text-slate-500">
                  {c.label} · {fmtTime(c.time)} · {c.enrolled.length}/{c.capacity} enrolled
                </div>
              ))}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
