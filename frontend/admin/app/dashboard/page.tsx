"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, Users, AlertTriangle, HeartPulse, Radio,
  LogOut, RefreshCw,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getToken, clearToken } from "@/lib/auth";
import { fetchPatients, fetchAlerts, fetchSessions } from "@/lib/api";
import { SummaryCard } from "@/components/SummaryCard/SummaryCard";
import { PatientTable } from "@/components/PatientTable/PatientTable";
import type { PatientRow } from "@/components/PatientTable/PatientTable.types";
import type { Alert } from "@/lib/api";

export default function DashboardPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [adminEmail, setAdminEmail] = useState<string>("");
  const [loggingOut, setLoggingOut] = useState(false);

  const loadData = useCallback(async (isRefresh = false) => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [rawPatients, rawAlerts] = await Promise.all([
        fetchPatients(token),
        fetchAlerts(token),
      ]);

      // Fetch sessions for all patients in parallel
      const sessionArrays = await Promise.all(
        rawPatients.map((p) => fetchSessions(p.id, token).catch(() => []))
      );

      // Group alerts by patient_id
      const alertsByPatient = rawAlerts.reduce<Record<string, Alert[]>>((acc, a) => {
        if (!acc[a.patient_id]) acc[a.patient_id] = [];
        acc[a.patient_id].push(a);
        return acc;
      }, {});

      const rows: PatientRow[] = rawPatients.map((p, i) => {
        const sessions = sessionArrays[i] ?? [];
        const isActive = sessions.some((s) => s.ended_at === null);
        const pAlerts = alertsByPatient[p.id] ?? [];
        return {
          ...p,
          isActive,
          alertCount: pAlerts.length,
          unresolvedAlerts: pAlerts.filter((a) => !a.resolved_at).length,
        };
      });

      setPatients(rows);
      setAlerts(rawAlerts);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setAdminEmail(data.user.email);
    });
    loadData();
  }, [loadData, router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    clearToken();
    router.replace("/");
  };

  // Derived summary stats
  const activeSessions = patients.filter((p) => p.isActive).length;
  const unresolvedAlerts = alerts.filter((a) => !a.resolved_at).length;
  const criticalPatients = new Set(
    alerts.filter((a) => !a.resolved_at).map((a) => a.patient_id)
  ).size;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#060d1a" }}>
      {/* Ambient */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center top, #0ea5e90a 0%, transparent 65%)" }}
      />

      {/* Navbar */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: "1px solid #0f1e38",
          background: "rgba(6,13,26,0.85)",
          backdropFilter: "blur(16px)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #0ea5e9, #06b6d4)" }}
          >
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span className="font-black text-base" style={{ color: "#f0f6ff" }}>
            Medi<span style={{ color: "#0ea5e9" }}>Sync</span>
          </span>
          <span
            className="hidden sm:inline text-xs px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "#0ea5e912", border: "1px solid #0ea5e930", color: "#38bdf8" }}
          >
            Admin
          </span>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: "#0f1e38",
              border: "1px solid #1e3a5f",
              color: "#60a5fa",
              cursor: refreshing ? "not-allowed" : "pointer",
            }}
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          {adminEmail && (
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold" style={{ color: "#94a3b8" }}>{adminEmail}</p>
              <p className="text-xs" style={{ color: "#334155" }}>Administrator</p>
            </div>
          )}

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: "#1a0a0a",
              border: "1px solid #3f1515",
              color: "#f87171",
              cursor: loggingOut ? "not-allowed" : "pointer",
            }}
          >
            <LogOut className="w-3 h-3" />
            {loggingOut ? "…" : "Logout"}
          </button>
        </div>
      </motion.header>

      {/* Main */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Page title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <h1 className="text-xl font-black" style={{ color: "#f0f6ff" }}>Patient Overview</h1>
          <p className="text-xs mt-0.5" style={{ color: "#334155" }}>
            Real-time monitoring — {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </motion.div>

        {/* Summary cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <SummaryCard
            label="Total Patients"
            value={patients.length}
            icon={<Users className="w-4 h-4" />}
            color="#0ea5e9"
            description="Registered in system"
            loading={loading}
          />
          <SummaryCard
            label="Active Sessions"
            value={activeSessions}
            icon={<Radio className="w-4 h-4" />}
            color="#22c55e"
            description="Currently monitored"
            loading={loading}
          />
          <SummaryCard
            label="Unresolved Alerts"
            value={unresolvedAlerts}
            icon={<AlertTriangle className="w-4 h-4" />}
            color="#f59e0b"
            description="Require attention"
            loading={loading}
          />
          <SummaryCard
            label="Critical Patients"
            value={criticalPatients}
            icon={<HeartPulse className="w-4 h-4" />}
            color="#ef4444"
            description="With active danger alerts"
            loading={loading}
          />
        </motion.div>

        {/* Patient table */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <PatientTable patients={patients} loading={loading} />
        </motion.div>
      </main>
    </div>
  );
}
