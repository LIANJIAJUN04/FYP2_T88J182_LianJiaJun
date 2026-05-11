"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, ChevronRight, Users, Filter } from "lucide-react";
import { AlertBadge } from "@/components/AlertBadge/AlertBadge";
import type { PatientTableProps } from "./PatientTable.types";

const WARDS = ["All Wards", "A", "B", "C", "D", "ICU", "ER"];

export function PatientTable({ patients, loading }: PatientTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [filterWard, setFilterWard] = useState("All Wards");

  const filtered = useMemo(() => {
    return patients.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.ic_number.toLowerCase().includes(q) ||
        p.ward.toLowerCase().includes(q) ||
        p.assigned_doctor.toLowerCase().includes(q);

      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" && p.isActive) ||
        (filterStatus === "inactive" && !p.isActive);

      const matchWard =
        filterWard === "All Wards" || p.ward.startsWith(filterWard);

      return matchSearch && matchStatus && matchWard;
    });
  }, [patients, search, filterStatus, filterWard]);

  const selectStyle = {
    background: "#0a1628",
    border: "1px solid #1e3a5f",
    color: "#94a3b8",
    borderRadius: "10px",
    padding: "6px 10px",
    fontSize: "12px",
    outline: "none",
    cursor: "pointer",
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "linear-gradient(145deg, #0c1524, #0f1e38)", border: "1.5px solid #1e3a5f" }}
    >
      {/* Table header + controls */}
      <div className="p-5 flex flex-col gap-4" style={{ borderBottom: "1px solid #1e3a5f" }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" style={{ color: "#60a5fa" }} />
            <h3 className="text-sm font-semibold" style={{ color: "#94a3b8" }}>Patients</h3>
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: "#0ea5e918", color: "#38bdf8" }}
            >
              {filtered.length} shown
            </span>
          </div>
          <Filter className="w-4 h-4" style={{ color: "#334155" }} />
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: "#334155" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, IC, ward, doctor…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs outline-none transition-all"
              style={{ background: "#0a1628", border: "1px solid #1e3a5f", color: "#f0f6ff" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#0ea5e9")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#1e3a5f")}
            />
          </div>

          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "inactive")}
            style={selectStyle}
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Ward filter */}
          <select
            value={filterWard}
            onChange={(e) => setFilterWard(e.target.value)}
            style={selectStyle}
          >
            {WARDS.map((w) => (
              <option key={w} value={w}>{w}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: "1px solid #1e3a5f" }}>
              {["Name", "IC Number", "Ward", "Age", "Doctor", "Status", "Alerts", ""].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-semibold uppercase tracking-wider"
                  style={{ color: "#334155" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #0f1e38" }}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="skeleton h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : filtered.length === 0
              ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center" style={{ color: "#334155" }}>
                    No patients match your filters.
                  </td>
                </tr>
              )
              : filtered.map((patient, idx) => (
                  <motion.tr
                    key={patient.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.03, duration: 0.3 }}
                    className="transition-colors"
                    style={{ borderBottom: "1px solid #0f1e38" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "#0f1e3840")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td className="px-5 py-4">
                      <div>
                        <p className="font-semibold" style={{ color: "#f0f6ff" }}>{patient.name}</p>
                        <p style={{ color: "#475569" }}>{patient.gender}, {patient.age} yrs</p>
                      </div>
                    </td>
                    <td className="px-5 py-4" style={{ color: "#64748b", fontFamily: "monospace" }}>
                      {patient.ic_number}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className="px-2 py-0.5 rounded-lg font-semibold"
                        style={{ background: "#0ea5e918", color: "#38bdf8" }}
                      >
                        {patient.ward}
                      </span>
                    </td>
                    <td className="px-5 py-4" style={{ color: "#64748b" }}>{patient.age}</td>
                    <td className="px-5 py-4" style={{ color: "#94a3b8" }}>{patient.assigned_doctor}</td>
                    <td className="px-5 py-4">
                      <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                        style={
                          patient.isActive
                            ? { background: "#22c55e18", color: "#4ade80", border: "1px solid #22c55e30" }
                            : { background: "#1e3a5f30", color: "#475569", border: "1px solid #1e3a5f" }
                        }
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${patient.isActive ? "blink-dot" : ""}`}
                          style={{ background: patient.isActive ? "#22c55e" : "#334155" }}
                        />
                        {patient.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <AlertBadge count={patient.alertCount} hasUnresolved={patient.unresolvedAlerts > 0} />
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => router.push(`/patient/${patient.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: "#0ea5e912",
                          border: "1px solid #0ea5e930",
                          color: "#38bdf8",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#0ea5e922";
                          e.currentTarget.style.borderColor = "#0ea5e960";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#0ea5e912";
                          e.currentTarget.style.borderColor = "#0ea5e930";
                        }}
                      >
                        View
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
