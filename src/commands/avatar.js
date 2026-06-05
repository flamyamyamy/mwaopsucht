import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  ApplicationIntegrationType,
  ContainerBuilder,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  MessageFlags,
} from "discord.js";
import { getFixedT } from "../../i18n/index.js";

export const data = new SlashCommandBuilder()
  .setName("avatar")
  .setDescription("Get user avatar")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(false));

export async function execute(interaction) {
  const t = interaction.t ?? getFixedT("en");
  try {
    const user = interaction.options.getUser("user") || interaction.user;
    const avatar = user.displayAvatarURL({ size: 1024, extension: "png" });

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${user.username}'s avatar`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatar)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(t("avatar.label")).setStyle(ButtonStyle.Link).setURL(avatar),
        ),
      );

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error("avatar error:", error);
    const t = interaction.t ?? getFixedT("en");
    const reply = { content: t("avatar.error"), flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => null);
    } else {
      await interaction.reply(reply).catch(() => null);
    }
  }
}
