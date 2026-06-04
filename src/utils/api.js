import fetch from "node-fetch";

const BASE_AUCTION = "https://api.opsucht.net/auctions";
const BASE_MARKET  = "https://api.opsucht.net/market";
const BASE_MERCH   = "https://api.opsucht.net/merchant";

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// ── Auctions ──────────────────────────────────────────────────────────────────
export const getAuctionCategories = () => get(`${BASE_AUCTION}/categories`);
export const getActiveAuctions    = (category) =>
  get(category ? `${BASE_AUCTION}/active?category=${encodeURIComponent(category)}` : `${BASE_AUCTION}/active`);

// ── Market ────────────────────────────────────────────────────────────────────
export const getMarketCategories = () => get(`${BASE_MARKET}/categories`);
export const getMarketItems      = () => get(`${BASE_MARKET}/items`);
export const getMarketPrices     = () => get(`${BASE_MARKET}/prices`);
export const getItemPrice        = (material) => get(`${BASE_MARKET}/price/${encodeURIComponent(material)}`);
export const getItemHistory      = (material) => get(`${BASE_MARKET}/history/${encodeURIComponent(material)}`);

// ── Merchant ──────────────────────────────────────────────────────────────────
export const getMerchantRates = () => get(`${BASE_MERCH}/rates`);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a number with German thousand separators */
export function fmt(n) {
  if (n == null) return "–";
  return Number(n).toLocaleString("de-DE");
}

/** Convert ISO timestamp to a readable German date string */
export function fmtDate(iso) {
  if (!iso) return "–";
  return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
}

/** Relative time until/since a date */
export function fmtRelative(iso) {
  if (!iso) return "–";
  const diff = new Date(iso) - Date.now();
  const abs  = Math.abs(diff);
  const past = diff < 0;
  const mins = Math.floor(abs / 60000);
  if (mins < 60) return past ? `vor ${mins}m` : `in ${mins}m`;
  const hrs  = Math.floor(mins / 60);
  if (hrs  < 24) return past ? `vor ${hrs}h` : `in ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return past ? `vor ${days}d` : `in ${days}d`;
}

/** Capitalise and clean a Minecraft material name for display */
export function prettyMaterial(material) {
  return material
    .replace(/^minecraft:/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}