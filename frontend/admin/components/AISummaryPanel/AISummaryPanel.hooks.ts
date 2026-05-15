import { useState } from "react";
import { fetchSummary } from "../../lib/api";
import type { SummaryState } from "./AISummaryPanel.types";

export function useAISummaryPanel(patientId: string, token: string) {
  const [state, setState] = useState<SummaryState>({
    range: "24h",
    summary: null,
    period: null,
    readingsCount: null,
    loading: false,
    error: null,
  });

  function setRange(range: string) {
    setState((s) => ({ ...s, range }));
  }

  async function handleGenerate() {
    setState((s) => ({ ...s, loading: true, error: null, summary: null }));
    try {
      const result = await fetchSummary(patientId, token, state.range);
      setState((s) => ({
        ...s,
        loading: false,
        summary: result.summary,
        period: result.period,
        readingsCount: result.readings_count,
      }));
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to generate summary.";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  return { state, setRange, handleGenerate };
}
