import type { DB } from "./types";

export const ADMIN_ID = "u_admin";

/** Start with only the retained admin account; all application data begins empty. */
export function buildSeed(): DB {
  return {
    users: [
      {
        id: ADMIN_ID,
        role: "admin",
        email: "admin@whizzkids.ph",
        username: "admin",
        password: "admin123",
        createdAt: new Date().toISOString(),
      },
    ],
    tutees: [],
    tutors: [],
    availability: [],
    leaves: [],
    bookings: [],
    sessions: [],
    assessments: [],
    rooms: [],
    cohorts: [],
    messages: [],
    notifications: [],
    purchases: [],
    materials: [],
    materialLogs: [],
    activities: [],
    payroll: [],
    hirings: [],
  };
}
