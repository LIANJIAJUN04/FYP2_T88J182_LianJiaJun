"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, Loader2, Lock, CreditCard } from "lucide-react";
import { sessionLogin } from "@/lib/api";

const FIELD_STYLE = {
  background: "#0e0e10",
  border: "1.5px solid rgba(255,255,255,0.1)",
  borderRadius: "10px",
  color: "#e4e2e4",
  padding: "10px 14px",
  fontSize: "14px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.2s",
};

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ ic_number: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sessionLogin(form.ic_number, form.password);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#131315" }}>
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, rgba(76,215,246,0.07) 0%, transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#909097" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: "#4cd7f6" }} />
            <span className="text-sm font-semibold" style={{ color: "#909097" }}>Existing Patient Login</span>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "rgba(255,255,255,0.04)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <h1 className="text-2xl font-black mb-1" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}>Patient Login</h1>
          <p className="text-sm mb-8" style={{ color: "#909097" }}>Enter IC number and nurse password</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#909097" }}>
                <CreditCard className="w-3 h-3" /> IC Number
              </label>
              <input
                type="text"
                value={form.ic_number}
                onChange={(e) => setForm((f) => ({ ...f, ic_number: e.target.value }))}
                placeholder="990101-14-1234"
                required
                style={FIELD_STYLE}
                onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#909097" }}>
                <Lock className="w-3 h-3" /> Nurse Password
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Shared nurse password"
                required
                style={FIELD_STYLE}
                onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 text-sm"
                style={{ background: "rgba(255,180,171,0.06)", border: "1px solid rgba(255,180,171,0.2)", color: "#ffb4ab" }}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 mt-2"
              style={{
                background: loading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #4cd7f6, #03b5d3)",
                color: loading ? "#45464d" : "#001f26",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 20px rgba(76,215,246,0.3)",
              }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Logging in…</> : "Login & Start Monitoring"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
