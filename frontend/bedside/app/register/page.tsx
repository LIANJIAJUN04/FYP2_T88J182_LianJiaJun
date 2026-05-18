"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, ArrowLeft, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { registerPatient } from "@/lib/api";

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

const WARD_OPTIONS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "ICU", "CCU", "HDU", "NICU", "PICU", "ER"];

const MY_STATE_CODES: Record<string, string> = {
  "01": "Johor",
  "02": "Kedah",
  "03": "Kelantan",
  "04": "Melaka",
  "05": "Negeri Sembilan",
  "06": "Pahang",
  "07": "Pulau Pinang",
  "08": "Perak",
  "09": "Perlis",
  "10": "Selangor",
  "11": "Terengganu",
  "12": "Sabah",
  "13": "Sarawak",
  "14": "W.P. Kuala Lumpur",
  "15": "W.P. Labuan",
  "16": "W.P. Putrajaya",
};

function formatIC(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

type ICValidation = { error: string; stateName: string; age: string };

function validateIC(ic: string): ICValidation {
  const digits = ic.replace(/-/g, "");

  // Only validate once all 12 digits are entered
  if (digits.length < 12) return { error: "", stateName: "", age: "" };

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);
  const stateCode = digits.slice(6, 8);

  // Validate month
  if (mm < 1 || mm > 12) {
    return {
      error: `Birth month "${digits.slice(2, 4)}" is invalid — must be 01 to 12. Please re-enter the IC number.`,
      stateName: "",
      age: "",
    };
  }

  // Validate day against actual days in that month
  const currentYear = new Date().getFullYear();
  const fullYear = yy <= currentYear % 100 ? 2000 + yy : 1900 + yy;
  const daysInMonth = new Date(fullYear, mm, 0).getDate();

  if (dd < 1 || dd > daysInMonth) {
    return {
      error: `Birth day "${digits.slice(4, 6)}" is invalid — ${new Date(fullYear, mm - 1).toLocaleString("en", { month: "long" })} ${fullYear} only has ${daysInMonth} days. Please re-enter the IC number.`,
      stateName: "",
      age: "",
    };
  }

  // Calculate age
  const today = new Date();
  let age = today.getFullYear() - fullYear;
  if (today.getMonth() + 1 < mm || (today.getMonth() + 1 === mm && today.getDate() < dd)) age--;

  if (age < 0 || age > 130) {
    return {
      error: `Calculated age (${age}) is out of range — check the birth year digits. Please re-enter the IC number.`,
      stateName: "",
      age: "",
    };
  }

  // Validate state / territory code
  const stateName = MY_STATE_CODES[stateCode];
  if (!stateName) {
    return {
      error: `State code "${stateCode}" is not a recognised Malaysian state or territory. Please re-enter the IC number.`,
      stateName: "",
      age: String(age),
    };
  }

  return { error: "", stateName, age: String(age) };
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "", ic_number: "", ward: "", age: "", gender: "male", assigned_doctor: "",
  });
  const [icValidation, setIcValidation] = useState<ICValidation>({ error: "", stateName: "", age: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleICChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatIC(e.target.value);
    const validation = validateIC(formatted);
    setIcValidation(validation);
    setForm((f) => ({ ...f, ic_number: formatted, age: validation.age }));
  }

  function handleICBlur() {
    if (form.ic_number && form.ic_number.replace(/-/g, "").length < 12) {
      setIcValidation({ error: "IC is incomplete — must be 12 digits in format XXXXXX-XX-XXXX.", stateName: "", age: "" });
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateIC(form.ic_number);
    if (validation.error || !validation.stateName) {
      setIcValidation(validation.error ? validation : {
        error: "Please enter a valid Malaysian IC number before submitting.",
        stateName: "",
        age: "",
      });
      return;
    }
    if (!form.ward) { setError("Please select a ward."); return; }
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

  const icComplete = form.ic_number.replace(/-/g, "").length === 12;
  const icOk = icComplete && !icValidation.error && !!icValidation.stateName;
  const icBorderColor = icComplete
    ? icOk ? "#22c55e" : "#ff6b6b"
    : "rgba(255,255,255,0.1)";

  const field = (key: keyof typeof form, label: string, type = "text", placeholder = "") => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#909097" }}>{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        required
        style={FIELD_STYLE}
        onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
      />
    </div>
  );

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
        className="w-full max-w-lg"
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
            <span className="text-sm font-semibold" style={{ color: "#909097" }}>New Patient Registration</span>
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
          <h1 className="text-2xl font-black mb-1" style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif", fontWeight: 800 }}>Register Patient</h1>
          <p className="text-sm mb-8" style={{ color: "#909097" }}>Fill in details to open a monitoring session</p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {field("name", "Full Name", "text", "Ali bin Abu")}

            {/* IC Number */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#909097" }}>IC Number</label>
              <input
                type="text"
                inputMode="numeric"
                value={form.ic_number}
                onChange={handleICChange}
                onBlur={handleICBlur}
                onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
                placeholder="990101-14-1234"
                required
                maxLength={14}
                style={{ ...FIELD_STYLE, borderColor: icBorderColor }}
              />

              <AnimatePresence mode="wait">
                {icOk ? (
                  <motion.div
                    key="ok"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-center gap-1.5 text-xs"
                    style={{ color: "#22c55e" }}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                    Valid IC — born in <strong style={{ marginLeft: 3 }}>{icValidation.stateName}</strong>
                  </motion.div>
                ) : icValidation.error ? (
                  <motion.div
                    key="err"
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="flex items-start gap-1.5 text-xs rounded-lg p-2.5"
                    style={{ background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", color: "#ff6b6b" }}
                  >
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {icValidation.error}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Ward select */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#909097" }}>Ward</label>
                <select
                  value={form.ward}
                  onChange={(e) => setForm((f) => ({ ...f, ward: e.target.value }))}
                  required
                  style={{ ...FIELD_STYLE, appearance: "none" }}
                  onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
                >
                  <option value="" disabled>Select ward</option>
                  {WARD_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>

              {/* Age — read-only, auto-calculated */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: "#909097" }}>
                  Age
                  <span style={{ color: "#4cd7f6", textTransform: "none", fontSize: "10px", letterSpacing: 0, fontWeight: 400 }}>(auto)</span>
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    value={form.age}
                    readOnly
                    placeholder={icValidation.error ? "Fix IC first" : "—"}
                    style={{
                      ...FIELD_STYLE,
                      color: form.age ? "#e4e2e4" : icValidation.error ? "#ff6b6b" : "#909097",
                      cursor: "default",
                      borderColor: form.age ? "rgba(34,197,94,0.3)" : icValidation.error ? "rgba(255,107,107,0.3)" : "rgba(255,255,255,0.05)",
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Gender */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#909097" }}>Gender</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                style={{ ...FIELD_STYLE, appearance: "none" }}
                onFocus={(e) => (e.target.style.borderColor = "#4cd7f6")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
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
                style={{ background: "rgba(255,180,171,0.06)", border: "1px solid rgba(255,180,171,0.2)", color: "#ffb4ab" }}
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200"
              style={{
                background: loading ? "rgba(255,255,255,0.06)" : "linear-gradient(135deg, #4cd7f6, #03b5d3)",
                color: loading ? "#45464d" : "#001f26",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                boxShadow: loading ? "none" : "0 4px 20px rgba(76,215,246,0.3)",
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
