"use client";

import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { useStore } from "@/lib/store";

export default function MyStudents() {
  const s = useStore();
  const id = s.me!.id;
  const today = todayISO();
  const bookings = s.db.bookings.filter((b) => b.tutorId === id && (b.status === "confirmed" || b.status === "completed"));
  const tuteeIds = Array.from(new Set(bookings.map((b) => b.tuteeId)));

  return (
    <>
      <PageHeader title="My students" subtitle="Assigned students and their learning needs." />
      {tuteeIds.length === 0 ? (
        <Empty>No students assigned yet.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tuteeIds.map((tid) => {
            const p = s.db.tutees.find((t) => t.userId === tid);
            const bs = bookings.filter((b) => b.tuteeId === tid);
            const next = s.db.sessions.filter((x) => x.tutorId === id && x.tuteeId === tid && x.status === "scheduled" && x.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
            const assess = s.db.assessments.filter((a) => a.tuteeId === tid && a.status === "completed").pop();
            return (
              <Card key={tid}>
                <div className="flex items-center justify-between">
                  <div className="text-lg font-extrabold">{p?.fullName}</div>
                  <span className="text-sm text-slate-500">{p?.gradeLevel}{p?.age !== null && p?.age !== undefined ? ` · ${p.age} y/o` : ""}</span>
                </div>
                {bs.map((b) => (
                  <div key={b.id} className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="flex items-center gap-2 font-bold">{b.subject} <Badge status={b.modality} /></div>
                    <div className="text-slate-500">Learning needs: {b.learningNeeds || "—"}</div>
                  </div>
                ))}
                {assess && (
                  <div className="mt-2 rounded-xl bg-sunny-50 p-3 text-sm">
                    <div className="font-bold">Reading assessment: {assess.readingLevel}</div>
                    <div className="text-slate-600">{assess.results}</div>
                  </div>
                )}
                <div className="mt-3 text-sm text-slate-500">
                  {next ? `Next: ${fmtDate(next.date)} · ${fmtTime(next.time)}` : "No upcoming session"} · Parent: {p?.guardianName || "—"} ({p?.contact})
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
