"use client";

import { useState } from "react";
import { useShop, type ShopItem } from "@/lib/shopStore";
import { SHOP_ENABLED, SHOP_DISABLED_MESSAGE } from "@/lib/shopConfig";
import { CoinIcon } from "@/components/ui/CoinIcon";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { PaymentHistory } from "@/components/student/PaymentHistory";
import { InlineLoader } from "@/components/ui/Loading";

function ActionButton({ item, owned, busy, onBuy }: { item: ShopItem; owned: boolean; busy: boolean; onBuy: () => void }) {
  if (!owned) {
    return (
      <button
        type="button"
        onClick={onBuy}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-full bg-navy py-2 text-[13px] font-semibold text-white transition hover-bg-accent-token hover-text-on-accent disabled:opacity-60"
      >
        <CoinIcon size={15} />
        <span>{item.price.toLocaleString()}</span>
        <span className="font-normal opacity-80">Florin</span>
      </button>
    );
  }

  return (
    <span className="flex w-full items-center justify-center gap-1.5 rounded-full border border-line py-2 text-[13px] font-semibold text-muted">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      Owned
    </span>
  );
}

function BackgroundPreview({ item }: { item: ShopItem }) {
  return (
    <div
      className="relative h-28 overflow-hidden rounded-lg border border-base bg-cover bg-center"
      style={{ backgroundImage: `url(${item.image_url})` }}
    >
      {/* Mini translucent card to show how the background looks behind content */}
      <div className="absolute inset-x-3 bottom-3 rounded-md border border-base bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-2 backdrop-blur-[6px]">
        <div className="h-1.5 w-16 rounded-full bg-[var(--text)] opacity-80" />
        <div className="mt-1.5 h-1 w-24 rounded-full bg-[var(--muted)] opacity-60" />
      </div>
    </div>
  );
}

function BorderPreview({ item }: { item: ShopItem }) {
  return (
    <div className="flex h-28 items-center justify-center rounded-lg border border-base bg-tile">
      <UserAvatar
        name="Preview"
        src="/avatars/default-avatar.webp"
        size="xl"
        decorColor={item.accent}
      />
    </div>
  );
}

function ProfileCardPreview({ item }: { item: ShopItem }) {
  return (
    <div
      className="relative h-28 overflow-hidden rounded-lg border border-base bg-cover bg-center"
      style={{ backgroundImage: `url(${item.image_url})` }}
    >
      {/* Mock profile card: avatar + name + rank pill on the card background */}
      <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-md border border-base bg-[color-mix(in_srgb,var(--surface)_60%,transparent)] p-2 backdrop-blur-[6px]">
        <UserAvatar name="Preview" src="/avatars/default-avatar.webp" size="sm" />
        <div className="min-w-0 flex-1">
          <div className="h-1.5 w-20 rounded-full bg-[var(--text)] opacity-80" />
          <div className="mt-1.5 h-1 w-14 rounded-full bg-[var(--muted)] opacity-60" />
        </div>
        <span className="shrink-0 rounded-full border border-accent px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-accent">
          Rank
        </span>
      </div>
    </div>
  );
}

export default function ShopPage() {
  const { items, ownedIds, loading, error, purchase } = useShop();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const backgrounds = items.filter((i) => i.type === "background");
  const borders = items.filter((i) => i.type === "avatar_border");
  const profileCards = items.filter((i) => i.type === "profile_card");

  async function buy(item: ShopItem) {
    setBusyId(item.id);
    setStatus(null);
    const err = await purchase(item);
    if (err) setStatus(err);
    else setStatus(`${item.name} is yours. Equip it from your profile's Wardrobe.`);
    setBusyId(null);
  }

  return (
    <div className="space-y-8">
      {/* Page header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="section-label mb-1">Florin shop</p>
          <h1 className="font-display text-2xl font-bold text-navy">Decorate your profile</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted">
            Spend your Florin on page backgrounds, profile card backgrounds, and avatar borders. Buy here, then
            equip what you own from your profile&apos;s Wardrobe.
          </p>
        </div>
        <p className="text-[11.5px] text-faint">
          Your Florin balance is in the top bar - click it to buy coins.
        </p>
      </header>

      {!SHOP_ENABLED && (
        <div className="flex flex-col items-center gap-3 rounded-[10px] border border-base bg-[var(--surface-strong)] px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent-token">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1.6" />
              <circle cx="19" cy="21" r="1.6" />
              <path d="M2.5 3h2l2.4 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L22 7H5.6" />
            </svg>
          </span>
          <p className="font-display text-lg font-bold text-navy">The shop is coming soon</p>
          <p className="max-w-sm text-[13px] leading-6 text-muted">{SHOP_DISABLED_MESSAGE}</p>
        </div>
      )}

      {SHOP_ENABLED && status && (
        <p className="rounded-lg border border-accent bg-accent/10 px-4 py-2.5 text-[13px] font-medium text-accent">
          {status}
        </p>
      )}

      {SHOP_ENABLED && (loading ? (
        <InlineLoader label="Loading the shop..." />
      ) : error ? (
        <p className="text-sm text-warn">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">The shop is empty right now. Check back soon.</p>
      ) : (
        <>
          {/* Page backgrounds */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-label !mb-0">Page backgrounds</h2>
              <span className="text-[11.5px] text-faint">
                {backgrounds.length} available
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {backgrounds.map((item) => {
                const owned = ownedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 transition hover:border-sealion/60"
                  >
                    <BackgroundPreview item={item} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-navy">{item.name}</p>
                        <p className="mt-0.5 text-[12px] leading-4 text-muted">{item.description}</p>
                      </div>
                      {owned && (
                        <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                          Owned
                        </span>
                      )}
                    </div>
                    <ActionButton
                      item={item}
                      owned={owned}
                      busy={busyId === item.id}
                      onBuy={() => buy(item)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Profile card backgrounds */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-label !mb-0">Profile card backgrounds</h2>
              <span className="text-[11.5px] text-faint">{profileCards.length} available</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {profileCards.map((item) => {
                const owned = ownedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 transition hover:border-sealion/60"
                  >
                    <ProfileCardPreview item={item} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-navy">{item.name}</p>
                        <p className="mt-0.5 text-[12px] leading-4 text-muted">{item.description}</p>
                      </div>
                      {owned && (
                        <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                          Owned
                        </span>
                      )}
                    </div>
                    <ActionButton
                      item={item}
                      owned={owned}
                      busy={busyId === item.id}
                      onBuy={() => buy(item)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* Avatar borders */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-label !mb-0">Avatar borders</h2>
              <span className="text-[11.5px] text-faint">{borders.length} available</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {borders.map((item) => {
                const owned = ownedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-base bg-surface p-4 transition hover:border-sealion/60"
                  >
                    <BorderPreview item={item} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[14px] font-bold text-navy">{item.name}</p>
                        <p className="mt-0.5 text-[12px] leading-4 text-muted">{item.description}</p>
                      </div>
                      {owned && (
                        <span className="mt-0.5 shrink-0 rounded-full border border-line px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-faint">
                          Owned
                        </span>
                      )}
                    </div>
                    <ActionButton
                      item={item}
                      owned={owned}
                      busy={busyId === item.id}
                      onBuy={() => buy(item)}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <p className="text-[11.5px] text-faint">
            Bought an item? Head to your profile - the Wardrobe is where you equip page backgrounds, profile
            cards, and avatar borders.
          </p>
        </>
      ))}

      {SHOP_ENABLED && (
        /* Payment History Section */
        <section className="mt-8 pt-8 border-t border-base">
          <PaymentHistory />
        </section>
      )}

    </div>
  );
}
