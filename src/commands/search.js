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
  getCandleHistory,
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
  const stats = getItemStats(query, days);
  const history = getCandleHistory(query, days);

  // ── 3) Item-Icon URL ─────────────────────────────────────────────────────
  const itemIcon = itemMaterial ? getItemIconUrl(itemMaterial) : null;

  // ── 4) Chart generieren ──────────────────────────────────────────────────
  let chartAttachment = null;
  if (history.length >= 2) {
    try {
      const buf   = renderChart(query, history, stats, liveAuctions);
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
    const newHistory = getCandleHistory(query, newDays);

    let newAttachment = null;
    if (newHistory.length >= 2) {
      try {
        const buf    = renderChart(query, newHistory, newStats, liveAuctions);
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

// ── Professional Canvas Chart (TradingView + Live Data) ─────────────────────────

function renderChart(title, history, stats, liveAuctions) {
  const W = 1000, H = 500;
  const PAD = { top: 70, right: 60, bottom: 90, left: 80 };

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // ── BACKGROUND & GRADIENT ──────────────────────────────────────────────
  ctx.fillStyle = "#0a0e27";
  ctx.fillRect(0, 0, W, H);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(20, 30, 60, 0.3)");
  grad.addColorStop(1, "rgba(10, 14, 39, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const candles = history.slice(-50);

  const max = Math.max(...candles.map(c => c.high));
  const min = Math.min(...candles.map(c => c.low));
  const range = max - min || 1;

  const xStep = chartW / candles.length;
  const candleW = Math.max(2, xStep * 0.65);

  const x = (i) => PAD.left + i * xStep + xStep / 2;
  const y = (v) => PAD.top + (1 - (v - min) / range) * chartH;

  // ── PROFESSIONAL GRID ──────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
  ctx.lineWidth = 1;

  // Horizontal grid with labels
  for (let i = 0; i <= 5; i++) {
    const yy = PAD.top + (i / 5) * chartH;
    const price = max - (i / 5) * range;

    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(PAD.left + chartW, yy);
    ctx.stroke();

    // Price labels on right
    ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
    ctx.font = "11px 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(fmt(Math.round(price)), PAD.left + chartW + 10, yy + 4);
  }

  // Vertical grid lines (lighter)
  ctx.strokeStyle = "rgba(148, 163, 184, 0.03)";
  for (let i = 0; i <= 10; i++) {
    const xx = PAD.left + (i / 10) * chartW;
    ctx.beginPath();
    ctx.moveTo(xx, PAD.top);
    ctx.lineTo(xx, PAD.top + chartH);
    ctx.stroke();
  }

  // ── AXIS LINES ─────────────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(148, 163, 184, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // ── MOVING AVERAGES (OPTIONAL) ─────────────────────────────────────────
  // Draw subtle trend line from first to last
  if (candles.length >= 2) {
    const firstY = y(candles[0].close);
    const lastY = y(candles[candles.length - 1].close);

    ctx.strokeStyle = "rgba(100, 116, 139, 0.2)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(x(0), firstY);
    ctx.lineTo(x(candles.length - 1), lastY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── CANDLES (HIGH QUALITY) ─────────────────────────────────────────────
  candles.forEach((c, i) => {
    const cx = x(i);

    const openY = y(c.open);
    const closeY = y(c.close);
    const highY = y(c.high);
    const lowY = y(c.low);

    const up = c.close >= c.open;

    const color = up ? "#10b981" : "#ef4444";
    const wickColor = up ? "rgba(16, 185, 129, 0.7)" : "rgba(239, 68, 68, 0.7)";

    // Wick (thin, transparent)
    ctx.strokeStyle = wickColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();

    // Body (solid)
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(1.5, Math.abs(closeY - openY));

    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(cx - candleW / 2, bodyTop, candleW, bodyH);
    ctx.globalAlpha = 1;

    // Optional: Border for better definition
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.strokeRect(cx - candleW / 2, bodyTop, candleW, bodyH);
  });

  // ── LIVE DATA INDICATOR ────────────────────────────────────────────────
  if (liveAuctions.length > 0) {
    const currentPrice = liveAuctions[0]?.currentBid || stats.lastPrice;
    if (currentPrice != null) {
      const liveY = y(currentPrice);

      // Horizontal line across chart
      ctx.strokeStyle = "rgba(59, 130, 246, 0.25)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(PAD.left, liveY);
      ctx.lineTo(PAD.left + chartW, liveY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Live label on left
      ctx.fillStyle = "#3b82f6";
      ctx.font = "bold 12px 'Segoe UI', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText("● LIVE: " + fmt(currentPrice) + "$", PAD.left - 10, liveY + 5);
    }
  }

  // ── LAST CANDLE HIGHLIGHT ──────────────────────────────────────────────
  const last = candles[candles.length - 1];
  const lx = x(candles.length - 1);
  const ly = y(last.close);

  // Outer glow
  ctx.fillStyle = "rgba(250, 204, 21, 0.2)";
  ctx.beginPath();
  ctx.arc(lx, ly, 14, 0, Math.PI * 2);
  ctx.fill();

  // Inner glow
  ctx.fillStyle = "rgba(250, 204, 21, 0.4)";
  ctx.beginPath();
  ctx.arc(lx, ly, 8, 0, Math.PI * 2);
  ctx.fill();

  // Solid dot
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(lx, ly, 4, 0, Math.PI * 2);
  ctx.fill();

  // ── TITLE & INFO ───────────────────────────────────────────────────────
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 22px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`📊 ${title}`, PAD.left, 30);

  // Stats badge
  const change = stats.lastPrice != null && stats.avg7d != null 
    ? ((stats.lastPrice - stats.avg7d) / stats.avg7d * 100).toFixed(1)
    : 0;
  const changeColor = change >= 0 ? "#10b981" : "#ef4444";
  const changeStr = change >= 0 ? `↑ +${change}%` : `↓ ${change}%`;

  ctx.fillStyle = changeColor;
  ctx.font = "bold 14px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(changeStr, W - PAD.right, 30);

  // ── BOTTOM STATS ───────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(148, 163, 184, 0.8)";
  ctx.font = "11px 'Segoe UI', sans-serif";
  ctx.textAlign = "left";

  const statsText = `High: ${fmt(max)}$ | Low: ${fmt(min)}$ | Avg: ${fmt((max + min) / 2)}$ | Range: ${candles.length} candles`;
  ctx.fillText(statsText, PAD.left, H - 10);

  // ── TIME RANGE LABEL ───────────────────────────────────────────────────
  ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
  ctx.font = "10px 'Segoe UI', sans-serif";
  ctx.textAlign = "right";
  const now = new Date();
  ctx.fillText(`Updated: ${now.toLocaleTimeString()}`, W - PAD.right, H - 10);

  return canvas.toBuffer("image/png");
}

// ── Container Builder ──────────────────────────────────────────────────────────

function buildContainer(query, days, stats, liveAuctions, fetchError, hasChart, itemIcon) {
  const container   = new ContainerBuilder();
  const reliability = getReliability(stats.totalCount);
  const lines       = [];

  if (stats.lastPrice != null)
    lines.push(`<:minecoins:1512068363864768602> **Marktwert:** ${fmt(stats.lastPrice)}$`);
  if (stats.lastPrice != null)
    lines.push(`<:Emerad:1512068393061318728> **Letzter Preis:** ${fmt(stats.lastPrice)}$`);
  if (stats.avg7d != null)
    lines.push(`<a:Clock:1512068072075427841> **Ø 7 Tage:** ${fmt(stats.avg7d)}$`);
  if (stats.avg30d != null)
    lines.push(`<a:Clock:1512068072075427841> **Ø 30 Tage:** ${fmt(stats.avg30d)}$`);
  if (stats.avgAllTime != null) {
    const minMax = (stats.minPrice != null && stats.maxPrice != null)
      ? `  *(Min: ${fmt(stats.minPrice)}$ — Max: ${fmt(stats.maxPrice)}$)*`
      : "";
    lines.push(`<:Arrow:1512067924117159947> **Langzeit-Ø:** ${fmt(stats.avgAllTime)}$${minMax}`);
  }
  lines.push(
    `<:Book:1512074541638226021> **Datensätze:** ${stats.periodCount} (${days === 999 ? "Alle" : `${days} Tage`}) — **${stats.totalCount} gesamt**`
  );
  lines.push(`<:Name_Tag:1512068432123456789> **Verlässlichkeit:** ${reliability.label}`);

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
