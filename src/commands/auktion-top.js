import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getActiveAuctions, fmt, fmtRelative } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("auktion-top")
  .setDescription("Zeigt die heißesten/teuersten aktiven Auktionen")
  .addStringOption((opt) =>
    opt
      .setName("nach")
      .setDescription("Sortierung")
      .setRequired(false)
      .addChoices(
        { name: "Höchster Preis",   value: "price"    },
        { name: "Meiste Gebote",    value: "bids"     },
        { name: "Endet bald",       value: "soon"     },
        { name: "Sofortkauf-Deals", value: "buynow"   }
      )
  )
  .addStringOption((opt) =>
    opt
      .setName("kategorie")
      .setDescription("Nur aus bestimmter Kategorie")
      .setRequired(false)
      .setAutocomplete(true)
  );

export { autocomplete } from "./auktionen.js";

export async function execute(interaction) {
  await interaction.deferReply();

  const sortBy   = interaction.options.getString("nach") ?? "price";
  const category = interaction.options.getString("kategorie") ?? null;

  let auctions = await getActiveAuctions(category);

  switch (sortBy) {
    case "bids":   auctions.sort((a, b) => Object.keys(b.bids ?? {}).length - Object.keys(a.bids ?? {}).length); break;
    case "soon":   auctions.sort((a, b) => new Date(a.endTime) - new Date(b.endTime)); break;
    case "buynow": auctions = auctions
        .filter((a) => a.instantBuyPrice)
        .sort((a, b) => a.instantBuyPrice - b.instantBuyPrice);
      break;
    default:       auctions.sort((a, b) => b.currentBid - a.currentBid);
  }

  const top = auctions.slice(0, 10);

  const labels = {
    price:  "💰 Top 10 – Höchster Preis",
    bids:   "🔥 Top 10 – Meiste Gebote",
    soon:   "⏳ Top 10 – Endet bald",
    buynow: "🛒 Top 10 – Günstigste Sofortkäufe",
  };

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle(labels[sortBy] ?? "🏷️ Top Auktionen")
    .setFooter({ text: `${auctions.length} Auktionen durchsucht` })
    .setTimestamp();

  if (top.length === 0) {
    embed.setDescription("Keine Auktionen gefunden.");
  }

  for (const [i, a] of top.entries()) {
    const name     = a.item?.displayName || a.item?.material || "Unbekannt";
    const amount   = a.item?.amount ?? 1;
    const bidCount = Object.keys(a.bids ?? {}).length;
    const extra    = sortBy === "bids" ? ` • ${bidCount} Gebote` : "";
    const buyNow   = a.instantBuyPrice ? ` | SK: **${fmt(a.instantBuyPrice)}** 💰` : "";

    embed.addFields({
      name: `${i + 1}. ${amount > 1 ? `${amount}x ` : ""}${name}`,
      value:
        `Gebot: **${fmt(a.currentBid)}** 💰${buyNow}${extra}\n` +
        `Endet ${fmtRelative(a.endTime)} • UID: \`${a.uid}\``,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}