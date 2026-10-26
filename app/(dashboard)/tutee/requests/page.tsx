"use client";

import { Badge, Button, Card, Empty, PageHeader, peso } from "@/components/ui";
import { fmtDate, fmtTime } from "@/lib/dates";
import { useStore } from "@/lib/store";

export default function TuteeRequests() {
  const s = useStore();
  const id = s.me!.id;
  const bookings = s.db.bookings.filter((b) => b.tuteeId === id && (b.status === "awaiting_admin" || b.status === "rejected")).reverse();
  const assessments = s.db.assessments.filter((a) => a.tuteeId === id && a.status === "booked");
  const orders = s.db.purchases.filter((p) => p.tuteeId === id && p.status === "pending");

  return (
    <>
      <PageHeader title="Pending requests" subtitle="Everything waiting on admin review." />
      {bookings.length + assessments.length + orders.length === 0 && <Empty>No pending requests.</Empty>}
      <div className="space-y-3">
        {assessments.map((a) => (
          <Card key={a.id} className="flex flex-wrap items-center justify-between gap-2 !p-4">
            <div>
              <div className="font-extrabold">Initial reading assessment</div>
              <div className="text-sm text-slate-500">
                {fmtDate(a.date)} · {fmtTime(a.time)} · {a.modality}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="booked">Scheduled</Badge>
              <Button size="sm" variant="secondary" onClick={() => s.cancelAssessment(a.id)}>
                Cancel
              </Button>
            </div>
          </Card>
        ))}
        {bookings.map((b) => (
          <Card key={b.id} className="!p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-extrabold">
                  {b.subject} · {b.bookingType}
                </div>
                <div className="text-sm text-slate-500">
                  {b.dates.length} session(s) · {fmtDate(b.dates[0])}
                  {b.dates.length > 1 && ` → ${fmtDate(b.dates[b.dates.length - 1])}`} · {fmtTime(b.time)} · {b.modality} · {peso(b.totalFee)}
                </div>
              </div>
              <Badge status={b.status} />
            </div>
            {b.status === "awaiting_admin" && <p className="mt-2 text-xs text-slate-500">Slots are temporarily reserved while the admin reviews tutor recommendations.</p>}
            {b.status === "rejected" && <p className="mt-2 text-xs text-coral-600">{b.terminationReason} Please book a new schedule.</p>}
          </Card>
        ))}
        {orders.map((o) => (
          <Card key={o.id} className="flex items-center justify-between !p-4">
            <div>
              <div className="font-extrabold">Purchase order</div>
              <div className="text-sm text-slate-500">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")} · {peso(o.total)}</div>
            </div>
            <Badge status="pending" />
          </Card>
        ))}
      </div>
    </>
  );
}
