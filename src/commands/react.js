import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js";
import { actions, getGif, getText } from "../utils/reactions.js";

export const data = new SlashCommandBuilder()
  .setName("react")
  .setDescription("Sende eine Anime-Reaktion!")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .addStringOption((option) =>
    option
      .setName("typ")
      .setDescription("Reaktionstyp")
      .setRequired(true)
      .addChoices(...actions.map((a) => ({ name: a, value: a }))),
  )
  .addUserOption((option) =>
    option
      .setName("nutzer")
      .setDescription("Zielnutzer")
      .setRequired(false),
  );

export async function execute(interaction) {
  const type = interaction.options.getString("typ");
  const author = interaction.user;
  const rawTarget = interaction.options.getUser("nutzer");
  const targetUser = rawTarget?.id === author.id ? null : rawTarget;

  await interaction.deferReply();

  const gif = await getGif(type);
  const text = getText(type, author, targetUser);

  const embed = new EmbedBuilder()
    .setDescription(text)
    .setColor(0xfaa698);

  if (gif) embed.setImage(gif);

  await interaction.editReply({ embeds: [embed] });
}