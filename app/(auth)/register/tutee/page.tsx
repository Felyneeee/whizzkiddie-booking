"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Card, Field, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export default function RegisterTutee() {
  const s = useStore();
  const router = useRouter();
  const [f, setF] = useState({ email: "", username: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <Card>
      <h1 className="text-2xl font-extrabold">Parent / Tutee registration</h1>
      <p className="mb-5 text-sm text-slate-500">Create your account first — you&apos;ll set up your child&apos;s profile next.</p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (f.password.length < 6) return setErr("Password must be at least 6 characters.");
          if (f.password !== f.confirm) return setErr("Passwords do not match.");
          const r = s.registerTutee({ email: f.email, username: f.username, password: f.password });
          if (!r.ok) return setErr(r.error);
          router.replace("/tutee/profile");
        }}
      >
        <Field label="Email">
          <Input type="email" required value={f.email} onChange={set("email")} />
        </Field>
        <Field label="Username">
          <Input required value={f.username} onChange={set("username")} />
        </Field>
        <Field label="Password">
          <Input type="password" required value={f.password} onChange={set("password")} />
        </Field>
        <Field label="Confirm password">
          <Input type="password" required value={f.confirm} onChange={set("confirm")} />
        </Field>
        {err && <Alert kind="error">{err}</Alert>}
        <Button type="submit" className="w-full" disabled={!s.ready}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-slate-500">
        Already registered?{" "}
        <Link href="/login" className="font-bold text-brand-600">
          Log in
        </Link>
      </p>
    </Card>
  );
}
