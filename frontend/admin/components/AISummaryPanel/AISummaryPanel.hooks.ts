import { useState } from "react";
import { streamSummary } from "../../lib/api";
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
    setState((s) => ({ ...s, loading: true, error: null, summary: null, period: null, readingsCount: null }));

    try {
      for await (const event of streamSummary(patientId, token, state.range)) {
        if (event.type === "meta") {
          // Period label and reading count arrive before the first text token —
          // the UI can display the badge immediately while text streams in.
          setState((s) => ({
            ...s,
            period: event.period ?? null,
            readingsCount: event.readings_count ?? null,
          }));
        } else if (event.type === "chunk" && event.text) {
          setState((s) => ({ ...s, summary: (s.summary ?? "") + event.text! }));
        } else if (event.type === "done") {
          setState((s) => ({ ...s, loading: false }));
          return;
        } else if (event.type === "error") {
          throw new Error(event.message ?? "Summary stream error");
        }
      }
      // Stream ended without an explicit done event — treat as complete
      setState((s) => ({ ...s, loading: false }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate summary.";
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }

  return { state, setRange, handleGenerate };
}
