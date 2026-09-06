/**
 * Master switch for the Florin Shop.
 *
 * The shop is temporarily CLOSED for the beta (v1.29): purchases depend on
 * the Florin top-up (PayMongo) which is reworked (see lib/paymentsConfig.ts),
 * and the balance economy needs a soak period before real items are sold.
 * While SHOP_ENABLED is false the shop page renders a "coming soon" state
 * and no purchase path is reachable. Equipped items stay equipped - nothing
 * already owned is lost or reset.
 *
 * To re-open, flip SHOP_ENABLED to true.
 */
export const SHOP_ENABLED = false;

export const SHOP_DISABLED_MESSAGE =
  "The shop is coming soon. Items you already own stay equipped in the meantime.";
