"use client";

import { FileText, Paperclip, Trash2, Upload } from "lucide-react";
import { ActionForm, SubmitButton } from "./ui/form";
import { ConfirmAction } from "./ui/modal";
import { deleteAttachment, uploadAttachment } from "@/app/(app)/transactions/attachment-actions";

export interface AttachmentItem {
  id: string;
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
  description: string | null;
}

export function Attachments({
  items,
  transactionId,
  kind,
  financialYear,
}: {
  items: AttachmentItem[];
  transactionId?: string;
  kind?: "RECEIPT" | "TAX_DOCUMENT";
  financialYear?: string;
}) {
  return (
    <div className="space-y-3">
      {items.length > 0 ? (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {items.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted" />
              <a href={`/api/attachments/${a.id}`} target="_blank" rel="noopener" className="min-w-0 flex-1 truncate text-[13px] text-accent hover:underline">
                {a.filename}
              </a>
              <span className="shrink-0 text-[11.5px] text-muted">{(a.size / 1024).toFixed(0)} KB</span>
              <ConfirmAction action={deleteAttachment.bind(null, a.id)} title="Delete file?" description={`“${a.filename}” will be permanently removed.`} size="icon" className="size-7">
                <Trash2 className="size-3.5" />
              </ConfirmAction>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <Paperclip className="size-4" /> No files attached.
        </p>
      )}
      <ActionForm action={uploadAttachment} resetOnSuccess className="flex flex-wrap items-center gap-2">
        {transactionId && <input type="hidden" name="transactionId" value={transactionId} />}
        {kind && <input type="hidden" name="kind" value={kind} />}
        {financialYear && <input type="hidden" name="financialYear" value={financialYear} />}
        <input
          type="file"
          name="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.csv"
          className="max-w-[240px] text-[12.5px] file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-2.5 file:py-1 file:text-[12px]"
          aria-label="Choose file"
        />
        {kind === "TAX_DOCUMENT" && <input name="description" placeholder="Description (e.g. Form 16)" className="h-8 rounded-lg border border-line bg-surface px-2 text-[12.5px]" />}
        <SubmitButton variant="secondary">
          <Upload className="size-3.5" /> Upload
        </SubmitButton>
        <span className="text-[11px] text-muted">PDF/images ≤ 10 MB · encrypted at rest</span>
      </ActionForm>
    </div>
  );
}
