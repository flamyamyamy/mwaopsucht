import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from "discord.js";
import { getActiveAuctions, getAuctionCategories, fmt, fmtRelative } from "../utils/api.js";

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

function buildContainer(auctions, page, total, category, search) {
  const start      = page * PAGE_SIZE;
  const slice      = auctions.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(auctions.length / PAGE_SIZE);

  const prices       = auctions.map((a) => a.currentBid).filter(Boolean);
  const minBid       = prices.length ? Math.min(...prices) : null;
  const maxBid       = prices.length ? Math.max(...prices) : null;
  const withBids     = auctions.filter((a) => Object.keys(a.bids ?? {}).length > 0).length;

  const filterParts = [];
  if (category) filterParts.push(`<:Bookshel:1512068009944944691> **${category}**`);
  if (search)   filterParts.push(`<:Spyglass:1512068258956574751> **${search}**`);
  const filterLine = filterParts.length ? filterParts.join("  •  ") + "\n" : "";

  const statsLine = prices.length
    ? `> <:Stick:1512068203163943072> Min: **${fmt(minBid)}$** • <:Blaze_Rod:1512068287239032842> Max: **${fmt(maxBid)}$** • <:Fire_Charge:1512068044271386694> ${withBids} aktive Gebote`
    : "";

  const container = new ContainerBuilder();

  const headerContent = `# <:Name_Tag:1512068231198806116> OPSUCHT — Auktionshaus\n\n${slice.length === 0 ? "❌ Keine Auktionen gefunden." : filterLine + statsLine}\n\nSeite ${page + 1}/${totalPages || 1} • ${total} Auktionen gesamt`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(headerContent)
  );

  if (slice.length > 0) {
    container.addSeparatorComponents(new SeparatorBuilder());

    const auctionLines = slice.map((a) => {
      const name      = a.item?.displayName || a.item?.material || "Unbekannt";
      const amount    = a.item?.amount ?? 1;
      const bid       = fmt(a.currentBid);
      const endsIn    = fmtRelative(a.endTime);
      const bidCount  = Object.keys(a.bids ?? {}).length;
      const hasBid    = bidCount > 0;

      return `**${amount > 1 ? `${amount}x ` : ""}${name}**\n💰 Gebot: **${bid}$**${a.instantBuyPrice ? ` • <:Bundle:1512068142564904992> Sofortkauf: **${fmt(a.instantBuyPrice)}$**` : ""}\n${hasBid ? "<:Fire_Charge:1512068044271386694>" : "⏳"} Gebote: **${bidCount}** • <a:Clock:1512068072075427841> Endet: **${endsIn}**\n🆔 \`${a.uid}\``;
    }).join("\n\n");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(auctionLines)
    );
  }

  return container;
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
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

  const categoryArg = interaction.options.getString("kategorie") ?? null;
  const search      = interaction.options.getString("suche")?.toLowerCase() ?? null;

  let auctions = await getActiveAuctions(categoryArg);

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

  auctions.sort((a, b) => new Date(a.endTime) - new Date(b.endTime));

  const total      = auctions.length;
  let   page       = 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const container = buildContainer(auctions, page, total, categoryName, search);
  const components = totalPages > 1 ? [container, buildRow(page, totalPages)] : [container];
  
  const reply = await interaction.editReply({
    components,
    flags: MessageFlags.IsComponentsV2,
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
      components: [buildContainer(auctions, page, total, categoryName, search), buildRow(page, totalPages)],
      flags: MessageFlags.IsComponentsV2,
    });
  });

  collector.on("end", () => {
    interaction.editReply({ components: [] }).catch(() => {});
  });
}
