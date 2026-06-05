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
  .setName("avatar")
  .setDescription("Zeigt den Avatar eines Nutzers an")
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel)
  .addUserOption((opt) => opt.setName("nutzer").setDescription("Zielnutzer").setRequired(false));

export async function execute(interaction) {
  try {
    const user = interaction.options.getUser("nutzer") || interaction.user;
    const avatar = user.displayAvatarURL({ size: 1024, extension: "png" });

    const container = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# Avatar von ${user.username}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatar)))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setLabel("Avatar herunterladen").setStyle(ButtonStyle.Link).setURL(avatar),
        ),
      );

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error("Avatar-Fehler:", error);
    const reply = { content: "❌ Beim Abrufen des Avatars ist ein Fehler aufgetreten.", flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => null);
    } else {
      await interaction.reply(reply).catch(() => null);
    }
  }
}