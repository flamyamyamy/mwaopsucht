import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  ApplicationIntegrationType,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  SeparatorBuilder,
  MessageFlags,
} from "discord.js";
import { getFixedT } from "../../i18n/index.js";

const verificationLevels = {
  0: "None",
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Very High",
};

const nsfwLevels = {
  0: "Default",
  1: "Explicit",
  2: "Safe",
  3: "Age Restricted",
};

function cleanInvite(input) {
  return input
    .replace("https://discord.gg/", "")
    .replace("http://discord.gg/", "")
    .replace("https://www.discord.gg/", "")
    .replace("http://www.discord.gg/", "")
    .replace("https://discord.com/invite/", "")
    .replace("http://discord.com/invite/", "")
    .replace("https://www.discord.com/invite/", "")
    .replace("http://www.discord.com/invite/", "")
    .trim();
}

function formatFeatureName(feature) {
  return feature
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function truncateText(text, max = 1000) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}\n...` : text;
}

export const data = new SlashCommandBuilder()
  .setName("serverinfo")
  .setDescription("Show detailed information about a server via invite")
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
      .setName("invite")
      .setDescription("Invite code or invite link")
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName("raw")
      .setDescription("Show developer-style raw server data")
      .setRequired(false),
  );

export async function execute(interaction) {
  const t = interaction.t ?? getFixedT("en");
  const rawInvite = interaction.options.getString("invite");
  const raw = interaction.options.getBoolean("raw") ?? false;
  const inviteCode = cleanInvite(rawInvite);

  try {
    const invite = await interaction.client.fetchInvite(inviteCode, {
      withCounts: true,
      withExpiration: true,
    });

    const guild = invite.guild;

    const icon =
      typeof guild.iconURL === "function"
        ? guild.iconURL({ size: 1024, extension: "png" })
        : null;

    const banner =
      typeof guild.bannerURL === "function"
        ? guild.bannerURL({ size: 1024, extension: "png" })
        : null;

    const formattedFeatures = guild.features?.length
      ? guild.features
          .map(formatFeatureName)
          .map((feature) => `- ${feature}`)
          .join("\n")
      : t("serverinfo.noFeatures");

    if (raw) {
      const rawGuild = typeof guild.toJSON === "function" ? guild.toJSON() : {};
      const rawInviteData =
        typeof invite.toJSON === "function" ? invite.toJSON() : {};

      const rawData = {
        guild: {
          ...rawGuild,
          iconURL: icon,
          bannerURL: banner,
          vanityInviteURL: guild.vanityURLCode
            ? `https://discord.gg/${guild.vanityURLCode}`
            : null,
        },
        invite: {
          ...rawInviteData,
          url: `https://discord.gg/${invite.code}`,
        },
      };

      const basicInfo = [
        `**${t("serverinfo.id")}:** \`${guild.id}\``,
        `**${t("serverinfo.name")}:** ${guild.name}`,
        `**${t("serverinfo.description")}:** ${guild.description || t("common.na")}`,
        `**${t("serverinfo.inviteCode")}:** \`${invite.code}\``,
        `**${t("serverinfo.inviteUrl")}:** \`https://discord.gg/${invite.code}\``,
        `**${t("serverinfo.created")}:** ${
          guild.createdTimestamp
            ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
            : t("common.unknown")
        }`,
        `**${t("serverinfo.createdRelative")}:** ${
          guild.createdTimestamp
            ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`
            : t("common.unknown")
        }`,
      ].join("\n");

      const inviteInfo = [
        `**${t("serverinfo.channel")}:** ${invite.channel ? `<#${invite.channel.id}>` : t("common.unknown")}`,
        `**${t("serverinfo.members")}:** ${invite.memberCount ?? t("common.unknown")}`,
        `**${t("serverinfo.online")}:** ${invite.presenceCount ?? t("common.unknown")}`,
        `**${t("serverinfo.inviter")}:** ${
          invite.inviter
            ? `${invite.inviter.tag} (\`${invite.inviter.id}\`)`
            : t("common.unknown")
        }`,
        `**${t("serverinfo.expires")}:** ${
          invite.expiresAt
            ? `<t:${Math.floor(new Date(invite.expiresAt).getTime() / 1000)}:F>`
            : t("common.unknown")
        }`,
      ].join("\n");

      const serverInfo = [
        `**${t("serverinfo.boosts")}:** ${guild.premiumSubscriptionCount || 0}`,
        `**${t("serverinfo.verification")}:** ${t(`serverinfo.verificationLevel.${guild.verificationLevel}`) ?? t("common.unknown")}`,
        `**${t("serverinfo.nsfwLevel")}:** ${t(`serverinfo.nsfwLevelType.${guild.nsfwLevel}`) ?? t("common.unknown")}`,
        `**${t("serverinfo.vanityUrl")}:** ${
          guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : t("common.na")
        }`,
        `**${t("serverinfo.featuresCount")}:** ${guild.features?.length || 0}`,
      ].join("\n");

      const rawContainer = new ContainerBuilder().setAccentColor(0x2b2d31);

      const rawHeader = [
        `# ${t("serverinfo.rawTitle")}`,
        "",
        t("serverinfo.rawDescription", { guildName: guild.name }),
        "",
        t("serverinfo.rawFileNotice"),
      ].join("\n");

      if (icon) {
        rawContainer.addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(rawHeader),
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)),
        );
      } else {
        rawContainer.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(rawHeader),
        );
      }

      rawContainer
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [`## ${t("serverinfo.basicInfo")}`, "", truncateText(basicInfo, 1200)].join(
              "\n",
            ),
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [`## ${t("serverinfo.inviteData")}`, "", truncateText(inviteInfo, 1200)].join("\n"),
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [`## ${t("serverinfo.serverDetails")}`, "", truncateText(serverInfo, 1200)].join(
              "\n",
            ),
          ),
        );

      if (guild.features?.length) {
        rawContainer
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              [
                `## ${t("serverinfo.features")}`,
                "",
                "```yaml",
                truncateText(formattedFeatures, 1000),
                "```",
              ].join("\n"),
            ),
          );
      }

      if (banner) {
        rawContainer
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent("## Banner"),
          )
          .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
              new MediaGalleryItemBuilder().setURL(banner),
            ),
          );
      }

      const rawButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Open Invite")
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.gg/${invite.code}`),
      );

      if (icon) {
        rawButtons.addComponents(
          new ButtonBuilder()
            .setLabel("Icon URL")
            .setStyle(ButtonStyle.Link)
            .setURL(icon),
        );
      }

      if (banner) {
        rawButtons.addComponents(
          new ButtonBuilder()
            .setLabel("Banner URL")
            .setStyle(ButtonStyle.Link)
            .setURL(banner),
        );
      }

      rawContainer.addActionRowComponents(rawButtons);

      return await interaction.reply({
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        components: [rawContainer],
        files: [
          {
            attachment: Buffer.from(JSON.stringify(rawData, null, 2), "utf8"),
            name: `serverinfo-${guild.id}.json`,
          },
        ],
      });
    }

    const mainText = [
      `# ${guild.name}`,
      "",
      guild.description || t("serverinfo.noServerDescription"),
      "",
      `**${t("serverinfo.id")}:** \`${guild.id}\``,
      `**${t("serverinfo.inviteCode")}:** \`${invite.code}\``,
      `**${t("serverinfo.channel")}:** ${invite.channel ? `<#${invite.channel.id}>` : t("common.unknown")}`,
      `**${t("serverinfo.members")}:** ${invite.memberCount ?? t("common.unknown")}`,
      `**${t("serverinfo.online")}:** ${invite.presenceCount ?? t("common.unknown")}`,
      `**${t("serverinfo.boosts")}:** ${guild.premiumSubscriptionCount || 0}`,
      "",
      `**${t("serverinfo.created")}:** ${
        guild.createdTimestamp
          ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>\n<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`
          : t("common.unknown")
      }`,
      "",
      `**${t("serverinfo.inviter")}:** ${
        invite.inviter
          ? `${invite.inviter.tag}\n\`${invite.inviter.id}\``
          : t("common.unknown")
      }`,
      `**${t("serverinfo.verification")}:** ${t(`serverinfo.verificationLevel.${guild.verificationLevel}`) ?? t("common.unknown")}`,
      `**${t("serverinfo.nsfwLevel")}:** ${t(`serverinfo.nsfwLevelType.${guild.nsfwLevel}`) ?? t("common.unknown")}`,
      `**${t("serverinfo.vanityUrl")}:** ${guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : t("common.na")}`,
    ].join("\n");

    const container = new ContainerBuilder().setAccentColor(0x2b2d31);

    if (icon) {
      container.addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(mainText),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(icon)),
      );
    } else {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(mainText),
      );
    }

    if (banner) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${t("serverinfo.banner")}`),
        )
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(banner),
          ),
        );
    }

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(t("serverinfo.openInvite"))
          .setStyle(ButtonStyle.Link)
          .setURL(`https://discord.gg/${invite.code}`),
        new ButtonBuilder()
          .setCustomId(`server_features_${interaction.id}`)
          .setLabel(t("serverinfo.features"))
          .setStyle(ButtonStyle.Secondary),
      ),
    );

    if (icon || banner) {
      const mediaButtons = new ActionRowBuilder();

      if (icon) {
        mediaButtons.addComponents(
          new ButtonBuilder()
            .setLabel(t("serverinfo.iconUrl"))
            .setStyle(ButtonStyle.Link)
            .setURL(icon),
        );
      }

      if (banner) {
        mediaButtons.addComponents(
          new ButtonBuilder()
            .setLabel(t("serverinfo.bannerUrl"))
            .setStyle(ButtonStyle.Link)
            .setURL(banner),
        );
      }

      container.addActionRowComponents(mediaButtons);
    }

    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
    });

    const reply = await interaction.fetchReply();

    const buttonInteraction = await reply
      .awaitMessageComponent({
        filter: (i) =>
          i.customId === `server_features_${interaction.id}` &&
          i.user.id === interaction.user.id,
        time: 60000,
      })
      .catch(() => null);

    if (!buttonInteraction) return;

    const featureContainer = new ContainerBuilder()
      .setAccentColor(0x2b2d31)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          [
            `# ${t("serverinfo.featuresTitle", { guildName: guild.name })}`,
            "",
            "```yaml",
            truncateText(formattedFeatures, 3000),
            "```",
          ].join("\n"),
        ),
      );

    if (banner) {
      featureContainer
        .addSeparatorComponents(new SeparatorBuilder())
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(banner),
          ),
        );
    }

    await buttonInteraction.reply({
      flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      components: [featureContainer],
    });
  } catch (error) {
    console.error("serverinfo error:", error);

    const errorMessage =
      error?.message?.includes("Unknown Invite") || error?.code === 10006
        ? t("serverinfo.invalidInvite")
        : t("serverinfo.error", { message: error.message });

    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
    } else {
      await interaction
        .reply({
          content: errorMessage,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => null);
    }
  }
}
