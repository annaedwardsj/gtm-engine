"use client";

import { useState } from "react";
import { ICP } from "@/types/icp";
import ICPCard from "@/components/ICPCard";
import CompanyCard from "@/components/CompanyCard";
import { CompanyMatch } from "@/types/company";

function Spinner() {
  return (
    <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function Home() {
  const [description, setDescription] = useState("");
  const [icp, setIcp] = useState<ICP | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [approved, setApproved] = useState(false);
  const [companies, setCompanies] = useState<CompanyMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function findCompanies() {
    if (!icp) return;
    setApproved(true);
    setSearching(true);
    setSearchError(null);
    setCompanies(null);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setCompanies(data.companies);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSearching(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setIcp(null);
    setApproved(false);
    setCompanies(null);
    setSearchError(null);

    try {
      const res = await fetch("/api/icp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Unknown error");
      }
      const data: ICP = await res.json();
      setIcp(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="mx-auto max-w-4xl px-4 py-12 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-100 px-3 py-1 text-xs font-medium text-indigo-700">
            Step 1 of 5
          </div>
          <h1 className="text-3xl font-bold text-slate-900">AI GTM Engine</h1>
          <p className="text-slate-500">Describe your product and get an AI-generated Ideal Customer Profile.</p>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="desc">
              What does your product do?
            </label>
            <textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. We build a sales intelligence platform that automatically researches prospects and writes personalised outreach emails using AI, integrating with Salesforce and HubSpot."
              rows={5}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 transition-all resize-none"
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-400">
              Be specific — mention the problem, the buyer, and any integrations.
            </p>
            <button
              type="submit"
              disabled={loading || !description.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Spinner />
                  Generating…
                </>
              ) : (
                "Generate ICP"
              )}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ICP Result */}
        {icp && <ICPCard icp={icp} />}

        {/* Step 2: Approve ICP → find matching companies */}
        {icp && (
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-6 py-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {approved ? "ICP approved" : "Happy with this ICP?"}
              </p>
              <p className="text-xs text-slate-500">
                Step 2 searches the web with Tavily for 5–8 real companies that match it.
              </p>
            </div>
            <button
              onClick={findCompanies}
              disabled={searching}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {searching ? (
                <>
                  <Spinner />
                  Searching…
                </>
              ) : approved ? (
                "Search again"
              ) : (
                "Approve ICP & find companies"
              )}
            </button>
          </div>
        )}

        {searchError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchError}
          </div>
        )}

        {companies && (
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Matching companies</h2>
              <span className="text-xs text-slate-400">{companies.length} found via Tavily</span>
            </div>
            {companies.length === 0 ? (
              <p className="text-sm text-slate-500">No matching companies found in the search results. Try searching again.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {companies.map((c) => (
                  <CompanyCard key={c.name} company={c} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
