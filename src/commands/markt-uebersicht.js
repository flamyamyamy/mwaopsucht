import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";
import { getMarketCategories, getMarketPrices, fmt, prettyMaterial } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("markt-uebersicht")
  .setDescription("Zeigt alle Marktkategorien und die teuersten Items je Kategorie");

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

  const [categories, priceData] = await Promise.all([
    getMarketCategories(),
    getMarketPrices(),
  ]);

  const prices = Array.isArray(priceData) ? priceData : Object.values(priceData ?? {});

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 🏪 OPSUCHT Markt – Kategorien\n\n${categories.length} Kategorien verfügbar.\nBenutze **/markt-preis** für Details zu einem Item.`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const categoryLines = categories.slice(0, 10).map((cat) => {
    const catItems = prices
      .filter((p) => p.category === cat.name)
      .sort((a, b) => (b.avgPrice ?? b.price ?? 0) - (a.avgPrice ?? a.price ?? 0))
      .slice(0, 3);

    const value = catItems.length
      ? catItems
          .map(
            (p) =>
              `• ${prettyMaterial(p.material ?? "")} – **${fmt(p.avgPrice ?? p.price ?? p.buyPrice)}** 💰`
          )
          .join("\n")
      : "–";

    return `**${cat.name}**\n${value}`;
  }).join("\n\n");

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(categoryLines)
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
