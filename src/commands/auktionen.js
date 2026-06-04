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
  const start      = page * PAGE_SIZE;
  const slice      = auctions.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(auctions.length / PAGE_SIZE);

  // Quick stats over full result set
  const prices       = auctions.map((a) => a.currentBid).filter(Boolean);
  const minBid       = prices.length ? Math.min(...prices) : null;
  const maxBid       = prices.length ? Math.max(...prices) : null;
  const withBids     = auctions.filter((a) => Object.keys(a.bids ?? {}).length > 0).length;
  const withBuyNow   = auctions.filter((a) => a.instantBuyPrice).length;

  // Description: filter indicators + stats bar
  const filterParts = [];
  if (category) filterParts.push(`🗂️ **${category}**`);
  if (search)   filterParts.push(`🔎 **${search}**`);
  const filterLine = filterParts.length ? filterParts.join("  •  ") + "\n" : "";

  const statsLine =
    prices.length
      ? `> 📉 Min: **${fmt(minBid)}$**  •  📈 Max: **${fmt(maxBid)}$**  •  🔥 ${withBids} aktive Gebote  •  🛒 ${withBuyNow}x Sofortkauf`
      : "";

  const embed = new EmbedBuilder()
    .setColor(0xe6b800)
    .setTitle("🏷️ OPSUCHT — Auktionshaus")
    .setDescription(
      slice.length === 0
        ? "❌ Keine Auktionen gefunden."
        : filterLine + statsLine
    )
    .setFooter({
      text: `Seite ${page + 1}/${totalPages || 1}  •  ${total} Auktionen gesamt  •  OPSUCHT`,
    })
    .setTimestamp();

  for (const a of slice) {
    const name      = a.item?.displayName || a.item?.material || "Unbekannt";
    const amount    = a.item?.amount ?? 1;
    const bid       = fmt(a.currentBid);
    const endsIn    = fmtRelative(a.endTime);
    const bidCount  = Object.keys(a.bids ?? {}).length;
    const hasBid    = bidCount > 0;

    const lines = [
      `💰 Gebot: **${bid}$**` + (a.instantBuyPrice ? `  •  🛒 Sofortkauf: **${fmt(a.instantBuyPrice)}$**` : ""),
      `${hasBid ? "🔥" : "⏳"} Gebote: **${bidCount}**  •  ⏱️ Endet: **${endsIn}**`,
      `🆔 \`${a.uid}\``,
    ];

    embed.addFields({
      name: `${amount > 1 ? `${amount}x ` : ""}${name}`,
      value: lines.join("\n"),
      inline: false,
    });
  }

  return embed;
}

function buildRow(page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("prev")
      .setLabel("◀ Zurück")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId("page_info")
      .setLabel(`${page + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId("next")
      .setLabel("Weiter ▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );
}

export async function execute(interaction) {
  await interaction.deferReply();

  const categoryArg = interaction.options.getString("kategorie") ?? null;
  const search      = interaction.options.getString("suche")?.toLowerCase() ?? null;

  let auctions = await getActiveAuctions(categoryArg);

  // Resolve category display name
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

  // Sort by soonest ending first
  auctions.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

  const total      = auctions.length;
  let   page       = 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const embed = buildEmbed(auctions, page, total, categoryName, search);
  const reply = await interaction.editReply({
    embeds: [embed],
    components: totalPages > 1 ? [buildRow(page, totalPages)] : [],
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
      components: [buildRow(page, totalPages)],
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
