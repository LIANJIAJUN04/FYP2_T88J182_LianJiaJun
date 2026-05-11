import type { Patient, Session, Alert } from "@/lib/api";

export interface PatientRow extends Patient {
  isActive: boolean;
  alertCount: number;
  unresolvedAlerts: number;
}

export interface PatientTableProps {
  patients: PatientRow[];
  loading: boolean;
}
