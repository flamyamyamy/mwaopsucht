import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getItemHistory, getMarketItems, fmt, prettyMaterial } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("markt-verlauf")
  .setDescription("Zeigt den Preisverlauf eines Items im Markt")
  .addStringOption((opt) =>
    opt
      .setName("material")
      .setDescription("Material-Name (z.B. DIAMOND)")
      .setRequired(true)
      .setAutocomplete(true)
  );

export { autocomplete } from "./markt-preis.js";

export async function execute(interaction) {
  await interaction.deferReply();

  const material = interaction.options.getString("material").toUpperCase();

  let history;
  try {
    history = await getItemHistory(material);
  } catch {
    return interaction.editReply(`❌ Kein Preisverlauf für \`${material}\` gefunden.`);
  }

  const entries = Array.isArray(history) ? history : [];

  if (entries.length === 0) {
    return interaction.editReply(`ℹ️ Kein Preisverlauf für \`${material}\` verfügbar.`);
  }

  // Build ASCII-ish bar chart (last 10 entries)
  const last = entries.slice(-10);
  const prices = last.map((h) => h.avgPrice ?? h.price ?? h.buyPrice ?? 0);
  const maxP   = Math.max(...prices);
  const minP   = Math.min(...prices);

  const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

  const chart = last
    .map((h) => {
      const p    = h.avgPrice ?? h.price ?? h.buyPrice ?? 0;
      const date = h.date ? new Date(h.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "??";
      const norm = maxP === minP ? 1 : (p - minP) / (maxP - minP);
      const bar  = BARS[Math.round(norm * (BARS.length - 1))];
      return `${bar} ${date}  ${fmt(p)} 💰`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`📊 Preisverlauf: ${prettyMaterial(material)}`)
    .setDescription(`\`\`\`\n${chart}\n\`\`\``)
    .addFields(
      { name: "Minimum",  value: `${fmt(minP)} 💰`, inline: true },
      { name: "Maximum",  value: `${fmt(maxP)} 💰`, inline: true },
      { name: "Einträge", value: `${entries.length}`, inline: true }
    )
    .setFooter({ text: `Material: ${material}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}