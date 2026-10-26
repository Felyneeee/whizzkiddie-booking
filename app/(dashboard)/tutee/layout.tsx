"use client";

import { Bell, CalendarDays, Clock, FileLock2, Home, MessageCircle, ShoppingBag, UserRound, History, Sparkles } from "lucide-react";
import { DashboardShell } from "@/components/Shell";
import { useStore } from "@/lib/store";

export default function TuteeLayout({ children }: { children: React.ReactNode }) {
  const s = useStore();
  const id = s.me?.id;
  const pending = s.db.bookings?.filter((b) => b.tuteeId === id && b.status === "awaiting_admin").length ?? 0;
  const unread = s.db.notifications?.filter((n) => n.userId === id && !n.read).length ?? 0;
  return (
    <DashboardShell
      role="tutee"
      nav={[
        { href: "/tutee", label: "Overview", icon: <Home /> },
        { href: "/tutee/profile", label: "Child Profile", icon: <UserRound /> },
        { href: "/tutee/book", label: "Book a Program", icon: <Sparkles /> },
        { href: "/tutee/schedule", label: "My Schedule", icon: <CalendarDays /> },
        { href: "/tutee/requests", label: "Pending Requests", icon: <Clock />, badge: pending },
        { href: "/tutee/materials", label: "Learning Materials", icon: <FileLock2 /> },
        { href: "/tutee/purchases", label: "Purchases", icon: <ShoppingBag /> },
        { href: "/tutee/chat", label: "Chat with Admin", icon: <MessageCircle /> },
        { href: "/tutee/history", label: "Activity History", icon: <History /> },
        { href: "/tutee/notifications", label: "Notifications", icon: <Bell />, badge: unread },
      ]}
    >
      {children}
    </DashboardShell>
  );
}
