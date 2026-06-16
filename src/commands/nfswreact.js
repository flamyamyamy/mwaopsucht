import {
    SlashCommandBuilder,
    EmbedBuilder,
    ApplicationIntegrationType,
    InteractionContextType,
    PermissionFlagsBits,
} from "discord.js";
import { nsfwActions, getNsfwGif, getNsfwText } from "../utils/nsfwReactions.js";

export const data = new SlashCommandBuilder()
    .setName("nsfwreact")
    .setDescription("🔞 Sende eine NSFW Anime-Reaktion!")
    .setNSFW(true) // ← Discord markiert den Command als NSFW-only
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
            .addChoices(...nsfwActions.map((a) => ({ name: a, value: a }))),
    )
    .addUserOption((option) =>
        option
            .setName("nutzer")
            .setDescription("Zielnutzer (optional)")
            .setRequired(false),
    );

export async function execute(interaction) {
    // Extra Guard: nur in NSFW-Kanälen ausführen (Serverkontext)
    if (
        interaction.channel &&
        !interaction.channel.isDMBased() &&
        !interaction.channel.nsfw
    ) {
        return interaction.reply({
            content: "🔞 Dieser Command kann nur in **NSFW-Kanälen** benutzt werden!",
            ephemeral: true,
        });
    }

    const type       = interaction.options.getString("typ");
    const author     = interaction.user;
    const rawTarget  = interaction.options.getUser("nutzer");
    const targetUser = rawTarget?.id === author.id ? null : rawTarget;

    await interaction.deferReply();

    const gif  = await getNsfwGif(type);
    const text = getNsfwText(type, author, targetUser);

    const embed = new EmbedBuilder()
        .setDescription(text)
        .setColor(0xff4757) // Knalliges Rot für NSFW
        .setFooter({ text: "🔞 NSFW • Powered by waifu.im" });

    if (gif) embed.setImage(gif);

    await interaction.editReply({ embeds: [embed] });
}