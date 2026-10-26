// Relational-style schema. Each interface maps 1:1 to a table (Supabase/Prisma-ready).

export type Role = "admin" | "tutor" | "tutee";
export type Modality = "online" | "face-to-face";
export type Program = "reading" | "academic" | "playgroup";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export type TutorStatus =
  | "pending_review" // new applicant submitted
  | "interview" // interview scheduled
  | "pending_verification" // existing tutor submitted
  | "active"
  | "rejected";

export interface User {
  id: string;
  role: Role;
  email: string;
  username: string;
  password: string; // mock only – hash server-side in production
  createdAt: string;
}

export interface TuteeProfile {
  userId: string;
  fullName: string;
  age: number | null;
  birthday: string; // YYYY-MM-DD
  gradeLevel: string;
  contact: string;
  guardianName: string;
  complete: boolean;
  lastGreetingYear?: number;
}

export interface TutorProfile {
  userId: string;
  applicantType: "new" | "existing";
  status: TutorStatus;
  fullName: string;
  photo: string; // data URL or ""
  age: number | null;
  contact: string;
  resumeName: string;
  resumeData: string;
  bio: string;
  subjects: string[]; // e.g. "Math", "Reading"
  gradeBands: string[]; // "Preschool" | "Elementary" | "Junior High" | "Senior High"
  hourlyRate: number; // payroll rate per hour
  fixedSalary: number; // optional monthly fixed salary
  interviewAt?: string;
  interviewNotes?: string;
  rejectionReason?: string;
  birthday?: string;
  lastGreetingYear?: number;
}

export interface Availability {
  id: string;
  batchId: string;
  tutorId: string;
  date: string; // YYYY-MM-DD
  slots: string[]; // hour starts "09:00"
  modalities: Modality[];
  status: ApprovalStatus;
  submittedAt: string;
  note?: string;
}

export interface Leave {
  id: string;
  tutorId: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: ApprovalStatus;
  submittedAt: string;
  affectedSessionIds?: string[];
}

export type BookingStatus =
  | "awaiting_admin" // slots temporarily reserved, recommendations generated
  | "confirmed"
  | "rejected"
  | "terminated"
  | "completed";

export interface Booking {
  id: string;
  tuteeId: string;
  program: Program;
  subject: string;
  gradeLevel: string;
  modality: Modality;
  learningNeeds: string;
  bookingType: "one-time" | "recurring";
  dates: string[];
  time: string; // "15:00"
  recurrence?: { days: number[]; start: string; end: string };
  ratePerHour: number;
  totalFee: number;
  status: BookingStatus;
  tutorId?: string;
  recommendations: string[]; // tutor userIds ranked
  createdAt: string;
  terminatedAt?: string;
  terminationReason?: string;
  cohortId?: string; // playgroup
  assessmentId?: string;
}

export interface Session {
  id: string;
  bookingId: string;
  tutorId: string;
  tuteeId: string;
  date: string;
  time: string;
  modality: Modality;
  roomId?: string;
  status: "scheduled" | "completed" | "cancelled" | "needs_reassignment";
  attended?: boolean;
  rating?: number;
  feedback?: string;
}

export interface Assessment {
  id: string;
  tuteeId: string;
  modality: Modality;
  date: string;
  time: string;
  status: "booked" | "completed" | "cancelled";
  results?: string;
  learningNeeds?: string;
  readingLevel?: string;
  roomId?: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
}

export interface PlaygroupCohort {
  id: string;
  label: string;
  startDate: string;
  weekdays: number[]; // 0-6
  time: string;
  capacity: number;
  enrolled: string[]; // tutee ids
  tutorId?: string;
  roomId?: string;
  sessionsCount: number;
}

export interface Message {
  id: string;
  threadId: string; // the non-admin user's id
  fromId: string;
  text: string;
  at: string;
  auto?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  text: string;
  at: string;
  read: boolean;
  channels: ("web" | "email" | "sms")[];
}

export interface Purchase {
  id: string;
  tuteeId: string;
  items: { sku: string; name: string; qty: number; price: number }[];
  total: number;
  status: "pending" | "paid" | "released";
  at: string;
}

export interface Material {
  id: string;
  title: string;
  program: Program | "all";
  fileName: string;
  mime: string;
  size: number;
  data: string; // data URL (mock storage)
  note: string;
  uploadedAt: string;
  allowTutors: boolean;
  allowTutees: boolean;
  allowedUserIds: string[]; // empty = all within allowed roles
  revoked: boolean;
}

export interface MaterialAccessLog {
  id: string;
  materialId: string;
  userId: string;
  at: string;
}

export interface Activity {
  id: string;
  userId: string;
  kind: "rating" | "match" | "upload" | "termination" | "booking" | "other";
  text: string;
  at: string;
}

export interface PayrollRecord {
  id: string;
  tutorId: string;
  period: string; // YYYY-MM
  hours: number;
  hourlyRate: number;
  fixedSalary: number;
  amount: number;
  paid: boolean;
  paidAt?: string;
}

export interface DB {
  users: User[];
  tutees: TuteeProfile[];
  tutors: TutorProfile[];
  availability: Availability[];
  leaves: Leave[];
  bookings: Booking[];
  sessions: Session[];
  assessments: Assessment[];
  rooms: Room[];
  cohorts: PlaygroupCohort[];
  messages: Message[];
  notifications: Notification[];
  purchases: Purchase[];
  materials: Material[];
  materialLogs: MaterialAccessLog[];
  activities: Activity[];
  payroll: PayrollRecord[];
  hirings: { id: string; title: string; desc: string; open: boolean }[];
}
