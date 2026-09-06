"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMyProfile } from "@/lib/useMyProfile";
import { createClient } from "@/lib/supabase/client";
import { validateUpload, extensionForMime } from "@/lib/uploadUtils";
import { randomId } from "@/lib/randomId";
import { backendUrl } from "@/lib/siteUrl";

const MAX_ATTACHMENTS = 3;

interface PendingAttachment {
  /** Local preview / label only - the file is uploaded on submit. */
  id: string;
  name: string;
  size: number;
}

export function FeedbackForm() {
  const pathname = usePathname();
  const { profile } = useMyProfile();
  const [feedback, setFeedback] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pending: PendingAttachment[] = files.map((f) => ({
    id: `${f.name}-${f.size}-${f.lastModified}`,
    name: f.name,
    size: f.size,
  }));

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;
    setErrorText(null);
    if (state === "done") setState("idle");

    const remaining = MAX_ATTACHMENTS - files.length;
    if (picked.length > remaining) {
      setErrorText(`You can attach up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    for (const file of picked) {
      const validationError = validateUpload(file, "document", { maxSizeMB: 2 });
      if (validationError) {
        setErrorText(validationError);
        return;
      }
    }
    setFiles((prev) => [...prev, ...picked]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!feedback.trim()) return;
    setState("sending");
    setErrorText(null);

    // 1) Upload attachments to the private feedback bucket FIRST (paths are
    //    {school_id}/{user_id}/{uuid}.ext - storage RLS binds the folder).
    const uploadedPaths: string[] = [];
    try {
      if (files.length > 0) {
        if (!profile) {
          setState("error");
          setErrorText("Please sign in before attaching files.");
          return;
        }
        const supabase = createClient();
        setUploading(true);
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          setUploadProgress(`Uploading ${i + 1} of ${files.length}…`);
          const ext = extensionForMime(file.type) ?? "bin";
          const path = `${profile.school_id}/${profile.id}/${randomId()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("feedback")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (uploadError) {
            setState("error");
            setErrorText(`Couldn't upload "${file.name}". Try a smaller file or a different type.`);
            return;
          }
          uploadedPaths.push(path);
        }
        setUploadProgress(null);
        setUploading(false);
      }

      // 2) Submit the report with the stored paths.
      const res = await fetch(backendUrl("/api/feedback"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedback,
          page: pathname,
          attachmentPaths: uploadedPaths,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setErrorText(data?.error ?? "Couldn't send your feedback. Please try again.");
        return;
      }
      setState("done");
      setFeedback("");
      setFiles([]);
    } catch {
      setState("error");
      setErrorText("Network error - please try again.");
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <textarea
        value={feedback}
        onChange={(e) => {
          setFeedback(e.target.value);
          if (state === "done") setState("idle");
        }}
        rows={4}
        maxLength={5000}
        placeholder="Tell us what would make the app better, or report a problem..."
        className="w-full border-b border-base bg-transparent px-1 py-2 text-sm text-navy outline-none focus:border-accent"
      />

      {/* Attachments */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={handleFilePick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={files.length >= MAX_ATTACHMENTS || state === "sending"}
          className="inline-flex items-center gap-1.5 rounded-full border border-base bg-surface px-3.5 py-2 text-xs font-semibold text-navy transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
          Attach screenshot or file
          {files.length > 0 && ` (${files.length}/${MAX_ATTACHMENTS})`}
        </button>
        {files.length > 0 && (
          <span className="text-[11px] text-muted">
            Uploaded privately with your report - delivered only to the developer.
          </span>
        )}
      </div>

      {pending.length > 0 && (
        <div className="space-y-1.5">
          {pending.map((file, i) => (
            <div
              key={file.id}
              className="flex items-center gap-2.5 rounded-[10px] border border-base bg-[var(--surface-strong)] px-3 py-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                <path d="M13 2v7h7" />
              </svg>
              <span className="min-w-0 flex-1 truncate text-sm text-navy">{file.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                disabled={state === "sending"}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-full border border-base p-1 text-muted transition hover:border-warn-soft hover:text-warn disabled:opacity-50"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {uploadProgress && <p className="text-xs text-muted">{uploadProgress}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "sending" || !feedback.trim() || uploading}
          className="inline-flex items-center justify-center rounded-full bg-navy px-5 py-3 text-sm font-semibold text-white transition hover-bg-accent-token hover-text-on-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "sending" || uploading ? "Sending..." : "Send feedback"}
        </button>
        {state === "done" && (
          <p className="text-sm font-semibold text-accent-token">Thanks! Your feedback has been sent.</p>
        )}
        {state === "error" && errorText && (
          <p className="text-sm text-warn">{errorText}</p>
        )}
      </div>
    </form>
  );
}
