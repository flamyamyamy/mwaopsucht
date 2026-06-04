import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";
import { getItemHistory, getMarketItems, fmt, prettyMaterial } from "../utils/api.js";

export const data = new SlashCommandBuilder()
  .setName("markt-verlauf")
  .setDescription("Zeigt den Preisverlauf eines Items im Markt")
  .addStringOption((opt) =>
    opt
      .setName("material")
      .setDescription("Material-Name (z.B. DIAMOND)")
      .setRequired(true)
      .setAutocomplete(true)
  );

export { autocomplete } from "./markt-preis.js";

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 });

  const material = interaction.options.getString("material").toUpperCase();

  let history;
  try {
    history = await getItemHistory(material);
  } catch {
    return interaction.editReply(`❌ Kein Preisverlauf für \`${material}\` gefunden.`);
  }

  const entries = Array.isArray(history) ? history : [];

  if (entries.length === 0) {
    return interaction.editReply(`ℹ️ Kein Preisverlauf für \`${material}\` verfügbar.`);
  }

  const last = entries.slice(-10);
  const prices = last.map((h) => h.avgPrice ?? h.price ?? h.buyPrice ?? 0);
  const maxP   = Math.max(...prices);
  const minP   = Math.min(...prices);

  const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

  const chart = last
    .map((h) => {
      const p    = h.avgPrice ?? h.price ?? h.buyPrice ?? 0;
      const date = h.date ? new Date(h.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "??";
      const norm = maxP === minP ? 1 : (p - minP) / (maxP - minP);
      const bar  = BARS[Math.round(norm * (BARS.length - 1))];
      return `${bar} ${date}  ${fmt(p)} 💰`;
    })
    .join("\n");

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 📊 Preisverlauf: ${prettyMaterial(material)}\n\n\`\`\`\n${chart}\n\`\`\``
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const statsContent = `**Minimum:** ${fmt(minP)} 💰\n**Maximum:** ${fmt(maxP)} 💰\n**Einträge:** ${entries.length}`;

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(statsContent)
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Material: ${material}`)
  );

  await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}
