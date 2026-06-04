import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getActiveAuctions, fmt, fmtRelative } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("auktion-suche")
  .setDescription("Sucht Auktionen nach Itemname und sortiert nach Preis")
  .addStringOption((opt) =>
    opt
      .setName("name")
      .setDescription("Itemname (z.B. Runenbrecher, Flammentalisman)")
      .setRequired(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("sortierung")
      .setDescription("Sortierung (Standard: günstigste zuerst)")
      .setRequired(false)
      .addChoices(
        { name: "Günstigste zuerst", value: "asc"  },
        { name: "Teuerste zuerst",   value: "desc" },
        { name: "Endet bald",        value: "soon" },
        { name: "Meiste Gebote",     value: "bids" }
      )
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString("name").toLowerCase();
  const sort  = interaction.options.getString("sortierung") ?? "asc";

  const all = await getActiveAuctions();

  let results = all.filter((a) => {
    const name = (a.item?.displayName || a.item?.material || "").toLowerCase();
    return name.includes(query);
  });

  if (results.length === 0) {
    return interaction.editReply(`❌ Keine aktiven Auktionen für **${query}** gefunden.`);
  }

  switch (sort) {
    case "desc": results.sort((a, b) => b.currentBid - a.currentBid); break;
    case "soon": results.sort((a, b) => new Date(a.endTime) - new Date(b.endTime)); break;
    case "bids": results.sort((a, b) => Object.keys(b.bids ?? {}).length - Object.keys(a.bids ?? {}).length); break;
    default:     results.sort((a, b) => a.currentBid - b.currentBid);
  }

  results = results.slice(0, 10);

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle(`🔍 Auktionen für „${query}"`)
    .setFooter({ text: `${results.length} Ergebnisse gezeigt` })
    .setTimestamp();

  for (const a of results) {
    const name   = a.item?.displayName || a.item?.material || "Unbekannt";
    const amount = a.item?.amount ?? 1;
    const bidCount = Object.keys(a.bids ?? {}).length;
    const buyNow   = a.instantBuyPrice ? ` | Sofortkauf: **${fmt(a.instantBuyPrice)}** 💰` : "";

    embed.addFields({
      name: `${amount > 1 ? `${amount}x ` : ""}${name}`,
      value:
        `Gebot: **${fmt(a.currentBid)}** 💰${buyNow}\n` +
        `Gebote: ${bidCount} • Endet ${fmtRelative(a.endTime)}\n` +
        `UID: \`${a.uid}\``,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}