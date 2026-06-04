import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} from "discord.js";
import { createCanvas } from "@napi-rs/canvas";
import { getActiveAuctions, fmt, fmtRelative } from "../utils/api.js";
import {
  saveAuctions,
  searchItems,
  getItemStats,
  getPriceHistory,
  countItems,
  countSnapshots,
} from "../utils/db.js";

// ── Slash-Command Definition (v2 Components) ──────────────────────────────────

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Sucht ein Item im AH – mit Preisverlauf & Marktstatistiken aus der DB")
  .addStringOption((opt) =>
    opt
      .setName("item")
      .setDescription("Itemname (z.B. Rollator, Diamant, Schwert...)")
      .setRequired(true)
      .setAutocomplete(true)
  )
  .addIntegerOption((opt) =>
    opt
      .setName("tage")
      .setDescription("Analysezeitraum in Tagen (Standard: 30)")
      .setRequired(false)
      .addChoices(
        { name: "7 Tage",  value: 7   },
        { name: "30 Tage", value: 30  },
        { name: "90 Tage", value: 90  },
        { name: "Alle",    value: 999 }
      )
  );

// ── Autocomplete (aus DB) ─────────────────────────────────────────────────────

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused();
  try {
    const results = searchItems(focused, 25);
    await interaction.respond(
      results.map((r) => ({ name: r.display_name, value: r.display_name }))
    );
  } catch (err) {
    console.error("[search] autocomplete error:", err);
    await interaction.respond([]);
  }
}

