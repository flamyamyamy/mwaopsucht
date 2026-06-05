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

export const data = new SlashCommandBuilder()
  .setName("banner")
  .setDescription("Zeigt das Banner eines Nutzers an")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addUserOption((opt) => opt.setName("nutzer").setDescription("Zielnutzer").setRequired(false));

export async function execute(interaction) {
  try {
    const user = interaction.options.getUser("nutzer") || interaction.user;
    const fetched = await interaction.client.users.fetch(user.id, { force: true });
    const banner = fetched.bannerURL({ size: 1024, extension: "png" });

    if (!banner) {
      return interaction.reply({ content: "❌ Dieser Nutzer hat kein Banner.", flags: 64 });
    }

    const container = new ContainerBuilder()
      .setAccentColor(fetched.accentColor || 0x2b2d31)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Banner von ${user.username}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Banner herunterladen").setStyle(ButtonStyle.Link).setURL(banner),
        ),
      );

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error("Banner-Fehler:", error);
    const reply = { content: "❌ Beim Abrufen des Banners ist ein Fehler aufgetreten.", flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => null);
    } else {
      await interaction.reply(reply).catch(() => null);
    }
  }
}