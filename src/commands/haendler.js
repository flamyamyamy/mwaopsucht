import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getMerchantRates, fmt } from "../utils/api.js";

function cleanSource(source) {
  // Strip full Minecraft NBT strings down to a readable name
  if (source.startsWith("minecraft:")) {
    // Try to extract custom_name text
    const match = source.match(/"text":\s*"([^"]+)"/);
    if (match) return match[1];
    // Otherwise use the material part
    const mat = source.split("[")[0].replace("minecraft:", "");
    return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const data = new SlashCommandBuilder()
  .setName("haendler")
  .setDescription("Zeigt die aktuellen Händler-Wechselkurse (Items → OPShards)");

export async function execute(interaction) {
  await interaction.deferReply();

  const rates = await getMerchantRates();

  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("💱 Händler Wechselkurse")
    .setDescription("Aktuelle Kurse für den Tausch von Items gegen OPShards:")
    .setTimestamp();

  for (const r of rates) {
    const sourceName = cleanSource(r.source);
    const base       = fmt(r.base);
    const current    = fmt(r.exchangeRate);
    const diff       = r.exchangeRate - r.base;
    const trend      = diff > 0 ? `🟢 +${fmt(diff)}` : diff < 0 ? `🔴 ${fmt(diff)}` : "⚪ ±0";

    embed.addFields({
      name: sourceName,
      value: `Basis: **${base}** Shards\nAktuell: **${current}** Shards  ${trend}`,
      inline: true,
    });
  }

  if (!rates.length) {
    embed.setDescription("Keine Wechselkurse verfügbar.");
  }

  embed.setFooter({ text: "Quelle: api.opsucht.net/merchant/rates" });

  await interaction.editReply({ embeds: [embed] });
}