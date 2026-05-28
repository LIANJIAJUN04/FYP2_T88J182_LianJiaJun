"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Brain, X, AlertTriangle, Send, ArrowDown } from "lucide-react";
import type { ClinicalCopilotProps, ChatMessage } from "./ClinicalCopilot.types";

// ── Constants ─────────────────────────────────────────────────────────────────

const METRIC_LABELS: Record<string, string> = {
  spo2: "SpO₂", bpm: "Heart Rate", temperature: "Temperature",
};

function formatAlertValue(metric: string, value: number): string {
  if (metric === "bpm") return `${Math.round(value)} bpm`;
  if (metric === "temperature") return `${value.toFixed(1)}°C`;
  return `${value.toFixed(1)}%`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── Chat bubble content renderer ─────────────────────────────────────────────
// Handles both the structured initial analysis (emoji headers + bullets)
// and free-form conversational follow-up responses (bullets + paragraphs).

function BubbleContent({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        // Emoji section header: "📥 **What Happened**" etc.
        const emojiMatch = line.match(/^([📥🔍⚡])\s*\*\*(.+?)\*\*/);
        if (emojiMatch) {
          return (
            <div key={i} className={`flex items-center gap-2 ${i > 0 ? "mt-5" : "mt-0"} mb-2`}>
              <span className="text-base leading-none">{emojiMatch[1]}</span>
              <span
                className="text-sm font-black uppercase tracking-[0.12em]"
                style={{ color: "#4cd7f6" }}
              >
                {emojiMatch[2]}
              </span>
            </div>
          );
        }

        // Bullet: "• text"
        if (line.startsWith("• ") || line.startsWith("- ")) {
          return (
            <div key={i} className="flex items-start gap-2 pl-4">
              <span
                className="text-[15px] font-bold shrink-0 mt-0.5 leading-relaxed"
                style={{ color: "#4cd7f6" }}
              >
                •
              </span>
              <span className="text-[15px] leading-relaxed" style={{ color: "#e4e2e4" }}>
                {line.slice(2)}
              </span>
            </div>
          );
        }

        // Blank line → spacer
        if (!line.trim()) return <div key={i} className="h-2" />;

        // Regular paragraph
        return (
          <p key={i} className="text-[15px] leading-relaxed" style={{ color: "#dde2ef" }}>
            {line}
          </p>
        );
      })}
    </div>
  );
}

// ── Chat message bubbles ──────────────────────────────────────────────────────

function AIBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-end gap-2 max-w-[92%]">
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-0.5"
        style={{
          background: "rgba(76,215,246,0.12)",
          border: "1px solid rgba(76,215,246,0.2)",
        }}
      >
        <Brain className="w-3 h-3" style={{ color: "#4cd7f6" }} />
      </div>

      <div className="flex flex-col gap-1">
        <div
          className="rounded-2xl rounded-bl-sm px-4 py-3"
          style={{
            background: msg.isError
              ? "rgba(239,68,68,0.07)"
              : "rgba(255,255,255,0.05)",
            border: msg.isError
              ? "1px solid rgba(239,68,68,0.2)"
              : "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {msg.isError ? (
            <p className="text-[15px] leading-relaxed" style={{ color: "#f87171" }}>{msg.content}</p>
          ) : (
            <BubbleContent text={msg.content} />
          )}
        </div>
        <span className="text-[11px] pl-1" style={{ color: "#45464d" }}>
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}

function UserBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="flex items-end justify-end gap-2 max-w-[85%] ml-auto">
      <div className="flex flex-col items-end gap-1">
        <div
          className="rounded-2xl rounded-br-sm px-4 py-2.5"
          style={{
            background: "rgba(76,215,246,0.1)",
            border: "1px solid rgba(76,215,246,0.18)",
          }}
        >
          <p className="text-[15px] leading-relaxed" style={{ color: "#f0f0f2" }}>
            {msg.content}
          </p>
        </div>
        <span className="text-[11px] pr-1" style={{ color: "#45464d" }}>
          {formatTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ── Animated typing indicator ─────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div
        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: "rgba(76,215,246,0.12)",
          border: "1px solid rgba(76,215,246,0.2)",
        }}
      >
        <Brain className="w-3 h-3" style={{ color: "#4cd7f6" }} />
      </div>
      <div
        className="rounded-2xl rounded-bl-sm px-4 py-3"
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}
      >
        <div className="flex gap-1.5 items-center h-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ scale: [1, 1.5, 1], opacity: [0.35, 1, 0.35] }}
              transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: "easeInOut" }}
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: "#4cd7f6" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 py-8">
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(76,215,246,0.06)", border: "1px solid rgba(76,215,246,0.12)" }}
      >
        <Brain className="w-5 h-5" style={{ color: "#45464d" }} />
      </div>
      <p className="text-sm text-center" style={{ color: "#45464d" }}>
        Click &ldquo;Check&rdquo; on an alert to begin a clinical consultation.
      </p>
    </div>
  );
}

// ── Main chatbox component ────────────────────────────────────────────────────

