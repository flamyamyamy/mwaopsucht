import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js";
import { actions, getGif, getText } from "../../utils/reactions.js";
import { getFixedT } from "../../i18n/index.js";

export const data = new SlashCommandBuilder()
  .setName("react")
  .setDescription("Send an anime reaction!")
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
      .setName("type")
      .setDescription("Reaction type")
      .setRequired(true)
      .addChoices(...actions.map((a) => ({ name: a, value: a }))),
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("Target user")
      .setRequired(false),
  );

export async function execute(interaction) {
  const t = interaction.t ?? getFixedT("en");
  const type = interaction.options.getString("type");
  const author = interaction.user;
  const rawTarget = interaction.options.getUser("user");
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