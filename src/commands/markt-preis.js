import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import {
  getMarketItems,
  getItemPrice,
  getItemHistory,
  fmt,
  prettyMaterial,
} from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("markt-preis")
  .setDescription("Zeigt den aktuellen Marktpreis eines Items an")
  .addStringOption((opt) =>
    opt
      .setName("material")
      .setDescription("Material-Name (z.B. DIAMOND, OAK_LOG)")
      .setRequired(true)
      .setAutocomplete(true)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toUpperCase();
  try {
    const items = await getMarketItems();
    const choices = (Array.isArray(items) ? items : [])
      .filter((i) => (i.material ?? i).toUpperCase().includes(focused))
      .slice(0, 25)
      .map((i) => {
        const mat = i.material ?? i;
        return { name: prettyMaterial(mat), value: mat };
      });
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

/**
 * Parse the API response format:
 * { "AMETHYST_SHARD": [ { orderSide: "BUY", activeOrders: 266, price: 3.9 }, ... ] }
 * Returns { buy, sell } or falls back to legacy field names.
 */
function parseOrders(material, raw) {
  // New format: object keyed by material
  const entries = raw?.[material] ?? raw?.[material.toLowerCase()];
  if (Array.isArray(entries)) {
    const buy  = entries.find((e) => e.orderSide === "BUY");
    const sell = entries.find((e) => e.orderSide === "SELL");
    return { buy, sell, isNewFormat: true };
  }

  // Legacy flat format
  const flat = Array.isArray(raw) ? raw[0] : raw;
  return { flat, isNewFormat: false };
}

/**
 * Returns a URL to the Minecraft item icon via mc-heads or a fallback CDN.
 * Using minecraft-ids.grahamedgecombe.com image assets as fallback.
 */
function itemIconUrl(material) {
  // Normalize: AMETHYST_SHARD -> amethyst_shard
  const name = material.toLowerCase().replace(/^minecraft:/, "");
  return `https://mc-heads.net/head/${encodeURIComponent(name)}/64`;
}

export async function execute(interaction) {
  await interaction.deferReply();

  const material = interaction.options.getString("material").toUpperCase();

  let priceData, historyData;
  try {
    priceData = await getItemPrice(material);
  } catch {
    return interaction.editReply(`❌ Kein Marktpreis für \`${material}\` gefunden.`);
  }

  try {
    historyData = await getItemHistory(material);
  } catch {
    historyData = [];
  }

  const { buy, sell, flat, isNewFormat } = parseOrders(material, priceData);
  const displayName = prettyMaterial(material);

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📈 Marktpreis: ${displayName}`)
    .setThumbnail(itemIconUrl(material))
    .setTimestamp();

  if (isNewFormat) {
    // ── New orderSide format ──────────────────────────────────────────────────
    const buyPrice   = buy?.price;
    const sellPrice  = sell?.price;
    const buyOrders  = buy?.activeOrders;
    const sellOrders = sell?.activeOrders;

    // Spread / margin
    const spread = (buyPrice != null && sellPrice != null)
      ? Math.abs(buyPrice - sellPrice).toFixed(2)
      : null;

    // Description: visual price comparison
    const descLines = [];
    if (buyPrice  != null) descLines.push(`🟢 **Kaufpreis:**  \`${fmt(buyPrice)}$\`  *(${buyOrders ?? "?"} Aufträge)*`);
    if (sellPrice != null) descLines.push(`🔴 **Verkaufspreis:** \`${fmt(sellPrice)}$\`  *(${sellOrders ?? "?"} Aufträge)*`);
    if (spread    != null) descLines.push(`↔️ **Spread:** \`${spread}$\``);

    embed.setDescription(descLines.join("\n"));

    // Fields: quick stats inline
    if (buyPrice  != null) embed.addFields({ name: "💚 Kaufpreis",       value: `**${fmt(buyPrice)}$**`,   inline: true });
    if (sellPrice != null) embed.addFields({ name: "❤️ Verkaufspreis",   value: `**${fmt(sellPrice)}$**`,  inline: true });
    if (spread    != null) embed.addFields({ name: "↔️ Spread",          value: `**${spread}$**`,          inline: true });
    if (buyOrders  != null) embed.addFields({ name: "📦 Kauf-Aufträge",  value: `${fmt(buyOrders)}`,       inline: true });
    if (sellOrders != null) embed.addFields({ name: "📦 Verkauf-Aufträge", value: `${fmt(sellOrders)}`,    inline: true });

  } else if (flat) {
    // ── Legacy flat format ────────────────────────────────────────────────────
    if (flat.buyPrice  != null) embed.addFields({ name: "💚 Kaufpreis",      value: `${fmt(flat.buyPrice)}$`,  inline: true });
    if (flat.sellPrice != null) embed.addFields({ name: "❤️ Verkaufspreis",  value: `${fmt(flat.sellPrice)}$`, inline: true });
    if (flat.avgPrice  != null) embed.addFields({ name: "Ø Preis",           value: `${fmt(flat.avgPrice)}$`,  inline: true });
    if (flat.minPrice  != null) embed.addFields({ name: "📉 Minimum",        value: `${fmt(flat.minPrice)}$`,  inline: true });
    if (flat.maxPrice  != null) embed.addFields({ name: "📈 Maximum",        value: `${fmt(flat.maxPrice)}$`,  inline: true });
    if (flat.volume    != null) embed.addFields({ name: "📊 Volumen",        value: fmt(flat.volume),          inline: true });

    if (!embed.data.fields?.length) {
      const raw = JSON.stringify(flat, null, 2).slice(0, 1000);
      embed.setDescription(`\`\`\`json\n${raw}\n\`\`\``);
    }
  }

  // ── Price history (last 7 entries) ─────────────────────────────────────────
  const hist = Array.isArray(historyData) ? historyData.slice(-7) : [];
  if (hist.length > 0) {
    const prices = hist.map((h) => h.avgPrice ?? h.price ?? h.sellPrice ?? 0);
    const maxP   = Math.max(...prices);
    const minP   = Math.min(...prices);
    const BARS   = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

    const histText = hist
      .map((h) => {
        const p    = h.avgPrice ?? h.price ?? h.sellPrice ?? 0;
        const date = h.date
          ? new Date(h.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })
          : "??";
        const norm = maxP === minP ? 1 : (p - minP) / (maxP - minP);
        const bar  = BARS[Math.round(norm * (BARS.length - 1))];
        return `${bar} ${date}  **${fmt(p)}$**`;
      })
      .join("\n");

    embed.addFields({ name: "📊 Preisverlauf (letzte 7 Tage)", value: histText, inline: false });
  }

  embed.setFooter({ text: `Material: ${material}  •  OPSUCHT Markt` });

  await interaction.editReply({ embeds: [embed] });
}