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
  .setName("banner")
  .setDescription("Get user banner")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addUserOption((opt) => opt.setName("user").setDescription("Target user").setRequired(false));

export async function execute(interaction) {
  const t = interaction.t ?? getFixedT("en");
  try {
    const user = interaction.options.getUser("user") || interaction.user;
    const fetched = await interaction.client.users.fetch(user.id, { force: true });
    const banner = fetched.bannerURL({ size: 1024, extension: "png" });

    if (!banner) {
      return interaction.reply({ content: t("banner.noBanner"), flags: 64 });
    }

    const container = new ContainerBuilder()
      .setAccentColor(fetched.accentColor || 0x2b2d31)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${user.username}'s banner`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel(t("banner.label")).setStyle(ButtonStyle.Link).setURL(banner),
        ),
      );

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error("banner error:", error);
    const t2 = interaction.t ?? getFixedT("en");
    const reply = { content: t2("banner.error"), flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => null);
    } else {
      await interaction.reply(reply).catch(() => null);
    }
  }
}
