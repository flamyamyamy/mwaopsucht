import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} from "discord.js";
import { getMarketCategories, getMarketPrices, fmt, prettyMaterial } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("markt-uebersicht")
  .setDescription("Zeigt alle Marktkategorien und die teuersten Items je Kategorie");

export async function execute(interaction) {
  await interaction.deferReply();

  const [categories, priceData] = await Promise.all([
    getMarketCategories(),
    getMarketPrices(),
  ]);

  // Build category → items map
  const prices = Array.isArray(priceData) ? priceData : Object.values(priceData ?? {});

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🏪 OPSUCHT Markt – Kategorien")
    .setTimestamp();

  for (const cat of categories.slice(0, 6)) {
    // Filter items belonging to this category (best-effort by category field)
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

    embed.addFields({ name: cat.name, value, inline: true });
  }

  embed.setDescription(
    `${categories.length} Kategorien verfügbar.\nBenutze **/markt-preis** für Details zu einem Item.`
  );

  await interaction.editReply({ embeds: [embed] });
}