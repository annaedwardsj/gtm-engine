"use client";

import { useState } from "react";
import { Lead } from "@/types/lead";

interface Props {
  lead: Lead;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onSaveDraft: (draft: { subject: string; body: string }) => void;
}

const VERIFICATION_STYLE: Record<string, string> = {
  valid: "bg-emerald-100 text-emerald-700",
  accept_all: "bg-amber-100 text-amber-700",
  unknown: "bg-slate-100 text-slate-600",
  invalid: "bg-red-100 text-red-700",
};

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LeadCard({ lead, busy, onApprove, onReject, onRestore, onSaveDraft }: Props) {
  const { company, contact, draft, status } = lead;
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const isSample = contact.source === "sample";

  function save() {
    onSaveDraft({ subject: subject.trim(), body: body.trim() });
    setEditing(false);
  }
  function cancel() {
    setSubject(draft.subject);
    setBody(draft.body);
    setEditing(false);
  }

  return (
    <div
      className={`rounded-2xl border bg-white shadow-sm transition-all ${
        status === "contacted"
          ? "border-emerald-300"
          : status === "rejected"
          ? "border-slate-200 opacity-50"
          : "border-slate-200"
      }`}
    >
      {/* Company + contact */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">{company.name}</h3>
            {company.domain && <span className="text-xs text-slate-400">{company.domain}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-700">
            <span className="font-medium">{contact.name}</span>
            <span className="text-slate-400">·</span>
            <span>{contact.title}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-slate-600 break-all">{contact.email}</span>
            {isSample ? (
              <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">
                SAMPLE CONTACT — not real
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 font-medium ${
                  VERIFICATION_STYLE[contact.verification ?? "unknown"] ?? VERIFICATION_STYLE.unknown
                }`}
              >
                {contact.verification ? `Hunter: ${contact.verification}` : "Hunter: not verified"}
                {contact.confidence != null && ` · ${contact.confidence}%`}
              </span>
            )}
          </div>
          {isSample && <p className="text-xs text-orange-700">{contact.sampleReason}</p>}
        </div>

        <StatusBadge status={status} contactedAt={lead.contactedAt} />
      </div>

      {/* Draft */}
      <div className="space-y-3 px-5 py-4">
        {company.triggerSignal && (
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-amber-700">Trigger:</span> {company.triggerSignal}{" "}
            <a
              href={company.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              ({hostname(company.sourceUrl)} ↗)
            </a>
          </p>
        )}

        {editing ? (
          <div className="space-y-2">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              className="w-full rounded-lg border border-indigo-300 px-3 py-2 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Subject: {draft.subject}</p>
            <p className="whitespace-pre-line text-sm text-slate-700 leading-relaxed">{draft.body}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {editing ? (
            <>
              <button
                onClick={save}
                disabled={!subject.trim() || !body.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={cancel}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : status === "pending" ? (
            <>
              <button
                onClick={onApprove}
                disabled={busy}
                className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={busy}
                className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Edit
              </button>
              <button
                onClick={onReject}
                disabled={busy}
                className="rounded-lg border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Reject
              </button>
              <span className="self-center text-xs text-slate-400">Approve does not send email.</span>
            </>
          ) : (
            <button
              onClick={onRestore}
              disabled={busy}
              className="text-xs text-slate-400 underline hover:text-slate-600 disabled:opacity-50"
            >
              Move back to review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status, contactedAt }: { status: Lead["status"]; contactedAt?: string }) {
  if (status === "contacted") {
    return (
      <div className="text-right">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Contacted</span>
        {contactedAt && (
          <p className="mt-1 text-xs text-slate-400">{new Date(contactedAt).toLocaleString()}</p>
        )}
      </div>
    );
  }
  if (status === "rejected") {
    return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Rejected</span>;
  }
  return <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600">Needs review</span>;
}
