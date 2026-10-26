"use client";

import { useState } from "react";
import { Calendar } from "@/components/Calendar";
import { Alert, Badge, Button, Card, Chips, Field, PageHeader, Textarea } from "@/components/ui";
import { HOURS } from "@/lib/constants";
import { fmtDate, fmtTime, todayISO } from "@/lib/dates";
import { onApprovedLeave } from "@/lib/logic";
import { useStore } from "@/lib/store";
import type { Modality } from "@/lib/types";

export default function ManageAvailability() {
  const s = useStore();
  const id = s.me!.id;
  const [dates, setDates] = useState<string[]>([]);
  const [slots, setSlots] = useState<string[]>([]);
  const [mods, setMods] = useState<Modality[]>(["online", "face-to-face"]);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "success" | "warn" | "error"; text: string } | null>(null);
  const mine = s.db.availability.filter((a) => a.tutorId === id);
  const labels = (h: string) => fmtTime(h);

  const toggle = (d: string) => {
    const next = dates.includes(d) ? dates.filter((x) => x !== d) : [...dates, d];
    setDates(next);
    if (next.length === 1) {
      // prefill from the most recent record (pending beats approved)
      const rec = mine.filter((a) => a.date === next[0] && a.status !== "rejected").sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1))[0];
      setSlots(rec ? rec.slots : []);
      if (rec) setMods(rec.modalities);
    }
  };

  const submit = () => {
    if (!dates.length) return setMsg({ kind: "error", text: "Select at least one date." });
    if (!mods.length) return setMsg({ kind: "error", text: "Select at least one modality." });
    if (!slots.length && !confirm("No time slots selected — this marks the selected dates as unavailable. Continue?")) return;
    const r = s.submitAvailability(id, dates.map((date) => ({ date, slots })), mods, note);
    if (!r.ok) return setMsg({ kind: "error", text: r.error });
    setMsg(
      r.conflicts.length
        ? { kind: "warn", text: `Submitted for approval, but these confirmed sessions conflict and will need admin reassignment: ${r.conflicts.join(", ")}` }
        : { kind: "success", text: "Submitted! Status: Pending Approval. Pending slots cannot be booked until the admin approves them." },
    );
    setDates([]);
    setSlots([]);
    setNote("");
  };

  return (
    <>
      <PageHeader title="Manage availability" subtitle="Select days and time slots, choose supported modalities, then submit for admin approval." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Calendar
            selected={dates}
            onSelect={toggle}
            isDisabled={(d) => onApprovedLeave(s.db, id, d)}
            mark={(d) => {
              if (onApprovedLeave(s.db, id, d)) return { text: "leave", tone: "coral" };
              const recs = mine.filter((a) => a.date === d);
              if (recs.some((a) => a.status === "pending")) return { text: "pending", tone: "sunny" };
              const ap = recs.find((a) => a.status === "approved");
              return ap ? { text: `${ap.slots.length}h ✓`, tone: "mint" } : null;
            }}
          />
          <p className="text-xs text-slate-500">Click multiple dates to apply the same slots. Green = approved, yellow = pending approval.</p>
        </div>
        <Card className="space-y-4">
          <Field label={`Time slots (${dates.length} date${dates.length === 1 ? "" : "s"} selected)`}>
            <Chips multi options={HOURS} value={slots} onChange={setSlots} />
            <p className="mt-1 text-xs text-slate-400">{slots.map(labels).join(", ") || "None selected"}</p>
          </Field>
          <Field label="Supported modality">
            <Chips multi options={["online", "face-to-face"] as Modality[]} value={mods} onChange={setMods} />
          </Field>
          <Field label="Note to admin (optional)">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Button onClick={submit}>Submit for approval</Button>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-extrabold">Latest submissions</h2>
      <div className="space-y-2">
        {Array.from(new Set(mine.filter((a) => a.status !== "approved").map((a) => a.batchId)))
          .slice(-5)
          .reverse()
          .map((b) => {
            const recs = mine.filter((a) => a.batchId === b);
            return (
              <Card key={b} className="flex items-center justify-between !p-3 text-sm">
                <span>
                  {recs.length} day(s): {recs.slice(0, 3).map((r) => fmtDate(r.date)).join(" · ")}
                  {recs.length > 3 && " …"}
                </span>
                <Badge status={recs[0].status} />
              </Card>
            );
          })}
      </div>
      <span className="hidden">{todayISO()}</span>
    </>
  );
}
