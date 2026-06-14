import {
  SlashCommandBuilder,
  EmbedBuilder,
  ApplicationIntegrationType,
  InteractionContextType,
} from "discord.js";

const MESSAGES = [
    "Zwei Mädchen, ein Herz 🏳️‍🌈",
    "Du bist mein Lieblingsmensch 💗",
    "Ich liebe dich mehr als Worte sagen können 🌸"
  ];

export const data = new SlashCommandBuilder()
  .setName("liebe")
  .setDescription("💕 Für Du & Eva")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  );

export async function execute(interaction) {
  const msg = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];

  const embed = new EmbedBuilder()
    .setTitle("💕 Du & Eva")
    .setDescription(msg)
    .setColor(0xff73b2)
    .setFooter({ text: "🏳️‍🌈 lesbian love • /liebe" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}