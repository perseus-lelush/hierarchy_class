"use client";

import { useState } from "react";
import Link from "next/link";
import { CornerFrame } from "@/components/ui/CornerFrame";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Chip } from "@/components/ui/Chip";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { IconCheck, IconX, IconUser, IconPencil, IconPost } from "@/components/ui/icons";
import { ThemePicker } from "@/components/ThemePicker";
import { FeedbackForm } from "@/components/FeedbackForm";
import { useAccountRequests } from "@/lib/useAccountRequests";
import { useAppeals } from "@/lib/useAppeals";
import { resolveDeletionRequest, resolveAppeal } from "@/lib/bridgeClient";
import { APP_VERSION } from "@/lib/version";

export default function AdminSettingsPage() {
  const { requests, loading: requestsLoading, error: requestsError, refetch: refetchRequests } = useAccountRequests();
  const { appeals, loading: appealsLoading, error: appealsError, refetch: refetchAppeals } = useAppeals();
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const pendingAppeals = appeals.filter((a) => a.status === "pending").length;

  // Approve/deny run through the server action, which re-verifies the caller
  // is an admin of the same school and (for approval) executes the deletion.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarnings, setActionWarnings] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setBusyId(id);
    setActionError(null);
    setActionWarnings(null);
    const result = await resolveDeletionRequest(id, "approved");
    setBusyId(null);
    setConfirmingId(null);
    if (!result.ok) {
      setActionError(result.error ?? "Couldn't approve the request.");
      return;
    }
    if (result.warnings?.length) {
      setActionWarnings(`Account deleted, but some files could not be removed: ${result.warnings.join("; ")}`);
    }
    refetchRequests();
  }

  async function handleDeny(id: string) {
    setBusyId(id);
    setActionError(null);
    const result = await resolveDeletionRequest(id, "denied");
    setBusyId(null);
    if (!result.ok) {
      setActionError(result.error ?? "Couldn't deny the request.");
      return;
    }
    refetchRequests();
  }

  // Appeal review: approving restores the user's access (clears the
  // restriction); denying keeps the account restricted. The server action
  // re-verifies the caller is an admin of the appeal's school.
  const [appealBusyId, setAppealBusyId] = useState<string | null>(null);
  const [appealActionError, setAppealActionError] = useState<string | null>(null);

  async function handleAppeal(id: string, approved: boolean) {
    setAppealBusyId(id);
    setAppealActionError(null);
    const result = await resolveAppeal(id, approved);
    setAppealBusyId(null);
    if (!result.ok) {
      setAppealActionError(result.error ?? "Couldn't update the appeal.");
      return;
    }
    refetchAppeals();
  }

  return (
    <div className="space-y-4">
      {/* ============================================================ */}
      {/* BAND 0 - HEADER                                             */}
      {/* ============================================================ */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-navy">System configuration</h1>
          <h2 className="font-mono-ui mt-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-navy">
            Portal appearance · account management
          </h2>
        </div>
        <Stat
          label="Pending requests"
          value={requestsLoading ? "-" : pendingCount}
          tone={pendingCount > 0 ? "warn" : "muted"}
          hint="Awaiting your decision"
        />
      </div>

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
      {/* HOME DASHBOARD                                              */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Home Dashboard</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Customize which information appears on your Admin Home and how it is arranged. Widgets are projections of
          your school&apos;s live data - arranging them never changes the data itself.
        </p>
        <div className="mt-4">
          <Link href="/admin/home?customize=1">
            <Button variant="accent" icon={<IconPencil size={13} />}>
              Customize Home
            </Button>
          </Link>
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
      {/* ACCOUNT REQUESTS                                            */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Account requests</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Deletion requests from students and teachers need your confirmation. Deactivation is now self-service and
          needs no approval.
        </p>
        <div className="mt-4">
          {requestsLoading ? (
            /* Skeleton: mirror the real request-row geometry. */
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-[10px] border border-base p-4"
                >
                  <div className="h-10 w-10 shrink-0 rounded-full bg-tile" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-44 rounded-full bg-tile" />
                    <div className="h-2.5 w-28 rounded-full bg-tile" />
                  </div>
                  <div className="h-7 w-28 rounded-full bg-tile" />
                </div>
              ))}
            </div>
          ) : requestsError ? (
            <p className="rounded-[10px] border border-warn-soft bg-warn-soft px-4 py-3 text-sm text-warn">
              {requestsError}
            </p>
          ) : requests.length === 0 ? (
            <div className="py-4">
              <EmptyState
                icon={<IconUser size={16} />}
                title="No requests on record"
                desc="Deletion requests from students and teachers will appear here."
              />
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((request) => {
                const resolved = request.status !== "pending";
                const typeLabel =
                  request.type === "deletion" ? "Account deletion" : "Account deactivation";
                return (
                  <div
                    key={request.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar name={request.requester_name ?? "A user"} size="md" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-navy">
                          {request.requester_name ?? "A user"}
                          {request.requester_role && (
                            <span className="font-normal text-muted"> · {request.requester_role}</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {typeLabel} requested on {new Date(request.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {resolved ? (
                        <Chip variant={request.status === "approved" ? "success" : "danger"}>
                          {request.status}
                        </Chip>
                      ) : (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            icon={<IconCheck size={13} />}
                            loading={busyId === request.id}
                            disabled={busyId !== null}
                            onClick={() => setConfirmingId(request.id)}
                          >
                            Approve
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<IconX size={13} />}
                            disabled={busyId !== null}
                            onClick={() => handleDeny(request.id)}
                          >
                            Deny
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CornerFrame>

      {/* ============================================================ */}
      {/* ACCOUNT APPEALS                                             */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="section-label">Account appeals</h3>
          {pendingAppeals > 0 && <Chip variant="warn">{pendingAppeals} pending</Chip>}
        </div>
        <p className="mt-1.5 text-xs leading-5 text-muted">
          Restricted users appeal here. Approving an appeal restores the user&apos;s access immediately; denying it
          keeps the account restricted. Appeals are scoped to your school only.
        </p>
        <div className="mt-4">
          {appealsLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-[10px] border border-base bg-tile" />
              ))}
            </div>
          ) : appealsError ? (
            <p className="rounded-[10px] border border-warn-soft bg-warn-soft px-4 py-3 text-sm text-warn">
              {appealsError}
            </p>
          ) : appeals.length === 0 ? (
            <div className="py-4">
              <EmptyState
                icon={<IconUser size={16} />}
                title="No appeals on record"
                desc="Appeals from restricted users will appear here."
              />
            </div>
          ) : (
            <div className="space-y-2">
              {appeals.map((appeal) => {
                const resolved = appeal.status !== "pending";
                return (
                  <div
                    key={appeal.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-navy">
                        {appeal.user_name ?? "A user"}
                        <span className="font-normal text-muted"> · appealed on {new Date(appeal.created_at).toLocaleDateString()}</span>
                      </p>
                      <p className="mt-1 text-[13px] leading-5 text-muted">{appeal.reason}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {resolved ? (
                        <Chip variant={appeal.status === "approved" ? "success" : "danger"}>
                          {appeal.status}
                        </Chip>
                      ) : (
                        <>
                          <Button
                            variant="accent"
                            size="sm"
                            icon={<IconCheck size={13} />}
                            loading={appealBusyId === appeal.id}
                            disabled={appealBusyId !== null}
                            onClick={() => handleAppeal(appeal.id, true)}
                          >
                            Restore access
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={<IconX size={13} />}
                            disabled={appealBusyId !== null}
                            onClick={() => handleAppeal(appeal.id, false)}
                          >
                            Deny
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {appealActionError && (
          <p className="mt-3 rounded-[10px] border border-warn-soft bg-warn-soft px-4 py-3 text-sm text-warn">
            {appealActionError}
          </p>
        )}
      </CornerFrame>

      {/* ============================================================ */}
      {/* ADMIN OWN ACCOUNT                                            */}
      {/* ============================================================ */}
      <CornerFrame className="p-5">
        <h3 className="section-label">Your account</h3>
        <p className="mt-3 text-xs leading-5 text-muted">
          Account changes for administrators must be handled by the Hierarchy Class developer. Please contact the
          developer for assistance.
        </p>
      </CornerFrame>

      {actionError && (
        <p className="rounded-[10px] border border-warn-soft bg-warn-soft px-4 py-3 text-sm text-warn">{actionError}</p>
      )}
      {actionWarnings && (
        <p className="rounded-[10px] border border-base bg-surface px-4 py-3 text-sm text-muted">{actionWarnings}</p>
      )}

      {confirmingId && (
        <Modal eyebrow="Account deletion" description="Permanent and irreversible" onClose={() => setConfirmingId(null)}>
          <h2 className="mt-3 text-xl font-bold text-navy">Permanently delete this account?</h2>
          <p className="mt-3 text-sm leading-6 text-muted">
            This permanently removes the user&apos;s account and personal data. School-required academic records are
            retained or anonymized. This cannot be undone.
          </p>
          <div className="mt-5 flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmingId(null)} disabled={busyId !== null}>
              Cancel
            </Button>
            <Button variant="danger" className="flex-1" loading={busyId === confirmingId} disabled={busyId !== null} onClick={() => handleApprove(confirmingId)}>
              Delete account permanently
            </Button>
          </div>
        </Modal>
      )}

      <p className="pt-1 text-center font-mono-ui text-[10px] uppercase tracking-[0.2em] text-faint">
        Hierarchy Class · v{APP_VERSION}
      </p>
    </div>
  );
}
