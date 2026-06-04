import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";
import { getMerchantRates, fmt } from "../utils/api.js";

function cleanSource(source) {
  if (source.startsWith("minecraft:")) {
    const match = source.match(/"text":\s*"([^"]+)"/);
    if (match) return match[1];
    const mat = source.split("[")[0].replace("minecraft:", "");
    return mat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const data = new SlashCommandBuilder()
  .setName("haendler")
  .setDescription("Zeigt die aktuellen Händler-Wechselkurse (Items → OPShards)");

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

  const rates = await getMerchantRates();

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 💱 Händler Wechselkurse\n\nAktuelle Kurse für den Tausch von Items gegen OPShards:`
    )
  );

  if (!rates.length) {
    container.addSeparatorComponents(new SeparatorBuilder());
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent("Keine Wechselkurse verfügbar.")
    );
  } else {
    container.addSeparatorComponents(new SeparatorBuilder());

    const ratesLines = rates.map((r) => {
      const sourceName = cleanSource(r.source);
      const base       = fmt(r.base);
      const current    = fmt(r.exchangeRate);
      const diff       = r.exchangeRate - r.base;
      const trend      = diff > 0 ? `🟢 +${fmt(diff)}` : diff < 0 ? `🔴 ${fmt(diff)}` : "⚪ ±0";

      return `**${sourceName}**\nBasis: **${base}** Shards\nAktuell: **${current}** Shards ${trend}`;
    }).join("\n\n");

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(ratesLines)
    );
  }

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("Quelle: api.opsucht.net/merchant/rates")
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
