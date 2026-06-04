import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import {
  getActiveAuctions,
  getAuctionCategories,
  fmt,
  fmtRelative,
} from "../utils/api.js";

const PAGE_SIZE = 5;

export const data = new SlashCommandBuilder()
  .setName("auktionen")
  .setDescription("Zeigt aktive Auktionen auf OPSUCHT an")
  .addStringOption((opt) =>
    opt
      .setName("kategorie")
      .setDescription("Nach Kategorie filtern (optional)")
      .setRequired(false)
      .setAutocomplete(true)
  )
  .addStringOption((opt) =>
    opt
      .setName("suche")
      .setDescription("Itemname suchen (optional)")
      .setRequired(false)
  );

export async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  try {
    const categories = await getAuctionCategories();
    const choices = categories
      .filter((c) => c.displayName.toLowerCase().includes(focused))
      .slice(0, 25)
      .map((c) => ({ name: c.displayName, value: c.name }));
    await interaction.respond(choices);
  } catch {
    await interaction.respond([]);
  }
}

function buildEmbed(auctions, page, total, category, search) {
  const start = page * PAGE_SIZE;
  const slice = auctions.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(auctions.length / PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle("🏷️ OPSUCHT Auktionen")
    .setFooter({
      text: `Seite ${page + 1}/${totalPages || 1} • ${total} Auktionen gesamt`,
    })
    .setTimestamp();

  if (category) embed.setDescription(`Kategorie: **${category}**`);
  if (search)   embed.setDescription((embed.data.description ?? "") + `  •  Suche: **${search}**`);

  if (slice.length === 0) {
    embed.setDescription("Keine Auktionen gefunden.");
    return embed;
  }

  for (const a of slice) {
    const name   = a.item?.displayName || a.item?.material || "Unbekannt";
    const amount = a.item?.amount ?? 1;
    const bid    = fmt(a.currentBid);
    const buyNow = a.instantBuyPrice ? ` | Sofortkauf: **${fmt(a.instantBuyPrice)}** 💰` : "";
    const endsIn = fmtRelative(a.endTime);
    const bidder = a.highestBidder ? "✅ Gebote vorhanden" : "⏳ Kein Gebot";

    embed.addFields({
      name: `${amount > 1 ? `${amount}x ` : ""}${name}`,
      value: `Gebot: **${bid}** 💰${buyNow}\nEndet: ${endsIn} • ${bidder}\nID: \`${a.uid}\``,
      inline: false,
    });
  }

  return embed;
}

export async function execute(interaction) {
  await interaction.deferReply();

  const categoryArg = interaction.options.getString("kategorie") ?? null;
  const search      = interaction.options.getString("suche")?.toLowerCase() ?? null;

  let auctions = await getActiveAuctions(categoryArg);

  // get display name for category
  let categoryName = categoryArg;
  if (categoryArg) {
    try {
      const cats = await getAuctionCategories();
      categoryName = cats.find((c) => c.name === categoryArg)?.displayName ?? categoryArg;
    } catch {}
  }

  if (search) {
    auctions = auctions.filter((a) => {
      const name = (a.item?.displayName || a.item?.material || "").toLowerCase();
      return name.includes(search);
    });
  }

  // sort by endTime ascending (closest first)
  auctions.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

  const total = auctions.length;
  let page = 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const buildRow = (p) =>
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("prev")
        .setLabel("◀")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p === 0),
      new ButtonBuilder()
        .setCustomId("next")
        .setLabel("▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(p >= totalPages - 1)
    );

  const embed = buildEmbed(auctions, page, total, categoryName, search);
  const reply = await interaction.editReply({
    embeds: [embed],
    components: totalPages > 1 ? [buildRow(page)] : [],
  });

  if (totalPages <= 1) return;

  const collector = reply.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id,
    time: 120_000,
  });

  collector.on("collect", async (i) => {
    if (i.customId === "prev" && page > 0) page--;
    else if (i.customId === "next" && page < totalPages - 1) page++;
    await i.update({
      embeds: [buildEmbed(auctions, page, total, categoryName, search)],
      components: [buildRow(page)],
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}