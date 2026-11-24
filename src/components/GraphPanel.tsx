"use client";

import { useCallback, useEffect, useState } from "react";
import { SAVED_QUERIES } from "@/lib/savedQueries";

type Stats = Record<string, number>;
type Result = { columns: string[]; rows: Record<string, unknown>[] };
type AskResult = Result & { answer: string; cypher: string; explanation: string };

function ResultTable({ result }: { result: Result }) {
  if (result.rows.length === 0) return <p className="text-sm text-slate-500">No results yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {result.columns.map((c) => (
              <th key={c} className="px-3 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {result.rows.map((row, i) => (
            <tr key={i}>
              {result.columns.map((c) => (
                <td key={c} className="px-3 py-2 text-slate-700">
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const STAT_LABELS: [string, string][] = [
  ["icps", "ICPs"],
  ["companies", "Companies"],
  ["signals", "Signals"],
  ["contacts", "Contacts"],
  ["contacted", "Contacted"],
  ["pending", "Pending"],
  ["rejected", "Rejected"],
  ["relationships", "Relationships"],
];

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toLocaleString();
  if (Array.isArray(v)) return v.map(formatCell).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Shows what's stored in Neo4j. `refreshKey` changes whenever the app writes to the graph. */
export default function GraphPanel({ refreshKey }: { refreshKey: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [askResult, setAskResult] = useState<AskResult | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setAsking(true);
    setAskError(null);
    setAskResult(null);
    try {
      const res = await fetch("/api/graph/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAskResult(data);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "Couldn't answer that");
    } finally {
      setAsking(false);
    }
  }

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/graph");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats(data.stats);
      setStatsError(null);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Could not reach Neo4j");
    }
  }, []);

  const runQuery = useCallback(async (id: string) => {
    setActiveId(id);
    setRunning(true);
    setQueryError(null);
    try {
      const res = await fetch(`/api/graph?q=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (err) {
      setResult(null);
      setQueryError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setRunning(false);
    }
  }, []);

  useEffect(() => {
    // Fetch on mount and whenever the app writes to the graph; setState happens after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
    if (activeId) runQuery(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const active = SAVED_QUERIES.find((q) => q.id === activeId);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Graph</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Everything saved to Neo4j across all your runs. Sample contacts are never stored.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadStats}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
          <a
            href="https://console.neo4j.io"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-slate-50"
          >
            Open Aura explorer ↗
          </a>
        </div>
      </div>

      {/* Counts */}
      <div className="px-6 py-4">
        {statsError ? (
          <p className="text-sm text-red-600">
            {statsError}. If your AuraDB Free instance was idle for a few days it may be paused — resume it in the
            Aura console.
          </p>
        ) : !stats ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STAT_LABELS.map(([k, label]) => (
              <div key={k} className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                <p className="text-xl font-bold text-slate-900">{stats[k] ?? 0}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Saved questions */}
      <div className="px-6 py-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Ask the graph</h3>
        <div className="flex flex-wrap gap-2">
          {SAVED_QUERIES.map((q) => (
            <button
              key={q.id}
              onClick={() => runQuery(q.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                activeId === q.id
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {q.question}
            </button>
          ))}
        </div>

        {active && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">{active.explain}</p>
            <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
              {active.cypher}
            </pre>
            {running ? (
              <p className="text-sm text-slate-400">Running…</p>
            ) : queryError ? (
              <p className="text-sm text-red-600">{queryError}</p>
            ) : result ? (
              <ResultTable result={result} />
            ) : null}
          </div>
        )}
      </div>

      {/* Free-form questions */}
      <div className="px-6 py-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Ask your own question</h3>
        <form onSubmit={ask} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Which companies that raised a Series B have a verified contact?"
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {asking ? "Thinking…" : "Ask"}
          </button>
        </form>
        <p className="text-xs text-slate-400">
          Claude writes the Cypher; it runs read-only, so asking can never change your data.
        </p>

        {askError && <p className="text-sm text-red-600">{askError}</p>}
        {askResult && (
          <div className="space-y-3">
            <p className="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 text-sm text-slate-800">
              {askResult.answer}
            </p>
            {askResult.cypher && (
              <>
                <p className="text-xs text-slate-500">{askResult.explanation}</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 text-xs leading-relaxed text-slate-100">
                  {askResult.cypher}
                </pre>
                <ResultTable result={askResult} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
