"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, Loader2 } from "lucide-react";
import { registerPatient } from "@/lib/api";

const FIELD_STYLE = {
  background: "#0a1628",
  border: "1.5px solid #1e3a5f",
  borderRadius: "10px",
  color: "#f0f6ff",
  padding: "10px 14px",
  fontSize: "14px",
  width: "100%",
  outline: "none",
  transition: "border-color 0.2s",
};

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", ic_number: "", ward: "", age: "", gender: "male", assigned_doctor: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await registerPatient({ ...form, age: Number(form.age) });
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        required
        style={FIELD_STYLE}
        onFocus={(e) => (e.target.style.borderColor = "#0ea5e9")}
        onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: "#060d1a" }}>
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at center, #0ea5e912 0%, transparent 70%)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-lg"
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: "#0c1524", border: "1px solid #1e3a5f", color: "#64748b" }}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: "#0ea5e9" }} />
            <span className="text-sm font-semibold" style={{ color: "#64748b" }}>New Patient Registration</span>
          </div>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-8"
          style={{
            background: "linear-gradient(145deg, #0c1524, #0f1e38)",
            border: "1.5px solid #1e3a5f",
            boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
          }}
        >
          <h1 className="text-2xl font-black mb-1" style={{ color: "#f0f6ff" }}>Register Patient</h1>
          <p className="text-sm mb-8" style={{ color: "#475569" }}>Fill in details to open a monitoring session</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {field("name", "Full Name", "text", "Ali bin Abu")}
            {field("ic_number", "IC Number", "text", "990101-14-1234")}

            <div className="grid grid-cols-2 gap-4">
              {field("ward", "Ward", "text", "A3")}
              {field("age", "Age", "number", "35")}
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#64748b" }}>Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                style={{ ...FIELD_STYLE, appearance: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#0ea5e9")}
                onBlur={(e) => (e.target.style.borderColor = "#1e3a5f")}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            {field("assigned_doctor", "Assigned Doctor", "text", "Dr. Lim")}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl p-3 text-sm"
                style={{ background: "#3f000022", border: "1px solid #dc2626", color: "#f87171" }}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200"
              style={{
                background: loading ? "#0c2a3d" : "linear-gradient(135deg, #0ea5e9, #0284c7)",
                color: loading ? "#64748b" : "#fff",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 0 24px rgba(14,165,233,0.35)",
              }}
            >
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Registering…</> : "Register & Start Monitoring"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
