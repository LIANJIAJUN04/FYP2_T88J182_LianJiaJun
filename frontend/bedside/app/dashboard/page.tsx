"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, LogOut, Wifi, WifiOff, Droplets, HeartPulse, Thermometer } from "lucide-react";
import { StatusCard } from "@/components/StatusCard/StatusCard";
import { GaugeCard } from "@/components/GaugeCard/GaugeCard";
import { LiveChart } from "@/components/LiveChart/LiveChart";
import { useSSEStream } from "@/components/StatusCard/StatusCard.hooks";
import { getActivePatient, sessionLogout } from "@/lib/api";

interface Patient {
  patient_id: string;
  name: string;
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const { latest, status, readings } = useSSEStream();

  useEffect(() => {
    getActivePatient().then((p) => {
      if (!p?.patient_id) router.replace("/");
      else setPatient(p);
    });
  }, [router]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await sessionLogout();
    router.replace("/");
  };

  if (!patient) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#060d1a" }}>
        <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.5, repeat: Infinity }}>
          <Activity className="w-8 h-8" style={{ color: "#0ea5e9" }} />
        </motion.div>
      </div>
    );
  }

  const isConnected = status !== "connecting";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#060d1a" }}>
      {/* Ambient */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, #0ea5e910 0%, transparent 70%)" }}
      />

      {/* Navbar */}
      <motion.header
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between px-6 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid #0f1e38" }}
      >
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
        </div>

        <div className="flex items-center gap-4">
          {/* Connection indicator */}
          <div className="flex items-center gap-1.5 text-xs" style={{ color: isConnected ? "#22c55e" : "#64748b" }}>
            {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isConnected ? "Live" : "Connecting…"}</span>
          </div>

          {/* Patient info */}
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold" style={{ color: "#f0f6ff" }}>{patient.name}</p>
            <p className="text-xs" style={{ color: "#475569" }}>Active session</p>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "#1a0a0a", border: "1px solid #3f1515", color: "#f87171", cursor: loggingOut ? "not-allowed" : "pointer" }}
          >
            <LogOut className="w-3 h-3" />
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </motion.header>

      {/* Main content */}
      <main className="flex-1 p-4 sm:p-6 max-w-5xl w-full mx-auto space-y-5">
        {/* Patient name banner */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h2 className="text-lg font-bold" style={{ color: "#94a3b8" }}>
            Monitoring: <span style={{ color: "#f0f6ff" }}>{patient.name}</span>
          </h2>
          {latest && (
            <p className="text-xs mt-0.5" style={{ color: "#334155" }}>
              Last reading: {formatTime(latest.ts)}
            </p>
          )}
        </motion.div>

        {/* Status Card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <StatusCard
            status={status}
            lastUpdate={latest ? formatTime(latest.ts) : undefined}
          />
        </motion.div>

        {/* Gauge Cards */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="grid grid-cols-3 gap-4"
        >
          <GaugeCard
            metric="spo2"
            value={latest?.spo2 ?? null}
            unit="%"
            label="SpO₂"
            min={80}
            max={100}
            normalRange={[95, 100]}
            warningRange={[90, 94]}
            icon={<Droplets className="w-4 h-4" />}
          />
          <GaugeCard
            metric="bpm"
            value={latest?.bpm ?? null}
            unit="bpm"
            label="Heart Rate"
            min={20}
            max={160}
            normalRange={[60, 100]}
            warningRange={[40, 130]}
            icon={<HeartPulse className="w-4 h-4" />}
          />
          <GaugeCard
            metric="temperature"
            value={latest?.temperature ?? null}
            unit="°C"
            label="Temperature"
            min={34}
            max={41}
            normalRange={[36.1, 37.2]}
            warningRange={[35, 38]}
            icon={<Thermometer className="w-4 h-4" />}
          />
        </motion.div>

        {/* Live Chart */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <LiveChart readings={readings} />
        </motion.div>
      </main>
    </div>
  );
}
