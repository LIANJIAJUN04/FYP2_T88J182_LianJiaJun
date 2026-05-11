"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Mail, Lock, Eye, EyeOff, AlertCircle, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { setToken, getToken } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (getToken()) router.replace("/dashboard");
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) throw authErr;
      if (data.session?.access_token) {
        setToken(data.session.access_token);
        router.replace("/dashboard");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: "#060d1a" }}
    >
      {/* Ambient glows */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center top, #0ea5e912 0%, transparent 65%)" }}
      />
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[400px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at bottom right, #06b6d408 0%, transparent 60%)" }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#0ea5e9 1px, transparent 1px), linear-gradient(90deg, #0ea5e9 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative w-full max-w-md mx-4"
        style={{
          background: "linear-gradient(145deg, rgba(12,21,36,0.95), rgba(15,30,56,0.95))",
          border: "1px solid #1e3a5f",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(14,165,233,0.08)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4"
          style={{ background: "linear-gradient(90deg, transparent, #0ea5e960, transparent)" }}
        />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, #0ea5e9, #06b6d4)",
                boxShadow: "0 8px 32px rgba(14,165,233,0.35)",
              }}
            >
              <Activity className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight" style={{ color: "#f0f6ff" }}>
              Medi<span style={{ color: "#0ea5e9" }}>Sync</span>
            </h1>
            <div
              className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: "#0ea5e912", border: "1px solid #0ea5e930", color: "#38bdf8" }}
            >
              <Shield className="w-3 h-3" />
              Admin Portal
            </div>
          </div>

          <p className="text-center text-sm mb-8" style={{ color: "#475569" }}>
            Sign in with your administrator credentials to access the monitoring dashboard.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748b" }}>
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "#334155" }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hospital.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#0a1628",
                    border: "1px solid #1e3a5f",
                    color: "#f0f6ff",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#0ea5e9")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#64748b" }}>
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "#334155" }}
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#0a1628",
                    border: "1px solid #1e3a5f",
                    color: "#f0f6ff",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#0ea5e9")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#475569" }}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
                style={{ background: "#3f00001a", border: "1px solid #dc262633", color: "#f87171" }}
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: loading ? 1 : 1.01 }}
              whileTap={{ scale: loading ? 1 : 0.99 }}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all"
              style={{
                background: loading
                  ? "#1e3a5f"
                  : "linear-gradient(135deg, #0ea5e9, #06b6d4)",
                color: loading ? "#64748b" : "#fff",
                boxShadow: loading ? "none" : "0 4px 24px rgba(14,165,233,0.35)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-t-transparent rounded-full inline-block"
                    style={{ borderColor: "#475569", borderTopColor: "transparent" }}
                  />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </motion.button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "#334155" }}>
            Secured by Supabase Auth · MediSync v1.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