// ── Execute ───────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString("item");
  const days  = interaction.options.getInteger("tage") ?? 30;

  // ── 1) Live AH-Daten holen & in DB speichern ─────────────────────────────
  let liveAuctions = [];
  let fetchError   = false;
  let itemMaterial = null;

  try {
    const all         = await getActiveAuctions();
    const auctionList = Array.isArray(all) ? all : (all?.auctions ?? all?.data ?? []);
    liveAuctions = auctionList.filter((a) => {
      const name = (a.item?.displayName || a.item?.material || "").toLowerCase();
      return name.includes(query.toLowerCase());
    });
    if (liveAuctions.length > 0) {
      itemMaterial = liveAuctions[0]?.item?.material;
    }
    if (auctionList.length > 0) saveAuctions(auctionList);
  } catch (err) {
    console.error("[search] AH fetch error:", err);
    fetchError = true;
  }

  // ── 2) DB-Statistiken ─────────────────────────────────────────────────────
  const stats   = getItemStats(query, days);
  const history = getPriceHistory(query, days);

  // ── 3) Item-Icon URL ─────────────────────────────────────────────────────
  const itemIconUrl = itemMaterial ? getItemIconUrl(itemMaterial) : null;

  // ── 4) Chart generieren ───────────────────────────────────────────────────
  let chartAttachment = null;
  if (history.length >= 2) {
    try {
      const chartBuffer  = renderChart(query, history);
      chartAttachment    = new AttachmentBuilder(chartBuffer, { name: "preisverlauf.png" });
    } catch (err) {
      console.error("[search] chart render error:", err);
    }
  }

  // ── 5) Embed bauen & senden (v2 Components) ───────────────────────────────
  const embed     = buildEmbed(query, days, stats, history, liveAuctions, fetchError, !!chartAttachment, itemIconUrl);
  const actionRow = buildActionRow(query, days);

  const replyOptions = {
    embeds: [embed],
    components: [actionRow],
  };
  if (chartAttachment) replyOptions.files = [chartAttachment];

  const reply = await interaction.editReply(replyOptions);

  // ── 6) Select-Menu Collector (3 min) ──────────────────────────────────────
  const collector = reply.createMessageComponentCollector({
    filter: (i) =>
      i.user.id === interaction.user.id &&
      i.customId.startsWith("search_period:"),
    time: 180_000,
  });

  collector.on("collect", async (i) => {
    const newDays = parseInt(i.values[0], 10);
    await i.deferUpdate();

    const newStats   = getItemStats(query, newDays);
    const newHistory = getPriceHistory(query, newDays);

    let newAttachment = null;
    if (newHistory.length >= 2) {
      try {
        const buf    = renderChart(query, newHistory);
        newAttachment = new AttachmentBuilder(buf, { name: "preisverlauf.png" });
      } catch (err) {
        console.error("[search] chart re-render error:", err);
      }
    }

    const newEmbed   = buildEmbed(query, newDays, newStats, newHistory, liveAuctions, fetchError, !!newAttachment, itemIconUrl);
    const updateOpts = {
      embeds: [newEmbed],
      components: [buildActionRow(query, newDays)],
    };
    if (newAttachment) updateOpts.files = [newAttachment];
    else               updateOpts.files = [];

    await i.editReply(updateOpts);
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}

// ── Canvas Chart ──────────────────────────────────────────────────────────────

/**
 * Rendert einen Preisverlauf-Chart.
 * Dunkler Hintergrund, orangene Linie mit Punkten, Grid, Datum auf X-Achse.
 * Gibt einen PNG-Buffer zurück.
 */
function renderChart(title, history) {
  const W = 800, H = 400;
  const PAD = { top: 50, right: 30, bottom: 60, left: 90 };

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // ── Hintergrund ───────────────────────────────────────────────────────────
  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, W, H);

  // ── Daten vorbereiten ─────────────────────────────────────────────────────
  // Maximal 60 Punkte (gleichmäßig samplen)
  const sampled = sampleArray(history, 60);
  const prices  = sampled.map((h) => h.current_bid ?? 0);
  const times   = sampled.map((h) => h.recorded_at * 1000); // ms

  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const minT = times[0];
  const maxT = times[times.length - 1];

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  // Hilfsfunktionen: Wert → Pixel
  const xPx = (t) => PAD.left + ((t - minT) / (maxT - minT || 1)) * chartW;
  const yPx = (p) => PAD.top  + (1 - (p - minP) / (maxP - minP || 1)) * chartH;

  // ── Grid ──────────────────────────────────────────────────────────────────
  const gridLines = 5;
  ctx.strokeStyle = "#2e3035";
  ctx.lineWidth   = 1;
  ctx.setLineDash([4, 4]);

  for (let i = 0; i <= gridLines; i++) {
    const y = PAD.top + (i / gridLines) * chartH;
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + chartW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // ── Y-Achsen-Beschriftung ─────────────────────────────────────────────────
  ctx.fillStyle  = "#9a9a9a";
  ctx.font       = "12px sans-serif";
  ctx.textAlign  = "right";
  ctx.textBaseline = "middle";

  for (let i = 0; i <= gridLines; i++) {
    const val = maxP - (i / gridLines) * (maxP - minP);
    const y   = PAD.top + (i / gridLines) * chartH;
    ctx.fillText(fmtShort(val) + " $", PAD.left - 8, y);
  }

  // ── X-Achsen-Beschriftung (Datum) ─────────────────────────────────────────
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  const xTicks = Math.min(8, sampled.length);
  for (let i = 0; i < xTicks; i++) {
    const idx  = Math.round((i / (xTicks - 1)) * (sampled.length - 1));
    const x    = xPx(times[idx]);
    const date = new Date(times[idx]).toLocaleDateString("de-DE", {
      day: "2-digit", month: "2-digit",
    });
    ctx.fillStyle = "#9a9a9a";
    ctx.fillText(date, x, H - PAD.bottom + 8);
  }

  // ── X-Achsen-Label ────────────────────────────────────────────────────────
  ctx.fillStyle    = "#cccccc";
  ctx.font         = "13px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Datum", W / 2, H - 4);

  // ── Y-Achsen-Label ────────────────────────────────────────────────────────
  ctx.save();
  ctx.translate(14, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Preis ($)", 0, 0);
  ctx.restore();

  // ── Titel ─────────────────────────────────────────────────────────────────
  ctx.fillStyle    = "#ffffff";
  ctx.font         = "bold 15px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Preisverlauf", W / 2, 14);

  // ── Achsen-Linien ─────────────────────────────────────────────────────────
  ctx.strokeStyle = "#555";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // ── Gradient unter der Linie ──────────────────────────────────────────────
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
  grad.addColorStop(0,   "rgba(230, 184, 0, 0.25)");
  grad.addColorStop(1,   "rgba(230, 184, 0, 0.00)");

  ctx.beginPath();
  ctx.moveTo(xPx(times[0]), yPx(prices[0]));
  for (let i = 1; i < sampled.length; i++) {
    ctx.lineTo(xPx(times[i]), yPx(prices[i]));
  }
  ctx.lineTo(xPx(times[times.length - 1]), PAD.top + chartH);
  ctx.lineTo(xPx(times[0]),                PAD.top + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Linie ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#e6b800";
  ctx.lineWidth   = 2;
  ctx.lineJoin    = "round";
  ctx.beginPath();
  ctx.moveTo(xPx(times[0]), yPx(prices[0]));
  for (let i = 1; i < sampled.length; i++) {
    ctx.lineTo(xPx(times[i]), yPx(prices[i]));
  }
  ctx.stroke();

  // ── Punkte ────────────────────────────────────────────────────────────────
  ctx.fillStyle = "#e6b800";
  for (let i = 0; i < sampled.length; i++) {
    ctx.beginPath();
    ctx.arc(xPx(times[i]), yPx(prices[i]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Legende ───────────────────────────────────────────────────────────────
  const legendX = W - PAD.right - 140;
  const legendY = PAD.top + 10;
  ctx.strokeStyle = "#e6b800";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(legendX, legendY + 6);
  ctx.lineTo(legendX + 20, legendY + 6);
  ctx.stroke();
  ctx.fillStyle = "#e6b800";
  ctx.beginPath();
  ctx.arc(legendX + 10, legendY + 6, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle    = "#cccccc";
  ctx.font         = "12px sans-serif";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Verkaufspreis ($)", legendX + 26, legendY + 6);

  return canvas.toBuffer("image/png");
}

// ── Embed (v2) mit Item-Icon oben rechts ──────────────────────────────────────

function buildEmbed(query, days, stats, history, liveAuctions, fetchError, hasChart, itemIconUrl) {
  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle(`🛒 ${query}`)
    .setTimestamp();

  // ── Thumbnail (Item-Icon oben rechts) ─────────────────────────────────────
  if (itemIconUrl) {
    embed.setThumbnail(itemIconUrl);
  }

  if (hasChart) embed.setImage("attachment://preisverlauf.png");

  const reliability = getReliability(stats.totalCount);
  const lines       = [];

  if (stats.marketValue != null)
    lines.push(`⭐ **Marktwert:** ${fmt(stats.marketValue)}$`);
  if (stats.lastPrice != null)
    lines.push(`🔴 **Letzter Preis:** ${fmt(stats.lastPrice)}$`);
  if (stats.avg7d != null)
    lines.push(`🟪 **Ø 7 Tage:** ${fmt(stats.avg7d)}$`);
  if (stats.avg30d != null)
    lines.push(`🟪 **Ø 30 Tage:** ${fmt(stats.avg30d)}$`);
  if (stats.avgAllTime != null) {
    const minMax = (stats.minPrice != null && stats.maxPrice != null)
      ? `  *(Min: ${fmt(stats.minPrice)}$ — Max: ${fmt(stats.maxPrice)}$)*`
      : "";
    lines.push(`🔷 **Langzeit-Ø:** ${fmt(stats.avgAllTime)}$${minMax}`);
  }

  lines.push(
    `ℹ️ **Datensätze:** ${stats.periodCount} (${days === 999 ? "Alle" : `${days} Tage`}) — **${stats.totalCount} gesamt**`
  );
  lines.push(`🔒 **Verlässlichkeit:** ${reliability.label}`);

  embed.setDescription(
    lines.length > 0
      ? lines.join("\n")
      : "⚠️ Noch keine Daten in der DB für dieses Item.\n" +
        "Daten werden gesammelt, sobald das Item im AH erscheint."
  );

  // ── Live-Auktionen ────────────────────────────────────────────────────────
  if (liveAuctions.length > 0) {
    const sorted    = [...liveAuctions]
      .sort((a, b) => (a.currentBid ?? 0) - (b.currentBid ?? 0))
      .slice(0, 5);

    const liveLines = sorted.map((a) => {
      const name     = a.item?.displayName || a.item?.material || "?";
      const amount   = a.item?.amount ?? 1;
      const bid      = fmt(a.currentBid);
      const buynow   = a.instantBuyPrice ? `  •  ⚡ ${fmt(a.instantBuyPrice)}$` : "";
      const endsIn   = fmtRelative(a.endTime);
      const bidCount = Object.keys(a.bids ?? {}).length;
      return `\`${amount > 1 ? `${amount}x ` : ""}${name}\`  💰 **${bid}$**${buynow}  ⏱ ${endsIn}  (${bidCount} Gebote)`;
    });

    embed.addFields({
      name: `🏪 Aktive Auktionen (${liveAuctions.length} gefunden, günstigste 5)`,
      value: liveLines.join("\n"),
      inline: false,
    });
  } else if (fetchError) {
    embed.addFields({
      name: "⚠️ Live-Daten nicht verfügbar",
      value: "API konnte nicht erreicht werden. Zeige nur DB-Daten.",
      inline: false,
    });
  } else {
    embed.addFields({
      name: "🏪 Aktive Auktionen",
      value: "Aktuell keine aktiven Auktionen für dieses Item.",
      inline: false,
    });
  }

  embed.setFooter({
    text: `🗃️ DB: ${countItems()} Items • ${countSnapshots()} Snapshots  •  Zeitraum: ${days === 999 ? "Alle Daten" : `${days} Tage`}  •  OPSUCHT AH`,
  });

  return embed;
}

/**
 * Erstellt Action Row mit StringSelectMenu (v2 Components).
 * CustomId: search_period:<itemname>
 */
function buildActionRow(query, days) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`search_period:${query}`)
      .setPlaceholder(days === 999 ? "Alle Daten" : `${days} Tage`)
      .addOptions([
        { label: "7 Tage",  value: "7",   description: "Statistik der letzten 7 Tage",  default: days === 7   },
        { label: "30 Tage", value: "30",  description: "Statistik der letzten 30 Tage", default: days === 30  },
        { label: "90 Tage", value: "90",  description: "Statistik der letzten 90 Tage", default: days === 90  },
        { label: "Alle",    value: "999", description: "Alle gespeicherten Daten",       default: days === 999 },
      ])
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────────

/**
 * Erstellt eine URL zum Minecraft Item-Icon basierend auf Material.
 * Nutzt Minecraft Head Render Service.
 */
function getItemIconUrl(material) {
  if (!material) return null;
  
  // Normalisiere material name (z.B. "DIAMOND" → "diamond")
  const normalized = material.toLowerCase().replace(/minecraft:/, "");
  
  // Minecraft Render Service für Items
  return `https://api.crafthead.net/v1/item/minecraft:${normalized}?format=png&size=64`;
}

/** Gleichmäßiges Downsampling eines Arrays auf maximal `n` Einträge */
function sampleArray(arr, n) {
  if (arr.length <= n) return arr;
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.round((i / (n - 1)) * (arr.length - 1))]);
  }
  return result;
}

/** Kompakte Zahl-Formatierung für Y-Achse: 1.000.000 → 1M, 340000 → 340K */
function fmtShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
  return String(Math.round(n));
}

/** Verlässlichkeit basierend auf Datenmenge */
function getReliability(count) {
  if (count >= 50) return { label: "✅ Verlässlich",          score: 3 };
  if (count >= 15) return { label: "🟡 Eingeschränkt",        score: 2 };
  if (count >= 3)  return { label: "🟠 Wenig Daten",          score: 1 };
  return             { label: "🔴 Unzureichend (< 3 Daten)", score: 0 };
}
