import { CompanyMatch } from "@/types/company";

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function CompanyCard({ company }: { company: CompanyMatch }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <h3 className="text-base font-semibold text-slate-900">{company.name}</h3>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Why it matches</p>
        <p className="text-sm text-slate-600 leading-relaxed">{company.whyMatch}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Trigger signal</p>
        {company.triggerSignal ? (
          <p className="inline-flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-sm text-amber-800">
            <span className="mt-1.5 size-1.5 rounded-full bg-amber-500 shrink-0" />
            {company.triggerSignal}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic">None found</p>
        )}
      </div>

      <a
        href={company.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={company.sourceTitle}
        className="mt-auto pt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline break-all"
      >
        Source: {hostname(company.sourceUrl)} ↗
      </a>
    </div>
  );
}
