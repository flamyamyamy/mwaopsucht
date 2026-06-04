import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getActiveAuctions, fmt, fmtDate, fmtRelative } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("auktion-info")
  .setDescription("Zeigt Details zu einer bestimmten Auktion")
  .addStringOption((opt) =>
    opt
      .setName("uid")
      .setDescription("Die UID der Auktion (aus /auktionen)")
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const uid = interaction.options.getString("uid").trim();
  const all = await getActiveAuctions();
  const a   = all.find((x) => x.uid === uid);

  if (!a) {
    return interaction.editReply("❌ Keine aktive Auktion mit dieser UID gefunden.");
  }

  const item   = a.item ?? {};
  const name   = item.displayName || item.material || "Unbekannt";
  const amount = item.amount ?? 1;
  const lore   = item.lore?.filter(Boolean).join("\n") || "–";

  // Enchantments
  const enchants = Object.entries(item.enchantments ?? {})
    .map(([k, v]) => `${k.replace("minecraft:", "")} ${v}`)
    .join(", ") || "–";

  // Bids table (top 5)
  const bids = Object.entries(a.bids ?? {})
    .map(([bidder, amount]) => ({ bidder, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const bidsText = bids.length
    ? bids.map((b, i) => `${i + 1}. \`${b.bidder.slice(0, 8)}…\` – **${fmt(b.amount)}** 💰`).join("\n")
    : "Noch keine Gebote";

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle(`🏷️ ${amount > 1 ? `${amount}x ` : ""}${name}`)
    .setThumbnail(item.icon ?? null)
    .addFields(
      { name: "Startgebot",    value: `${fmt(a.startBid)} 💰`,            inline: true },
      { name: "Aktuelles Gebot", value: `${fmt(a.currentBid)} 💰`,        inline: true },
      { name: "Sofortkauf",    value: a.instantBuyPrice ? `${fmt(a.instantBuyPrice)} 💰` : "–", inline: true },
      { name: "Endet",         value: `${fmtDate(a.endTime)} (${fmtRelative(a.endTime)})`, inline: false },
      { name: "Gestartet",     value: fmtDate(a.startTime),               inline: true  },
      { name: "Kategorie",     value: a.category ?? "–",                  inline: true  },
      { name: "Verzauberungen",value: enchants,                           inline: false },
      { name: "Beschreibung",  value: lore.length > 300 ? lore.slice(0, 300) + "…" : lore, inline: false },
      { name: `Top-Gebote (${bids.length})`, value: bidsText,            inline: false },
    )
    .setFooter({ text: `UID: ${a.uid}` })
    .setTimestamp();

  if (a.highestBidder) {
    embed.addFields({ name: "Höchstbietender", value: `\`${a.highestBidder}\``, inline: true });
  }

  await interaction.editReply({ embeds: [embed] });
}