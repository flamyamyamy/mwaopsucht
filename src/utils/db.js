/**
 * db.js — SQLite-Datenbank für AH-Item-Tracking
 *
 * Tabellen:
 *   ah_snapshots  – ein Eintrag pro Auktion-Snapshot (Item + Preis + Zeitstempel)
 *   ah_items      – eindeutige Items (displayName + material), für Autocomplete
 *
 * Installation: npm install better-sqlite3
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH   = path.join(__dirname, "..", "..", "data", "ah.db");

// Singleton
let _db = null;

export function getDb() {
  if (_db) return _db;

  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  _db.exec(`
    CREATE TABLE IF NOT EXISTS ah_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      material      TEXT    NOT NULL,
      display_name  TEXT    NOT NULL,
      first_seen    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen     INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE (material, display_name)
    );

    CREATE TABLE IF NOT EXISTS ah_snapshots (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      material      TEXT    NOT NULL,
      display_name  TEXT    NOT NULL,
      amount        INTEGER NOT NULL DEFAULT 1,
      current_bid   REAL,
      instant_buy   REAL,
      bid_count     INTEGER NOT NULL DEFAULT 0,
      end_time      INTEGER,
      auction_uid   TEXT,
      recorded_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_material  ON ah_snapshots (material);
    CREATE INDEX IF NOT EXISTS idx_snapshots_recorded  ON ah_snapshots (recorded_at);
    CREATE INDEX IF NOT EXISTS idx_items_material      ON ah_items (material);
    CREATE INDEX IF NOT EXISTS idx_items_display       ON ah_items (display_name);
  `);

  return _db;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Bulk-insert a list of active auctions into the DB.
 * Called after every /search or on a background refresh.
 */
export function saveAuctions(auctions) {
  const db = getDb();

  const upsertItem = db.prepare(`
    INSERT INTO ah_items (material, display_name, first_seen, last_seen)
    VALUES (@material, @display_name, unixepoch(), unixepoch())
    ON CONFLICT (material, display_name) DO UPDATE SET last_seen = unixepoch()
  `);

  const insertSnap = db.prepare(`
    INSERT INTO ah_snapshots
      (material, display_name, amount, current_bid, instant_buy, bid_count, end_time, auction_uid)
    VALUES
      (@material, @display_name, @amount, @current_bid, @instant_buy, @bid_count, @end_time, @auction_uid)
  `);

  const run = db.transaction((list) => {
    for (const a of list) {
      const material     = (a.item?.material ?? "UNKNOWN").toUpperCase();
      const display_name = a.item?.displayName || material;
      const amount       = a.item?.amount ?? 1;
      const current_bid  = a.currentBid ?? null;
      const instant_buy  = a.instantBuyPrice ?? null;
      const bid_count    = Object.keys(a.bids ?? {}).length;
      const end_time     = a.endTime ? Math.floor(new Date(a.endTime).getTime() / 1000) : null;
      const auction_uid  = a.uid ?? null;

      upsertItem.run({ material, display_name });
      insertSnap.run({ material, display_name, amount, current_bid, instant_buy, bid_count, end_time, auction_uid });
    }
  });

  run(auctions);
  return auctions.length;
}

/**
 * Search items by name (display_name or material) – for autocomplete.
 * Returns up to `limit` distinct (material, display_name) pairs.
 */
export function searchItems(query, limit = 25) {
  const db = getDb();
  const q  = `%${query.toLowerCase()}%`;
  return db.prepare(`
    SELECT DISTINCT material, display_name
    FROM   ah_items
    WHERE  LOWER(display_name) LIKE ? OR LOWER(material) LIKE ?
    ORDER  BY display_name
    LIMIT  ?
  `).all(q, q, limit);
}

/**
 * Get price history for a specific item.
 * Returns rows ordered by time, for the last `days` days.
 */