export function ClinicalCopilot({
  isOpen,
  onClose,
  context,
  messages,
  initializing,
  sending,
  onSendMessage,
}: ClinicalCopilotProps) {
  const [inputValue, setInputValue] = useState("");
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom whenever messages/state changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, initializing, sending]);

  // Track whether the user has scrolled up (show jump-to-bottom button)
  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }, []);

  // Focus input when drawer opens with a new context
  useEffect(() => {
    if (isOpen && !initializing && messages.length > 0) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, initializing, messages.length]);

  const handleSend = useCallback(() => {
    const msg = inputValue.trim();
    if (!msg || sending || initializing) return;
    setInputValue("");
    onSendMessage(msg);
  }, [inputValue, sending, initializing, onSendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const isBusy = initializing || sending;
  const metricLabel = context ? (METRIC_LABELS[context.metric] ?? context.metric) : "";
  const formattedValue = context ? formatAlertValue(context.metric, context.value) : "";
  const triggeredTime = context
    ? new Date(context.triggeredAt).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "";

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="copilot-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0"
            style={{ background: "rgba(0,0,0,0.4)", zIndex: 60 }}
          />

          {/* Drawer */}
          <motion.div
            key="copilot-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 h-screen flex flex-col"
            style={{
              width: "min(460px, 100vw)",
              zIndex: 61,
              background: "#0e0e10",
              borderLeft: "1px solid rgba(76,215,246,0.1)",
              boxShadow: "-12px 0 60px rgba(0,0,0,0.7)",
            }}
          >
            {/* ── Sticky header ─────────────────────────────────── */}
            <div
              className="shrink-0 px-4 pt-4 pb-3"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Title + context */}
                <div className="flex items-start gap-2.5 min-w-0">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: "linear-gradient(135deg, rgba(76,215,246,0.15), rgba(3,181,211,0.08))",
                      border: "1px solid rgba(76,215,246,0.2)",
                    }}
                  >
                    <Brain className="w-4 h-4" style={{ color: "#4cd7f6" }} />
                  </div>
                  <div className="min-w-0">
                    <p
                      className="text-sm font-black leading-tight"
                      style={{ color: "#e4e2e4", fontFamily: "'Plus Jakarta Sans', 'Inter', sans-serif" }}
                    >
                      Clinical AI Copilot
                    </p>
                    {context ? (
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <AlertTriangle className="w-2.5 h-2.5 shrink-0" style={{ color: "#fbbf24" }} />
                        <span className="text-[10px] font-semibold" style={{ color: "#fbbf24" }}>
                          {metricLabel}
                        </span>
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-md tabular-nums"
                          style={{ background: "rgba(255,180,171,0.08)", color: "#ffb4ab" }}
                        >
                          {formattedValue}
                        </span>
                        <span className="text-[9px]" style={{ color: "#45464d" }}>
                          {triggeredTime}
                        </span>
                      </div>
                    ) : (
                      <p className="text-[10px] mt-0.5" style={{ color: "#45464d" }}>
                        No alert selected
                      </p>
                    )}
                  </div>
                </div>

                {/* Close */}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg shrink-0 transition-opacity hover:opacity-70"
                  style={{ background: "rgba(255,255,255,0.04)", color: "#909097" }}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── Scrollable message canvas ──────────────────────── */}
            <div
              ref={scrollAreaRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
              style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.06) transparent" }}
            >
              {/* Empty state — no alert selected yet */}
              {!context && messages.length === 0 && !initializing && <EmptyState />}

              {/* Render message bubbles */}
              {messages.map((msg) =>
                msg.role === "ai"
                  ? <AIBubble key={msg.id} msg={msg} />
                  : <UserBubble key={msg.id} msg={msg} />,
              )}

              {/* Typing indicator: shown only while waiting for the FIRST token.
                  Once the AI message bubble is seeded (last message role === "ai"),
                  the indicator hides and the bubble takes over — no overlap. */}
              {isBusy && (messages.length === 0 || messages[messages.length - 1].role === "user") && (
                <TypingIndicator />
              )}

              {/* Invisible sentinel — scrolled into view on new messages */}
              <div ref={bottomRef} />
            </div>

            {/* Jump-to-bottom button */}
            <AnimatePresence>
              {showScrollBtn && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  onClick={scrollToBottom}
                  className="absolute bottom-[72px] right-4 p-2 rounded-full"
                  style={{
                    background: "rgba(76,215,246,0.12)",
                    border: "1px solid rgba(76,215,246,0.25)",
                    color: "#4cd7f6",
                  }}
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>

            {/* ── Sticky input bar ───────────────────────────────── */}
            <div
              className="shrink-0 px-3 py-3"
              style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: `1px solid ${isBusy ? "rgba(76,215,246,0.1)" : "rgba(255,255,255,0.08)"}`,
                  transition: "border-color 0.2s",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isBusy
                      ? "AI is responding…"
                      : messages.length === 0
                      ? "Waiting for initial analysis…"
                      : "Ask a follow-up question… (Enter to send)"
                  }
                  disabled={isBusy || messages.length === 0}
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-base outline-none leading-relaxed"
                  style={{
                    color: "#e4e2e4",
                    caretColor: "#4cd7f6",
                    maxHeight: "96px",
                    overflowY: "auto",
                  }}
                  onInput={(e) => {
                    const t = e.currentTarget;
                    t.style.height = "auto";
                    t.style.height = `${Math.min(t.scrollHeight, 96)}px`;
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isBusy || messages.length === 0}
                  className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                  style={{
                    background:
                      !inputValue.trim() || isBusy || messages.length === 0
                        ? "rgba(76,215,246,0.05)"
                        : "linear-gradient(135deg, #4cd7f6, #03b5d3)",
                    color:
                      !inputValue.trim() || isBusy || messages.length === 0
                        ? "#45464d"
                        : "#001f26",
                    cursor:
                      !inputValue.trim() || isBusy || messages.length === 0
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[10px] text-center mt-1.5 tracking-wider" style={{ color: "#2a2a2e" }}>
                Powered by claude-haiku-4-5 · Clinical decision support only
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
