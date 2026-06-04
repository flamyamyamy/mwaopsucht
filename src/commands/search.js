import {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  MessageFlags,
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

// ── Slash-Command Definition ───────────────────────────────────────────────────

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

// ── Autocomplete (aus DB) ──────────────────────────────────────────────────────

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

// ── Execute ────────────────────────────────────────────────────────────────────

export async function execute(interaction) {
  // IsComponentsV2 Flag für Container-Support
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

  const query = interaction.options.getString("item");
  const days  = interaction.options.getInteger("tage") ?? 30;

  // ── 1) Live AH-Daten holen & in DB speichern ────────────────────────────
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

  // ── 2) DB-Statistiken ────────────────────────────────────────────────────
  const stats   = getItemStats(query, days);
  const history = getPriceHistory(query, days);

  // ── 3) Item-Icon URL ─────────────────────────────────────────────────────
  const itemIcon = itemMaterial ? getItemIconUrl(itemMaterial) : null;

  // ── 4) Chart generieren ──────────────────────────────────────────────────
  let chartAttachment = null;
  if (history.length >= 2) {
    try {
      const buf   = renderChart(query, history);
      // AttachmentBuilder wie in der alten Version – das ist der Fix für die Chart-Anzeige
      chartAttachment = new AttachmentBuilder(buf, { name: "preisverlauf.png" });
    } catch (err) {
      console.error("[search] chart render error:", err);
    }
  }

  // ── 5) Container + ActionRow bauen & senden ──────────────────────────────
  const container = buildContainer(query, days, stats, liveAuctions, fetchError, !!chartAttachment, itemIcon);
  const actionRow = buildActionRow(query, days);

  const replyOptions = {
    components: [container, actionRow],
    flags: MessageFlags.IsComponentsV2,
  };
  if (chartAttachment) replyOptions.files = [chartAttachment];

  const reply = await interaction.editReply(replyOptions);

  // ── 6) Select-Menu Collector (3 min) ─────────────────────────────────────
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

    const newContainer = buildContainer(query, newDays, newStats, liveAuctions, fetchError, !!newAttachment, itemIcon);
    const updateOpts   = {
      components: [newContainer, buildActionRow(query, newDays)],
      flags: MessageFlags.IsComponentsV2,
    };
    if (newAttachment) updateOpts.files = [newAttachment];
    else               updateOpts.files = [];

    await i.editReply(updateOpts);
  });

  collector.on("end", () => {
    // Dropdown deaktivieren wenn Collector abläuft
    const disabledRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`search_period:${query}`)
        .setPlaceholder(days === 999 ? "Alle Daten" : `${days} Tage`)
        .setDisabled(true)
        .addOptions([
          { label: "7 Tage",  value: "7"   },
          { label: "30 Tage", value: "30"  },
          { label: "90 Tage", value: "90"  },
          { label: "Alle",    value: "999" },
        ])
    );
    interaction.editReply({ components: [disabledRow], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });
}

// ── Canvas Chart ───────────────────────────────────────────────────────────────

