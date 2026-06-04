import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";
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
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

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

  const enchants = Object.entries(item.enchantments ?? {})
    .map(([k, v]) => `${k.replace("minecraft:", "")} ${v}`)
    .join(", ") || "–";

  const bids = Object.entries(a.bids ?? {})
    .map(([bidder, amount]) => ({ bidder, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const bidsText = bids.length
    ? bids.map((b, i) => `${i + 1}. \`${b.bidder.slice(0, 8)}…\` – **${fmt(b.amount)}** 💰`).join("\n")
    : "Noch keine Gebote";

  const container = new ContainerBuilder();

  const headerContent = `# <:Bookshelf:1512068300864768512> ${amount > 1 ? `${amount}x ` : ""}${name}\n\n**Startgebot:** ${fmt(a.startBid)} 💰\n**Aktuelles Gebot:** ${fmt(a.currentBid)} 💰\n**Sofortkauf:** ${a.instantBuyPrice ? `${fmt(a.instantBuyPrice)} 💰` : "–"}\n**Endet:** ${fmtDate(a.endTime)} (${fmtRelative(a.endTime)})\n**Gestartet:** ${fmtDate(a.startTime)}\n**Kategorie:** ${a.category ?? "–"}`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerContent)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const detailsContent = `**Verzauberungen:** ${enchants}\n\n**Beschreibung:**\n${lore.length > 300 ? lore.slice(0, 300) + "…" : lore}`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(detailsContent)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const bidsContent = `**Top-Gebote (${bids.length})**\n${bidsText}`;
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(bidsContent)
  );

  if (a.highestBidder) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Höchstbietender:** \`${a.highestBidder}\``)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`🆔 UID: \`${a.uid}\``)
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
