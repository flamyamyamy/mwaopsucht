import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";
import { getMarketItems, getItemPrice, getItemHistory, fmt, prettyMaterial } from "../utils/api.js";

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

function parseOrders(material, raw) {
  const entries = raw?.[material] ?? raw?.[material.toLowerCase()];
  if (Array.isArray(entries)) {
    const buy  = entries.find((e) => e.orderSide === "BUY");
    const sell = entries.find((e) => e.orderSide === "SELL");
    return { buy, sell, isNewFormat: true };
  }
  const flat = Array.isArray(raw) ? raw[0] : raw;
  return { flat, isNewFormat: false };
}

function itemIconUrl(material) {
  const name = material.toLowerCase().replace(/^minecraft:/, "");
  return `https://img.mc-api.io/${name}.png`;
}

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

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

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# 📈 Marktpreis: ${displayName}`)
  );

  if (isNewFormat) {
    const buyPrice   = buy?.price;
    const sellPrice  = sell?.price;
    const buyOrders  = buy?.activeOrders;
    const sellOrders = sell?.activeOrders;

    const spread = (buyPrice != null && sellPrice != null)
      ? Math.abs(buyPrice - sellPrice).toFixed(2)
      : null;

    container.addSeparatorComponents(new SeparatorBuilder());

    const descLines = [];
    if (buyPrice  != null) descLines.push(`<:minecoin:1512068363864768602> **Kaufpreis:** \`${fmt(buyPrice)}$\` *(${buyOrders ?? "?"} Aufträge)*`);
    if (sellPrice != null) descLines.push(`<:Redstone:1512068332122017822> **Verkaufspreis:** \`${fmt(sellPrice)}$\` *(${sellOrders ?? "?"} Aufträge)*`);
    if (spread    != null) descLines.push(`<:Arrow:1512067924117159947> **Spread:** \`${spread}$\``);

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(descLines.join("\n"))
    );

    const fieldLines = [];
    if (buyPrice  != null) fieldLines.push(`**<:minecoin:1512068363864768602> Kaufpreis**\n${fmt(buyPrice)}$`);
    if (sellPrice != null) fieldLines.push(`**<:Redstone:1512068332122017822> Verkaufspreis**\n${fmt(sellPrice)}$`);
    if (spread    != null) fieldLines.push(`**<:Arrow:1512067924117159947> Spread**\n${spread}$`);
    if (buyOrders  != null) fieldLines.push(`**<a:chest:1512077870481145939> Kauf-Aufträge**\n${fmt(buyOrders)}`);
    if (sellOrders != null) fieldLines.push(`**<a:chest:1512077870481145939> Verkauf-Aufträge**\n${fmt(sellOrders)}`);

    if (fieldLines.length > 0) {
      container.addSeparatorComponents(new SeparatorBuilder());
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(fieldLines.join("\n\n"))
      );
    }
  } else if (flat) {
    container.addSeparatorComponents(new SeparatorBuilder());

    const flatLines = [];
    if (flat.buyPrice  != null) flatLines.push(`**<:minecoins:1512068363864768602> Kaufpreis**\n${fmt(flat.buyPrice)}$`);
    if (flat.sellPrice != null) flatLines.push(`**<:Redstone:1512068332122017822> Verkaufspreis**\n${fmt(flat.sellPrice)}$`);
    if (flat.avgPrice  != null) flatLines.push(`**<:Arrow:1512067924117159947> Ø Preis**\n${fmt(flat.avgPrice)}$`);
    if (flat.minPrice  != null) flatLines.push(`**<:Chart_Decrease:1512068424994570240> Minimum**\n${fmt(flat.minPrice)}$`);
    if (flat.maxPrice  != null) flatLines.push(`**<:Chart_Increase:1512068453287570432> Maximum**\n${fmt(flat.maxPrice)}$`);
    if (flat.volume    != null) flatLines.push(`**<:BarChart:1512068481580570624> Volumen**\n${fmt(flat.volume)}`);

    if (flatLines.length > 0) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(flatLines.join("\n\n"))
      );
    } else {
      const raw = JSON.stringify(flat, null, 2).slice(0, 1000);
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`\`\`\`json\n${raw}\n\`\`\``)
      );
    }
  }

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

    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**📊 Preisverlauf (letzte 7 Tage)**\n${histText}`)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Material: ${material} • OPSUCHT Markt`)
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
