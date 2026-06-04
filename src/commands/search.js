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
    const newHistory = getCandleHistory(query, newDays);

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

// ── Canvas Chart (TradingView Style) ───────────────────────────────────────────

function renderChart(title, history) {
  const W = 900, H = 450;

  const PAD = { top: 50, right: 40, bottom: 70, left: 90 };

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, W, H);

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const candles = history.slice(-40);

  const max = Math.max(...candles.map(c => c.high));
  const min = Math.min(...candles.map(c => c.low));
  const range = max - min || 1;

  const xStep = chartW / candles.length;
  const candleW = Math.max(3, xStep * 0.6); // 60% of slot width

  const x = (i) => PAD.left + i * xStep;// center candle in slot

  const y = (v) =>
    PAD.top + (1 - (v - min) / range) * chartH;

  // ── GRID (TradingView Style) ──────────────────────────────────────────
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  // Horizontal grid lines
  for (let i = 0; i <= 6; i++) {
    const yy = PAD.top + (i / 6) * chartH;

    ctx.beginPath();
    ctx.moveTo(PAD.left, yy);
    ctx.lineTo(PAD.left + chartW, yy);
    ctx.stroke();
  }

  // Vertical grid lines
  for (let i = 0; i <= 8; i++) {
    const xx = PAD.left + (i / 8) * chartW;

    ctx.beginPath();
    ctx.moveTo(xx, PAD.top);
    ctx.lineTo(xx, PAD.top + chartH);
    ctx.stroke();
  }

  // ── AXIS ──────────────────────────────────────────────────────────────
  ctx.strokeStyle = "#374151";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + chartH);
  ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
  ctx.stroke();

  // ── CANDLES ───────────────────────────────────────────────────────────
  candles.forEach((c, i) => {
    const cx = x(i);

    const openY = y(c.open);
    const closeY = y(c.close);
    const highY = y(c.high);
    const lowY = y(c.low);

    const up = c.close >= c.open;

    // Wick (thin line)
    ctx.strokeStyle = up ? "#22c55e" : "#ef4444";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(cx, highY);
    ctx.lineTo(cx, lowY);
    ctx.stroke();

    // Body
    const bodyTop = Math.min(openY, closeY);
    const bodyH = Math.max(1, Math.abs(closeY - openY));

    ctx.fillStyle = up ? "#22c55e" : "#ef4444";

    ctx.fillRect(
      cx - candleW / 2,
      bodyTop,
      candleW,
      bodyH
    );
  });

  // ── TITLE ─────────────────────────────────────────────────────────────
  ctx.fillStyle = "#fff";
  ctx.font = "bold 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${title} (Market Candles)`, W / 2, 25);

  // ── LAST PRICE INDICATOR ──────────────────────────────────────────────
  const last = candles.at(-1);
  if (!last) return canvas.toBuffer("image/png");
  const lx = x(candles.length - 1);
  const ly = y(last.close);

  // Glow effect (subtle highlight)
  ctx.fillStyle = "rgba(250, 204, 21, 0.15)";
  ctx.beginPath();
  ctx.arc(lx, ly, 12, 0, Math.PI * 2);
  ctx.fill();

  // Solid dot for last close
  ctx.fillStyle = "#facc15";
  ctx.beginPath();
  ctx.arc(lx, ly, 5, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toBuffer("image/png");
}

// ── Container Builder ──────────────────────────────────────────────────────────

function buildContainer(query, days, stats, liveAuctions, fetchError, hasChart, itemIcon) {
  const container   = new ContainerBuilder();
  const reliability = getReliability(stats.totalCount);
  const lines       = [];

  if (stats.marketValue != null)
    lines.push(`<:minecoins:1512068363864768602> **Marktwert:** ${fmt(stats.marketValue)}$`);
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
