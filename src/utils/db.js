/**
 * db.js — SQLite-Datenbank für AH-Item-Tracking (CLEAN VERSION)
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "..", "data", "ah.db");

// ─────────────────────────────────────────────
// Singleton DB
// ─────────────────────────────────────────────

let _db = null;

export function getDb() {
  if (_db) return _db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ah_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      material      TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      first_seen    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen     INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(material, display_name)
    );

    CREATE TABLE IF NOT EXISTS ah_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      material      TEXT NOT NULL,
      display_name  TEXT NOT NULL,
      amount        INTEGER DEFAULT 1,
      current_bid   REAL,
      instant_buy   REAL,
      bid_count     INTEGER DEFAULT 0,
      end_time      INTEGER,
      auction_uid   TEXT,
      recorded_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_name ON ah_snapshots(display_name);
    CREATE INDEX IF NOT EXISTS idx_snapshots_time ON ah_snapshots(recorded_at);
  `);

  return _db;
}

// ─────────────────────────────────────────────
// SAVE AUCTIONS
// ─────────────────────────────────────────────

export function saveAuctions(auctions) {
  const db = getDb();

  const upsertItem = db.prepare(`
    INSERT INTO ah_items (material, display_name, first_seen, last_seen)
    VALUES (@material, @display_name, unixepoch(), unixepoch())
    ON CONFLICT(material, display_name)
    DO UPDATE SET last_seen = unixepoch()
  `);

  const insertSnap = db.prepare(`
    INSERT INTO ah_snapshots
      (material, display_name, amount, current_bid, instant_buy, bid_count, end_time, auction_uid, recorded_at)
    VALUES
      (@material, @display_name, @amount, @current_bid, @instant_buy, @bid_count, @end_time, @auction_uid, unixepoch())
  `);

  const tx = db.transaction((list) => {
    for (const a of list) {
      const material = (a.item?.material ?? "unknown").toLowerCase();
      const display_name = a.item?.displayName ?? material;

      upsertItem.run({ material, display_name });

      insertSnap.run({
        material,
        display_name,
        amount: a.item?.amount ?? 1,
        current_bid: a.currentBid ?? null,
        instant_buy: a.instantBuyPrice ?? null,
        bid_count: Object.keys(a.bids ?? {}).length,
        end_time: a.endTime ? Math.floor(new Date(a.endTime).getTime() / 1000) : null,
        auction_uid: a.uid ?? null,
      });
    }
  });

  tx(auctions);
}

// ─────────────────────────────────────────────
// SEARCH ITEMS
// ─────────────────────────────────────────────

export function searchItems(query, limit = 25) {
  const db = getDb();
  const q = `%${query.toLowerCase()}%`;

  return db.prepare(`
    SELECT DISTINCT material, display_name
    FROM ah_items
    WHERE LOWER(display_name) LIKE ? OR LOWER(material) LIKE ?
    ORDER BY display_name
    LIMIT ?
  `).all(q, q, limit);
}

// ─────────────────────────────────────────────
// PRICE HISTORY
// ─────────────────────────────────────────────

export function getPriceHistory(name, days = 30) {
  const db = getDb();

  const since =
    days === 999
      ? 0
      : Math.floor(Date.now() / 1000) - days * 86400;

  return db.prepare(`
    SELECT recorded_at, current_bid
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
      AND recorded_at >= ?
      AND current_bid IS NOT NULL
    ORDER BY recorded_at ASC
  `).all(`%${name}%`, since);
}

// ─────────────────────────────────────────────
// CANDLE HISTORY (FIXED + CLEAN)
// ─────────────────────────────────────────────

export function getCandleHistory(name, days = 30) {
  const raw = getPriceHistory(name, days);

  const buckets = new Map();

  // group by hour
  for (const r of raw) {
    const t = Math.floor(r.recorded_at / 3600) * 3600;

    if (!buckets.has(t)) buckets.set(t, []);

    buckets.get(t).push({
      price: r.current_bid,
      time: r.recorded_at,
    });
  }

  return [...buckets.entries()]
    .map(([time, values]) => {
      const sorted = values
        .filter(v => v.price != null)
        .sort((a, b) => a.time - b.time);

      const prices = sorted.map(v => v.price);

      if (!prices.length) return null;

      return {
        time,
        open: prices[0],
        close: prices[prices.length - 1],
        low: Math.min(...prices),
        high: Math.max(...prices),
        avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────

export function getItemStats(name, days = 30) {
  const db = getDb();

  const since =
    days === 999
      ? 0
      : Math.floor(Date.now() / 1000) - days * 86400;

  const last = db.prepare(`
    SELECT current_bid, recorded_at
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
    ORDER BY recorded_at DESC
    LIMIT 1
  `).get(`%${name}%`);

  const avg7 = db.prepare(`
    SELECT AVG(current_bid) val
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
      AND recorded_at >= ?
  `).get(`%${name}%`, Math.floor(Date.now() / 1000) - 7 * 86400);

  const avg30 = db.prepare(`
    SELECT AVG(current_bid) val
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
      AND recorded_at >= ?
  `).get(`%${name}%`, Math.floor(Date.now() / 1000) - 30 * 86400);

  const allTime = db.prepare(`
    SELECT
      AVG(current_bid) avg,
      MIN(current_bid) min,
      MAX(current_bid) max
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
  `).get(`%${name}%`);

  const countPeriod = db.prepare(`
    SELECT COUNT(*) cnt
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
      AND recorded_at >= ?
  `).get(`%${name}%`, since);

  const totalCount = db.prepare(`
    SELECT COUNT(*) cnt
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
  `).get(`%${name}%`);

  return {
    lastPrice: last?.current_bid ?? null,
    lastSeen: last?.recorded_at ?? null,
    avg7d: avg7?.val ?? null,
    avg30d: avg30?.val ?? null,
    avgAllTime: allTime?.avg ?? null,
    minPrice: allTime?.min ?? null,
    maxPrice: allTime?.max ?? null,
    periodCount: countPeriod?.cnt ?? 0,
    totalCount: totalCount?.cnt ?? 0,
    days,
  };
}

// ─────────────────────────────────────────────
// COUNTERS
// ─────────────────────────────────────────────

export function countItems() {
  return getDb()
    .prepare("SELECT COUNT(*) cnt FROM ah_items")
    .get()?.cnt ?? 0;
}

export function countSnapshots() {
  return getDb()
    .prepare("SELECT COUNT(*) cnt FROM ah_snapshots")
    .get()?.cnt ?? 0;
}