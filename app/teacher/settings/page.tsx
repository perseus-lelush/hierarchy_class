"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerFrame } from "@/components/ui/CornerFrame";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ThemePicker } from "@/components/ThemePicker";
import { FeedbackForm } from "@/components/FeedbackForm";
import { IconPencil } from "@/components/ui/icons";
import { useAccountRequests } from "@/lib/useAccountRequests";
import { createClient } from "@/lib/supabase/client";
import { deactivateAccount } from "@/lib/bridgeClient";
import { APP_VERSION } from "@/lib/version";
import { BetaBadge } from "@/components/ui/BetaBadge";
import { backendUrl } from "@/lib/siteUrl";

export default function TeacherSettingsPage() {
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
    <div className="space-y-4">
      {/* ============================================================ */}
      {/* BAND 0 - HEADER                                             */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">Preferences and account</h1>
          <h2 className="font-mono-ui mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-navy">
            Teacher settings · appearance, feedback, account
          </h2>
        </div>
      </div>

      {/* ============================================================ */}
      {/* HOME DASHBOARD                                              */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Home Dashboard</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Customize which information appears on your Home and how it is arranged. Widgets are projections of your
          live data - arranging them never changes the data itself.
        </p>
        <div className="mt-4">
          <Link href="/teacher/home?customize=1">
            <Button variant="accent" icon={<IconPencil size={13} />}>
              Customize Home
            </Button>
          </Link>
        </div>
      </CornerFrame>

      {/* ============================================================ */}
      {/* APPEARANCE                                                  */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Appearance</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Choose the theme you want to use the app in. Midnight is the default palette; Rose is the soft alternative.
        </p>
        <div className="mt-4">
          <ThemePicker />
        </div>
      </CornerFrame>

      {/* ============================================================ */}
      {/* FEEDBACK & REPORT                                           */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Feedback &amp; report</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Send feedback or report a problem. Your name, role, and the current page are included so the developer can follow up.
        </p>
        <div className="mt-4">
          <FeedbackForm />
        </div>
      </CornerFrame>

      {/* ============================================================ */}
      {/* ACCOUNT                                                     */}
      {/* ============================================================ */}
      <CornerFrame tone="warn" className="p-5">
        <h3 className="section-label">Account</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Deactivation is immediate and self-service; deletion is permanent and needs your school admin&apos;s approval.
        </p>
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-navy">Deactivate account</p>
              <p className="mt-1 text-xs text-muted">
                Temporarily disable your access. You can reactivate when you return.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => setDeactivateOpen(true)}
              className="shrink-0"
            >
              Deactivate account
            </Button>
          </div>
          <div className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-navy">Request account deletion</p>
              <p className="mt-1 text-xs text-muted">
                Permanently remove your account and personal data. This requires administrator approval.
              </p>
            </div>
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() => setDeletionOpen(true)}
              className="shrink-0"
            >
              Request deletion
            </Button>
          </div>
        </div>
        {requestMessage && <p className="mt-3 text-sm font-semibold text-accent-token">{requestMessage}</p>}
        {requestError && <p className="mt-3 text-sm text-warn">{requestError}</p>}
      </CornerFrame>

      {/* ============================================================ */}
      {/* ACCOUNT MODALS                                              */}
      {/* ============================================================ */}
      {deactivateOpen && (
        <Modal eyebrow="Account" description="Temporarily disable your access" onClose={() => setDeactivateOpen(false)}>
          <h2 className="mt-3 text-xl font-bold text-navy">Deactivate account?</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            Your account will be temporarily disabled. Your profile, courses, materials, and other data will be
            preserved. You can reactivate your account when you return.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeactivateOpen(false)} disabled={busy === "deactivation"}>
              Cancel
            </Button>
            <Button variant="accent" className="flex-1" loading={busy === "deactivation"} disabled={busy === "deactivation"} onClick={handleDeactivate}>
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
              <Button variant="danger" className="flex-1" loading={busy === "deletion"} disabled={busy === "deletion"} onClick={handleDeletionRequest}>
                Continue to Deletion Request
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <p className="pt-1 text-center font-mono-ui text-[10px] uppercase tracking-[0.2em] text-faint">
        Hierarchy Class · v{APP_VERSION} <BetaBadge />
      </p>
    </div>
  );
}
