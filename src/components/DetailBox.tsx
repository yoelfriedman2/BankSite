import { Pencil } from "lucide-react";

/** A small white card on an amber "private" wash — the same visual unit used
 *  by the redesigned Banks drawer, shared here so the Account view/edit
 *  popups can match it without touching BankForm.tsx. */
export function Box({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 rounded-xl border border-amber-100 bg-white p-3 shadow-sm last:mb-0">
      {children}
    </div>
  );
}

export function BoxHeader({
  title,
  onEdit,
  editLabel,
}: {
  title: string;
  onEdit?: () => void;
  editLabel?: string;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{title}</h4>
      <span className="flex-1" />
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="flex items-center gap-1 rounded-md p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-700"
        >
          {editLabel ? (
            <span className="text-xs font-semibold">{editLabel}</span>
          ) : (
            <Pencil className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

/** A compact read-only label/value row. */
export function Frow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-800">
        {value ?? <span className="font-normal text-slate-300">—</span>}
      </span>
    </div>
  );
}
