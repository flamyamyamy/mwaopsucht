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

  // Parse price data – API returns array or object depending on endpoint
  const prices = Array.isArray(priceData) ? priceData : [priceData];
  const current = prices[0] ?? priceData;

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📈 Marktpreis: ${prettyMaterial(material)}`)
    .setTimestamp();

  // Current price fields
  if (current.buyPrice  != null) embed.addFields({ name: "Kaufpreis",     value: `${fmt(current.buyPrice)} 💰`,  inline: true });
  if (current.sellPrice != null) embed.addFields({ name: "Verkaufspreis", value: `${fmt(current.sellPrice)} 💰`, inline: true });
  if (current.avgPrice  != null) embed.addFields({ name: "Ø Preis",       value: `${fmt(current.avgPrice)} 💰`,  inline: true });
  if (current.minPrice  != null) embed.addFields({ name: "Minimum",       value: `${fmt(current.minPrice)} 💰`,  inline: true });
  if (current.maxPrice  != null) embed.addFields({ name: "Maximum",       value: `${fmt(current.maxPrice)} 💰`,  inline: true });
  if (current.volume    != null) embed.addFields({ name: "Volumen",       value: fmt(current.volume),            inline: true });

  // Raw fallback if none of the above matched
  if (!embed.data.fields?.length) {
    const raw = JSON.stringify(current, null, 2).slice(0, 1000);
    embed.setDescription(`\`\`\`json\n${raw}\n\`\`\``);
  }

  // History (last 5 entries)
  const hist = Array.isArray(historyData) ? historyData.slice(-5) : [];
  if (hist.length > 0) {
    const histText = hist
      .map((h) => {
        const date = h.date ? new Date(h.date).toLocaleDateString("de-DE") : "–";
        const price = h.avgPrice ?? h.price ?? "–";
        return `${date}: **${fmt(price)}** 💰`;
      })
      .join("\n");
    embed.addFields({ name: "📊 Preisverlauf (letzte 5)", value: histText, inline: false });
  }

  embed.setFooter({ text: `Material: ${material}` });

  await interaction.editReply({ embeds: [embed] });
}