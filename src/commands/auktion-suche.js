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
  asc:  "<:minecoin:1512068363864768602> Günstigste zuerst",
  desc: "<:Emerald:1512068393061318728> Teuerste zuerst",
  soon: "<a:Clock:1512068072075427841> Endet bald",
  bids: "<:Fire_Charge:1512068044271386694> Meiste Gebote",
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
      .setTitle("<:Spyglass:1512068258956574751> Keine Ergebnisse")
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
    .setTitle(`<:Spyglass:1512068258956574751> Suchergebnisse: „${query}"`)
    .setDescription(
      `> <:Book:1512074541638226021> **${total}** Auktionen gefunden  •  Sortierung: ${SORT_LABELS[sort]}\n` +
      `> <:Stick:1512068203163943072> Min: **${fmt(minBid)}$**  •  <:Blaze_Rod:1512068287239032842> Max: **${fmt(maxBid)}$**  •  Ø **${fmt(avgBid)}$**` +
      (withBuyNow > 0 ? `  •  <:Bundle:1512068142564904992> ${withBuyNow}x Sofortkauf` : "")
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
      `💰 Gebot: **${fmt(a.currentBid)}$**` + (a.instantBuyPrice ? `  •  <:Bundle:1512068142564904992> Sofortkauf: **${fmt(a.instantBuyPrice)}$**` : ""),
      `${hasBids ? "<:Fire_Charge:1512068044271386694>" : "⏳"} Gebote: **${bidCount}**  •  <a:Clock:1512068072075427841> Endet: **${endsIn}**`,
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
