"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemePicker } from "@/components/ThemePicker";
import { FeedbackForm } from "@/components/FeedbackForm";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useAccountRequests } from "@/lib/useAccountRequests";
import { createClient } from "@/lib/supabase/client";
import { deactivateAccount } from "@/lib/bridgeClient";
import { APP_VERSION } from "@/lib/version";
import { BetaBadge } from "@/components/ui/BetaBadge";
import { backendUrl } from "@/lib/siteUrl";

export default function SettingsPage() {
  const { request } = useAccountRequests();
  const router = useRouter();
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [deletionOpen, setDeletionOpen] = useState(false);

  async function handleDeactivate() {
    setBusy("deactivation");
    setRequestMessage(null);
    setRequestError(null);
    const result = await deactivateAccount();
    if (!result.ok) {
      setRequestError(result.error ?? "Couldn't deactivate your account.");
      setBusy(null);
      setDeactivateOpen(false);
      return;
    }
    // Deactivation is immediate and self-service: sign out and return to login.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login?deactivated=1");
  }

  async function handleDeletionRequest() {
    setBusy("deletion");
    setRequestMessage(null);
    setRequestError(null);
    const ok = await request("deletion");
    setBusy(null);
    if (ok) {
      setRequestMessage("Deletion request submitted. An admin will review it.");
      setDeletionOpen(false);
    } else {
      setRequestError("Couldn't submit the request. Please try again.");
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-navy">Appearance</h2>
        <p className="text-xs text-muted">Choose the theme you want to use the app in.</p>
        <ThemePicker />
      </section>

      <section className="space-y-4 border-t border-base pt-8">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-navy">About Hierarchy Class</h2>
        <p className="text-sm leading-6 text-muted">
          Hierarchy Class is a gamified learning tracker built for students, teachers, and admins. It uses ranks, materials, and library tools to keep progress visible and motivating.
        </p>
      </section>

      <section className="space-y-4 border-t border-base pt-8">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-navy">Feedback &amp; report</h2>
        <p className="text-xs text-muted">
          Send feedback or report a problem. Your name, role, and the current page are included so the developer can follow up.
        </p>
        <FeedbackForm />
      </section>

      <section className="space-y-4 border-t border-base pt-8">
        <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-navy">Account</h2>
        <div className="divide-y divide-[var(--border)]">
          <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-navy">Deactivate account</p>
              <p className="mt-1 text-xs text-muted">Temporarily disable your access. You can reactivate when you return.</p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setDeactivateOpen(true)}
              className="shrink-0 rounded-full border border-base bg-surface px-4 py-2 text-xs font-semibold text-navy transition hover-border-warn-soft hover-text-warn disabled:opacity-50"
            >
              Deactivate account
            </button>
          </div>
          <div className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-navy">Request account deletion</p>
              <p className="mt-1 text-xs text-muted">Permanently remove your account and personal data. This requires administrator approval.</p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setDeletionOpen(true)}
              className="shrink-0 rounded-full border border-warn-soft bg-surface px-4 py-2 text-xs font-semibold text-warn transition hover-bg-warn-soft disabled:opacity-50"
            >
              Request deletion
            </button>
          </div>
        </div>
        {requestMessage && <p className="text-sm font-semibold text-accent-token">{requestMessage}</p>}
        {requestError && <p className="text-sm text-warn">{requestError}</p>}
      </section>

      <p className="flex items-center justify-center gap-2 text-center text-xs text-muted">Hierarchy Class · v{APP_VERSION} <BetaBadge /></p>

      {deactivateOpen && (
        <Modal eyebrow="Account" description="Temporarily disable your access" onClose={() => setDeactivateOpen(false)}>
          <h2 className="mt-3 text-xl font-bold text-navy">Deactivate account?</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your account will be temporarily disabled. Your profile, academic records, achievements, music, and other
            data will be preserved. You can reactivate your account when you return.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeactivateOpen(false)} disabled={busy === "deactivation"}>
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1"
              loading={busy === "deactivation"}
              disabled={busy === "deactivation"}
              onClick={handleDeactivate}
            >
              Deactivate account
            </Button>
          </div>
        </Modal>
      )}

      {deletionOpen && (
        <Modal eyebrow="Account" description="Permanent account removal" onClose={() => setDeletionOpen(false)}>
          <h2 className="mt-3 text-xl font-bold text-navy">Deleting your account is permanent.</h2>
          <div className="mt-3 space-y-2 text-sm leading-6 text-muted">
            <p>
              Your personal account data will be removed. School-required academic records may be retained or
              anonymized for school records.
            </p>
            <p>This requires administrator approval before anything is removed.</p>
            <p className="font-semibold text-navy">We recommend downloading your data first.</p>
          </div>
          <div className="mt-5 space-y-2">
            <a
              href={backendUrl("/api/export-account")}
              className="flex w-full items-center justify-center rounded-[10px] border border-base bg-surface px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-accent"
            >
              Download My Data
            </a>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setDeletionOpen(false)} disabled={busy === "deletion"}>
                Cancel
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                loading={busy === "deletion"}
                disabled={busy === "deletion"}
                onClick={handleDeletionRequest}
              >
                Continue to Deletion Request
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