function renderChart(title, history) {
  const W = 800, H = 400;
  const PAD = { top: 50, right: 30, bottom: 60, left: 90 };

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // Hintergrund
  ctx.fillStyle = "#1e1f22";
  ctx.fillRect(0, 0, W, H);

  // Daten vorbereiten – max. 60 Punkte
  const sampled = sampleArray(history, 60);
  const prices  = sampled.map((h) => h.current_bid ?? 0);
  const times   = sampled.map((h) => h.recorded_at * 1000);

  // Intelligente Min/Max (IQR Outlier-Filter)
  const sorted = [...prices].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lowerBound = Math.max(0, q1 - 1.5 * iqr);
  const upperBound = q3 + 1.5 * iqr;

  let minP = upperBound, maxP = lowerBound;
  for (const p of prices) {
    if (p >= lowerBound && p <= upperBound) {
      minP = Math.min(minP, p);
      maxP = Math.max(maxP, p);
    }
  }
  if (minP >= maxP) { minP = Math.min(...prices); maxP = Math.max(...prices); }

  const range = maxP - minP || 1;
  minP = Math.max(0, minP - range * 0.1);
  maxP = maxP + range * 0.1;

  const minT  = times[0];
  const maxT  = times[times.length - 1];
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top  - PAD.bottom;

  const xPx = (t) => PAD.left + ((t - minT) / (maxT - minT || 1)) * chartW;
  const yPx = (p) => {
    const clamped = Math.max(minP, Math.min(maxP, p));
    return PAD.top + (1 - (clamped - minP) / (maxP - minP)) * chartH;
  };

  // Grid
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

  // Y-Achse
  ctx.fillStyle    = "#9a9a9a";
  ctx.font         = "12px sans-serif";
  ctx.textAlign    = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= gridLines; i++) {
    const val = maxP - (i / gridLines) * (maxP - minP);
    ctx.fillText(fmtShort(val) + " $", PAD.left - 8, PAD.top + (i / gridLines) * chartH);
  }

  // X-Achse Datum
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle    = "#9a9a9a";
  ctx.font         = "11px sans-serif";
  const xTicks = Math.min(6, sampled.length);
  for (let i = 0; i < xTicks; i++) {
    const idx  = Math.round((i / Math.max(1, xTicks - 1)) * (sampled.length - 1));
    const x    = xPx(times[idx]);
    const date = new Date(times[idx]);
    ctx.fillText(`${date.getDate()}.${String(date.getMonth() + 1).padStart(2, "0")}`, x, H - PAD.bottom + 12);
  }

  // Achsenbeschriftungen
  ctx.fillStyle    = "#cccccc";
  ctx.font         = "13px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Datum", W / 2, H - 4);
  ctx.save();
  ctx.translate(14, H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Preis ($)", 0, 0);
  ctx.restore();

  // Titel
  ctx.fillStyle    = "#ffffff";
  ctx.font         = "bold 15px sans-serif";
  ctx.textAlign    = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Preisverlauf", W / 2, 14);

  // Achsenlinien
  ctx.strokeStyle = "#555";
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // Gradient unter Linie
  const grad = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + chartH);
  grad.addColorStop(0, "rgba(230, 184, 0, 0.25)");
  grad.addColorStop(1, "rgba(230, 184, 0, 0.00)");
  ctx.beginPath();
  ctx.moveTo(xPx(times[0]), yPx(prices[0]));
  for (let i = 1; i < sampled.length; i++) ctx.lineTo(xPx(times[i]), yPx(prices[i]));
  ctx.lineTo(xPx(times[times.length - 1]), PAD.top + chartH);
  ctx.lineTo(xPx(times[0]),                PAD.top + chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Linie
  ctx.strokeStyle = "#e6b800";
  ctx.lineWidth   = 2.5;
  ctx.lineJoin    = "round";
  ctx.lineCap     = "round";
  ctx.beginPath();
  ctx.moveTo(xPx(times[0]), yPx(prices[0]));
  for (let i = 1; i < sampled.length; i++) ctx.lineTo(xPx(times[i]), yPx(prices[i]));
  ctx.stroke();

  // Punkte
  ctx.fillStyle = "#e6b800";
  for (let i = 0; i < sampled.length; i++) {
    ctx.beginPath();
    ctx.arc(xPx(times[i]), yPx(prices[i]), 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Legende
  const legendX = W - PAD.right - 150;
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

// ── Container Builder ──────────────────────────────────────────────────────────

function buildContainer(query, days, stats, liveAuctions, fetchError, hasChart, itemIcon) {
  const container   = new ContainerBuilder();
  const reliability = getReliability(stats.totalCount);
  const lines       = [];

  if (stats.marketValue != null)
    lines.push(`<:minecoin:1045876432123456789> **Marktwert:** ${fmt(stats.marketValue)}$`);
  if (stats.lastPrice != null)
    lines.push(`<:Emerad:1045876432123456789> **Letzter Preis:** ${fmt(stats.lastPrice)}$`);
  if (stats.avg7d != null)
    lines.push(`<a:Clock:1045876432123456789> **Ø 7 Tage:** ${fmt(stats.avg7d)}$`);
  if (stats.avg30d != null)
    lines.push(`<a:Clock:1045876432123456789> **Ø 30 Tage:** ${fmt(stats.avg30d)}$`);
  if (stats.avgAllTime != null) {
    const minMax = (stats.minPrice != null && stats.maxPrice != null)
      ? `  *(Min: ${fmt(stats.minPrice)}$ — Max: ${fmt(stats.maxPrice)}$)*`
      : "";
    lines.push(`<:Arrow:1045876432123456789> **Langzeit-Ø:** ${fmt(stats.avgAllTime)}$${minMax}`);
  }
  lines.push(
    `<:Book:1045876432123456789> **Datensätze:** ${stats.periodCount} (${days === 999 ? "Alle" : `${days} Tage`}) — **${stats.totalCount} gesamt**`
  );
  lines.push(`<:Name_Tag:1045876432123456789> **Verlässlichkeit:** ${reliability.label}`);

  const statsContent = lines.length > 0
    ? `# 🛒 ${query}\n\n${lines.join("\n")}`
    : `# 🛒 ${query}\n\n⚠️ Noch keine Daten in der DB für dieses Item.\nDaten werden gesammelt, sobald das Item im AH erscheint.`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statsContent)
  );

  // ── Chart ────────────────────────────────────────────────────────────────
  // MediaGallery ist der korrekte Weg um Bilder in Containern anzuzeigen
  if (hasChart) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("## 📊 Preisverlauf")
    );
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL("attachment://preisverlauf.png")
      )
    );
  }

  // ── Live Auktionen ────────────────────────────────────────────────────────
  container.addSeparatorComponents(new SeparatorBuilder());

  if (liveAuctions.length > 0) {
    const sorted = [...liveAuctions]
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

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `🏪 **Aktive Auktionen** (${liveAuctions.length} gefunden, günstigste 5)\n\n${liveLines.join("\n")}`
      )
    );
  } else if (fetchError) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "⚠️ **Live-Daten nicht verfügbar**\nAPI konnte nicht erreicht werden. Zeige nur DB-Daten."
      )
    );
  } else {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "🏪 **Aktive Auktionen**\nAktuell keine aktiven Auktionen für dieses Item."
      )
    );
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `-# 🗃️ DB: ${countItems()} Items • ${countSnapshots()} Snapshots  •  Zeitraum: ${days === 999 ? "Alle Daten" : `${days} Tage`}  •  OPSUCHT AH`
    )
  );

  return container;
}

// ── Action Row (Dropdown) ──────────────────────────────────────────────────────

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

// ── Utils ──────────────────────────────────────────────────────────────────────

function getItemIconUrl(material) {
  if (!material) return null;
  const normalized = material.toLowerCase().replace(/^minecraft:/, "").replace(/ /g, "_");
  return `https://img.mc-api.io/${normalized}.png`;
}

function sampleArray(arr, n) {
  if (arr.length <= n) return arr;
  const result = [];
  for (let i = 0; i < n; i++) {
    result.push(arr[Math.round((i / (n - 1)) * (arr.length - 1))]);
  }
  return result;
}

function fmtShort(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
  return String(Math.round(n));
}

function getReliability(count) {
  if (count >= 50) return { label: "✅ Verlässlich",          score: 3 };
  if (count >= 15) return { label: "🟡 Eingeschränkt",        score: 2 };
  if (count >= 3)  return { label: "🟠 Wenig Daten",          score: 1 };
  return             { label: "🔴 Unzureichend (< 3 Daten)", score: 0 };
}