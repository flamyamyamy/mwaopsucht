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

const SORT_LABELS = {
  asc:  "💰 Günstigste zuerst",
  desc: "💎 Teuerste zuerst",
  soon: "⏰ Endet bald",
  bids: "🔥 Meiste Gebote",
};

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
    const embed = new EmbedBuilder()
      .setColor(0xff4757)
      .setTitle("🔍 Keine Ergebnisse")
      .setDescription(`Für **${query}** wurden keine aktiven Auktionen gefunden.`)
      .setFooter({ text: "OPSUCHT Auktionshaus" })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  switch (sort) {
    case "desc": results.sort((a, b) => b.currentBid - a.currentBid); break;
    case "soon": results.sort((a, b) => new Date(a.endTime) - new Date(b.endTime)); break;
    case "bids": results.sort((a, b) => Object.keys(b.bids ?? {}).length - Object.keys(a.bids ?? {}).length); break;
    default:     results.sort((a, b) => a.currentBid - b.currentBid);
  }

  const total   = results.length;
  results       = results.slice(0, 8);

  // Stats
  const minBid   = Math.min(...results.map((a) => a.currentBid));
  const maxBid   = Math.max(...results.map((a) => a.currentBid));
  const avgBid   = Math.round(results.reduce((s, a) => s + a.currentBid, 0) / results.length);
  const withBuyNow = results.filter((a) => a.instantBuyPrice).length;

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle(`🔍 Suchergebnisse: „${query}"`)
    .setDescription(
      `> 📊 **${total}** Auktionen gefunden  •  Sortierung: ${SORT_LABELS[sort]}\n` +
      `> 📉 Min: **${fmt(minBid)}$**  •  📈 Max: **${fmt(maxBid)}$**  •  Ø **${fmt(avgBid)}$**` +
      (withBuyNow > 0 ? `  •  🛒 ${withBuyNow}x Sofortkauf` : "")
    )
    .setFooter({ text: `OPSUCHT Auktionshaus • ${results.length} von ${total} gezeigt` })
    .setTimestamp();

  for (const a of results) {
    const name     = a.item?.displayName || a.item?.material || "Unbekannt";
    const amount   = a.item?.amount ?? 1;
    const bidCount = Object.keys(a.bids ?? {}).length;
    const hasBids  = bidCount > 0;
    const endsIn   = fmtRelative(a.endTime);

    const lines = [
      `💰 Gebot: **${fmt(a.currentBid)}$**` + (a.instantBuyPrice ? `  •  🛒 Sofortkauf: **${fmt(a.instantBuyPrice)}$**` : ""),
      `${hasBids ? "🔥" : "⏳"} Gebote: **${bidCount}**  •  ⏱️ Endet: **${endsIn}**`,
      `🆔 \`${a.uid}\``,
    ];

    embed.addFields({
      name: `${amount > 1 ? `${amount}x ` : ""}${name}`,
      value: lines.join("\n"),
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}
