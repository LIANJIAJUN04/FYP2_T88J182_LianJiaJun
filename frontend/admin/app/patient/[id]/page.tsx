"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity, ArrowLeft, Droplets, HeartPulse, Thermometer,
  Wifi, WifiOff, Clock, AlertTriangle, LogOut,
} from "lucide-react";
import { getSupabase } from "@/lib/supabase";
import { getToken, clearToken } from "@/lib/auth";
import { fetchPatient, fetchSessions, fetchAlerts, fetchHistory } from "@/lib/api";
import { StatusCard } from "@/components/StatusCard/StatusCard";
import { GaugeCard } from "@/components/GaugeCard/GaugeCard";
import { LiveChart } from "@/components/LiveChart/LiveChart";
import { HistoryChart } from "@/components/HistoryChart/HistoryChart";
import { AISummaryPanel } from "@/components/AISummaryPanel/AISummaryPanel";
import { useCloudSSEStream } from "@/components/StatusCard/StatusCard.hooks";
import type { Patient, Session, Alert, Reading } from "@/lib/api";

function formatDt(ts: string) {
  return new Date(ts).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PatientDetailPage() {
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const [patient, setPatient] = useState<Patient | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [alertLog, setAlertLog] = useState<Alert[]>([]);
  const [history, setHistory] = useState<Reading[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [histFrom, setHistFrom] = useState(todayStr());
  const [histTo, setHistTo] = useState(todayStr());
  const [pageLoading, setPageLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const { latest, status, readings } = useCloudSSEStream(patientId);
  const isConnected = status !== "connecting";

  const loadPage = useCallback(async () => {
    const token = getToken();
    if (!token) { router.replace("/"); return; }

    try {
      const [pat, sess, alrts] = await Promise.all([
        fetchPatient(patientId, token),
        fetchSessions(patientId, token),
        fetchAlerts(token),
      ]);
      setPatient(pat);
      setSessions(sess);
      setAlertLog(alrts.filter((a) => a.patient_id === patientId));
    } catch {
      router.replace("/dashboard");
    } finally {
      setPageLoading(false);
    }
  }, [patientId, router]);

  const loadHistory = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setHistoryLoading(true);
    try {
      const data = await fetchHistory(patientId, token, histFrom, histTo);
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [patientId, histFrom, histTo]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await getSupabase().auth.signOut();
    clearToken();
    router.replace("/");
  };

  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#131315" }}>
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <Activity className="w-8 h-8" style={{ color: "#4cd7f6" }} />
        </motion.div>
      </div>
    );
  }

  const token = getToken() ?? "";
  const activeSession = sessions.find((s) => !s.ended_at);
  const unresolvedCount = alertLog.filter((a) => !a.resolved_at).length;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#131315" }}>
      {/* Ambient */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center top, rgba(76,215,246,0.04) 0%, transparent 65%)" }}
      />

      {/* Navbar */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="sticky top-0 z-50 flex items-center justify-between px-6 py-4"
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(19,19,21,0.9)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 4px 24px rgba(76,215,246,0.06)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4cd7f6, #03b5d3)" }}
          >
            <Activity className="w-4 h-4 text-white" />
          </div>
          <span
            className="font-black text-base"
            style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}
          >
            Medi<span style={{ color: "#4cd7f6" }}>Sync</span>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs" style={{ color: isConnected ? "#22c55e" : "#909097" }}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? "Live" : "Connecting…"}</span>
          </div>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: "rgba(255,180,171,0.05)",
              border: "1px solid rgba(147,0,10,0.3)",
              color: "#ffb4ab",
              cursor: loggingOut ? "not-allowed" : "pointer",
            }}
          >
            <LogOut className="w-3 h-3" />
            {loggingOut ? "…" : "Logout"}
          </button>
        </div>
      </motion.header>

      <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
        {/* Breadcrumb + back */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="flex items-center gap-2 text-xs"
          style={{ color: "#909097" }}
        >
          <button
            onClick={() => router.push("/dashboard")}
            className="flex items-center gap-1.5 hover:text-sky-400 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </button>
          <span>/</span>
          <span style={{ color: "#c6c6cd" }}>{patient?.name ?? patientId}</span>
        </motion.div>

        {/* Patient info card */}
        {patient && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="rounded-2xl p-5 sm:p-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Avatar */}
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 text-xl font-black"
                  style={{
                    background: "rgba(76,215,246,0.07)",
                    border: "1px solid rgba(76,215,246,0.2)",
                    color: "#4cd7f6",
                  }}
                >
                  {patient.name.charAt(0)}
                </div>
                <div>
                  <h1
                    className="text-xl font-black"
                    style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}
                  >
                    {patient.name}
                  </h1>
                  <p
                    className="text-xs mt-0.5"
                    style={{ color: "#909097", fontFamily: "'Space Grotesk', monospace" }}
                  >
                    IC: {patient.ic_number}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }}
                    >
                      Ward {patient.ward}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold capitalize"
                      style={{ background: "rgba(255,255,255,0.04)", color: "#909097" }}
                    >
                      {patient.gender}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(255,255,255,0.04)", color: "#909097" }}
                    >
                      Age {patient.age}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: "rgba(255,255,255,0.04)", color: "#909097" }}
                    >
                      {patient.assigned_doctor}
                    </span>
                  </div>
                </div>
              </div>

              {/* Session + alert badges */}
              <div className="flex flex-wrap gap-2 items-center">
                <span
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold"
                  style={
                    activeSession
                      ? { background: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                      : { background: "rgba(255,255,255,0.04)", color: "#909097", border: "1px solid rgba(255,255,255,0.08)" }
                  }
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${activeSession ? "blink-dot" : ""}`}
                    style={{ background: activeSession ? "#22c55e" : "#45464d" }}
                  />
                  {activeSession ? "Session Active" : "No Active Session"}
                </span>

                {unresolvedCount > 0 && (
                  <span
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold"
                    style={{ background: "rgba(255,180,171,0.08)", color: "#ffb4ab", border: "1px solid rgba(255,180,171,0.2)" }}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    {unresolvedCount} unresolved
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Status + gauges row */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4"
        >
          {/* Status card (spans 1 column wide, full height) */}
          <div className="lg:col-span-1 flex flex-col">
            <StatusCard
              status={status}
              lastUpdate={latest ? formatTime(latest.ts) : undefined}
            />
          </div>

          {/* Gauge cards */}
          <div className="lg:col-span-3 grid grid-cols-3 gap-4">
            <GaugeCard
              metric="spo2"
              value={latest?.spo2 ?? null}
              unit="%"
              label="SpO₂"
              min={80} max={100}
              normalRange={[95, 100]}
              warningRange={[90, 94]}
              icon={<Droplets className="w-4 h-4" />}
            />
            <GaugeCard
              metric="bpm"
              value={latest?.bpm ?? null}
              unit="bpm"
              label="Heart Rate"
              min={20} max={160}
              normalRange={[60, 100]}
              warningRange={[40, 130]}
              icon={<HeartPulse className="w-4 h-4" />}
            />
            <GaugeCard
              metric="temperature"
              value={latest?.temperature ?? null}
              unit="°C"
              label="Temperature"
              min={34} max={41}
              normalRange={[36.1, 37.2]}
              warningRange={[35, 38]}
              icon={<Thermometer className="w-4 h-4" />}
            />
          </div>
        </motion.div>

        {/* Live chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <LiveChart readings={readings} />
        </motion.div>

        {/* History chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <HistoryChart
            readings={history}
            loading={historyLoading}
            from={histFrom}
            to={histTo}
            onFromChange={setHistFrom}
            onToChange={setHistTo}
            onFetch={loadHistory}
          />
        </motion.div>

        {/* AI Summary panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.28 }}
        >
          <AISummaryPanel patientId={patientId} token={token} />
        </motion.div>

        {/* Bottom two logs */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4"
        >
          {/* Session log */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <Clock className="w-4 h-4" style={{ color: "#bec6e0" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>Session History</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full ml-auto"
                style={{ background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }}
              >
                {sessions.length}
              </span>
            </div>
            <div className="overflow-y-auto max-h-72">
              {sessions.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs" style={{ color: "#45464d" }}>
                  No sessions recorded.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {["Started", "Ended", "Duration"].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2 text-left font-semibold uppercase tracking-wider"
                          style={{ color: "#45464d" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => {
                      const duration = s.ended_at
                        ? (() => {
                            const ms = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
                            const mins = Math.floor(ms / 60000);
                            const hrs = Math.floor(mins / 60);
                            return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
                          })()
                        : null;

                      return (
                        <tr
                          key={s.id}
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        >
                          <td className="px-5 py-3" style={{ color: "#c6c6cd" }}>
                            {formatDt(s.started_at)}
                          </td>
                          <td className="px-5 py-3">
                            {s.ended_at ? (
                              <span style={{ color: "#909097" }}>{formatDt(s.ended_at)}</span>
                            ) : (
                              <span
                                className="flex items-center gap-1.5 text-xs font-semibold"
                                style={{ color: "#4ade80" }}
                              >
                                <span className="w-1.5 h-1.5 rounded-full blink-dot" style={{ background: "#22c55e" }} />
                                Active
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3" style={{ color: "#909097" }}>
                            {duration ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Alert log */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(20px)" }}
          >
            <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <AlertTriangle className="w-4 h-4" style={{ color: "#f59e0b" }} />
              <h3 className="text-sm font-semibold" style={{ color: "#c6c6cd" }}>Alert Log</h3>
              <span
                className="text-xs px-2 py-0.5 rounded-full ml-auto"
                style={
                  unresolvedCount > 0
                    ? { background: "rgba(255,180,171,0.08)", color: "#ffb4ab" }
                    : { background: "rgba(76,215,246,0.08)", color: "#4cd7f6" }
                }
              >
                {unresolvedCount > 0 ? `${unresolvedCount} unresolved` : "All clear"}
              </span>
            </div>
            <div className="overflow-y-auto max-h-72">
              {alertLog.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs" style={{ color: "#45464d" }}>
                  No alerts recorded.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      {["Metric", "Value", "Started", "Ended", "Status"].map((h) => (
                        <th
                          key={h}
                          className="px-5 py-2 text-left font-semibold uppercase tracking-wider"
                          style={{ color: "#45464d" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {alertLog.map((a) => (
                      <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-5 py-3">
                          <span
                            className="px-2 py-0.5 rounded-lg font-semibold uppercase"
                            style={{ background: "#f59e0b18", color: "#fbbf24" }}
                          >
                            {a.metric}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-bold tabular-nums" style={{ color: "#ffb4ab" }}>
                          {typeof a.value === "number" ? a.value.toFixed(1) : a.value}
                        </td>
                        {/* Started — when the alert was first triggered */}
                        <td className="px-5 py-3" style={{ color: "#909097" }}>
                          {formatDt(a.triggered_at)}
                        </td>
                        {/* Ended — resolved_at timestamp, or a pulsing dot if still active */}
                        <td className="px-5 py-3">
                          {a.resolved_at ? (
                            <span style={{ color: "#4ade80" }}>{formatDt(a.resolved_at)}</span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span
                                className="w-1.5 h-1.5 rounded-full animate-pulse"
                                style={{ background: "#ffb4ab" }}
                              />
                              <span style={{ color: "#ffb4ab" }}>Ongoing</span>
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {a.resolved_at ? (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: "#22c55e18", color: "#4ade80" }}
                            >
                              Resolved
                            </span>
                          ) : (
                            <span
                              className="px-2 py-0.5 rounded-full text-xs font-semibold"
                              style={{ background: "rgba(255,180,171,0.08)", color: "#ffb4ab" }}
                            >
                              Active
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
