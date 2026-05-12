"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, Mail, Lock, Eye, EyeOff, AlertCircle, Shield } from "lucide-react";
import { getSupabase } from "@/lib/supabase";
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
      const { data, error: authErr } = await getSupabase().auth.signInWithPassword({ email, password });
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
      style={{ background: "#131315" }}
    >
      {/* Ambient glows */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center top, rgba(76,215,246,0.07) 0%, transparent 65%)" }}
      />
      <div
        className="absolute bottom-0 right-0 w-[600px] h-[400px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at bottom right, rgba(3,181,211,0.04) 0%, transparent 60%)" }}
      />

      {/* Grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#4cd7f6 1px, transparent 1px), linear-gradient(90deg, #4cd7f6 1px, transparent 1px)`,
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
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "24px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(76,215,246,0.07)",
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-3/4"
          style={{ background: "linear-gradient(90deg, transparent, #4cd7f660, transparent)" }}
        />

        <div className="p-8 sm:p-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: "linear-gradient(135deg, #4cd7f6, #03b5d3)",
                boxShadow: "0 8px 32px rgba(76,215,246,0.3)",
              }}
            >
              <Activity className="w-7 h-7 text-white" />
            </div>
            <h1
              className="text-2xl font-black tracking-tight"
              style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}
            >
              Medi<span style={{ color: "#4cd7f6" }}>Sync</span>
            </h1>
            <div
              className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: "rgba(76,215,246,0.07)", border: "1px solid rgba(76,215,246,0.18)", color: "#4cd7f6" }}
            >
              <Shield className="w-3 h-3" />
              Admin Portal
            </div>
          </div>

          <p className="text-center text-sm mb-8" style={{ color: "#909097" }}>
            Sign in with your administrator credentials to access the monitoring dashboard.
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#909097" }}>
                Email Address
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "#45464d" }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@hospital.com"
                  required
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#0e0e10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e4e2e4",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#4cd7f6")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: "#909097" }}>
                Password
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "#45464d" }}
                />
                <input
                  type={showPass ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none transition-all"
                  style={{
                    background: "#0e0e10",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#e4e2e4",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#4cd7f6")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "#909097" }}
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
                style={{ background: "rgba(255,180,171,0.06)", border: "1px solid rgba(255,180,171,0.2)", color: "#ffb4ab" }}
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
                  ? "rgba(255,255,255,0.06)"
                  : "linear-gradient(135deg, #4cd7f6, #03b5d3)",
                color: loading ? "#45464d" : "#001f26",
                boxShadow: loading ? "none" : "0 4px 20px rgba(76,215,246,0.3)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-t-transparent rounded-full inline-block"
                    style={{ borderColor: "#45464d", borderTopColor: "transparent" }}
                  />
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </motion.button>
          </form>

          <p className="text-center text-xs mt-6" style={{ color: "#45464d" }}>
            Secured by Supabase Auth · MediSync v1.0
          </p>
        </div>
      </motion.div>
    </div>
  );
}
