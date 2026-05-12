"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { UserPlus, LogIn, Activity } from "lucide-react";

export default function IndexPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#131315" }}>
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(76,215,246,0.09) 0%, transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="flex flex-col items-center mb-12">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: "linear-gradient(135deg, #4cd7f6, #03b5d3)", boxShadow: "0 0 32px rgba(76,215,246,0.3)" }}
          >
            <Activity className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}>
            Medi<span style={{ color: "#4cd7f6" }}>Sync</span>
          </h1>
          <p className="text-sm mt-1" style={{ color: "#909097" }}>Bedside Monitoring Station</p>
        </div>

        <div className="space-y-4">
          <Link href="/register">
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-4 p-6 rounded-2xl cursor-pointer group"
              style={{
                background: "rgba(76,215,246,0.04)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1.5px solid rgba(76,215,246,0.18)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg, #4cd7f6, #03b5d3)", boxShadow: "0 4px 20px rgba(76,215,246,0.3)" }}
              >
                <UserPlus className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>New Patient</h2>
                <p className="text-xs mt-0.5" style={{ color: "#909097" }}>Register and start monitoring</p>
              </div>
              <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-lg" style={{ color: "#4cd7f6" }}>→</span>
            </motion.div>
          </Link>

          <Link href="/login">
            <motion.div
              whileHover={{ scale: 1.02, y: -2 }}
              whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-4 p-6 rounded-2xl cursor-pointer group"
              style={{
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1.5px solid rgba(255,255,255,0.08)",
                boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <LogIn className="w-6 h-6" style={{ color: "#c6c6cd" }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}>Existing Patient</h2>
                <p className="text-xs mt-0.5" style={{ color: "#909097" }}>Login with IC number</p>
              </div>
              <span className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-lg" style={{ color: "#909097" }}>→</span>
            </motion.div>
          </Link>
        </div>

        <p className="text-center text-xs mt-10" style={{ color: "#45464d" }}>
          MediSync v1.0 — Bedside Station
        </p>
      </motion.div>
    </div>
  );
}