export function getPriceHistory(displayName, days = 30) {
  const db    = getDb();
  const since = days === 999
    ? 0
    : Math.floor(Date.now() / 1000) - days * 86400;

  return db.prepare(`
    SELECT
      recorded_at,
      current_bid,
      instant_buy,
      amount,
      bid_count
    FROM ah_snapshots
    WHERE LOWER(display_name) LIKE LOWER(?)
      AND recorded_at >= ?
      AND current_bid IS NOT NULL
    ORDER BY recorded_at ASC
  `).all(`%${displayName}%`, since);
}

/**
 * Aggregate stats for an item over the given period.
 */
export function getItemStats(displayName, days = 30) {
  const db    = getDb();
  const since = days === 999
    ? 0
    : Math.floor(Date.now() / 1000) - days * 86400;

  const last = db.prepare(`
    SELECT current_bid, recorded_at
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
      AND  current_bid IS NOT NULL
    ORDER  BY recorded_at DESC
    LIMIT  1
  `).get(`%${displayName}%`);

  const avg7 = db.prepare(`
    SELECT AVG(current_bid) AS val
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
      AND  current_bid IS NOT NULL
      AND  recorded_at >= ?
  `).get(`%${displayName}%`, Math.floor(Date.now() / 1000) - 7 * 86400);

  const avg30 = db.prepare(`
    SELECT AVG(current_bid) AS val
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
      AND  current_bid IS NOT NULL
      AND  recorded_at >= ?
  `).get(`%${displayName}%`, Math.floor(Date.now() / 1000) - 30 * 86400);

  const allTime = db.prepare(`
    SELECT
      AVG(current_bid) AS avg_val,
      MIN(current_bid) AS min_val,
      MAX(current_bid) AS max_val
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
      AND  current_bid IS NOT NULL
  `).get(`%${displayName}%`);

  const countPeriod = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
      AND  recorded_at >= ?
  `).get(`%${displayName}%`, since);

  const totalCount = db.prepare(`
    SELECT COUNT(*) AS cnt
    FROM   ah_snapshots
    WHERE  LOWER(display_name) LIKE LOWER(?)
  `).get(`%${displayName}%`);

  // Marktwert = Ø der letzten 10 Verkäufe
  const marketVal = db.prepare(`
    SELECT AVG(current_bid) AS val
    FROM (
      SELECT current_bid
      FROM   ah_snapshots
      WHERE  LOWER(display_name) LIKE LOWER(?)
        AND  current_bid IS NOT NULL
      ORDER  BY recorded_at DESC
      LIMIT  10
    )
  `).get(`%${displayName}%`);

  return {
    lastPrice:    last?.current_bid    ?? null,
    lastSeen:     last?.recorded_at    ?? null,
    marketValue:  marketVal?.val       ?? null,
    avg7d:        avg7?.val            ?? null,
    avg30d:       avg30?.val           ?? null,
    avgAllTime:   allTime?.avg_val     ?? null,
    minPrice:     allTime?.min_val     ?? null,
    maxPrice:     allTime?.max_val     ?? null,
    periodCount:  countPeriod?.cnt     ?? 0,
    totalCount:   totalCount?.cnt      ?? 0,
    days,
  };
}

/**
 * Count all tracked items in DB.
 */
export function countItems() {
  const db = getDb();
  return db.prepare("SELECT COUNT(DISTINCT display_name) AS cnt FROM ah_items").get()?.cnt ?? 0;
}

/**
 * Count all snapshots in DB.
 */
export function countSnapshots() {
  const db = getDb();
  return db.prepare("SELECT COUNT(*) AS cnt FROM ah_snapshots").get()?.cnt ?? 0;
}

/**
 * Delete snapshots older than `days` days. Useful for cleanup.
 */
export function pruneOldSnapshots(days = 90) {
  const db    = getDb();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  const result = db.prepare(
    "DELETE FROM ah_snapshots WHERE recorded_at < ?"
  ).run(since);
  return result.changes;
}