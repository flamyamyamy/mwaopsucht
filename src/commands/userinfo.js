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
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} from "discord.js";
import { getFixedT } from "../../i18n/index.js";

function formatHex(color) {
  if (!color) return "None";
  return `#${color.toString(16).padStart(6, "0").toUpperCase()}`;
}

function formatBadges(flags = []) {
  const badgeMap = {
    Staff: "<:Staff:1486088043373789324>",
    Partner: "<:discordpartner:1485856247591997470>",
    Hypesquad: "<:hypesquadevents:1485854115102986260>",
    BugHunterLevel1: "<:discordbughunter:1486089501146353768>",
    BugHunterLevel2: "<:bughuntergold:1485854044353204224>",
    HypeSquadOnlineHouse1: "<:hypesquadbravery:1485853974262321242>",
    HypeSquadOnlineHouse2: "<:Brilliance:1486088638776479884>",
    HypeSquadOnlineHouse3: "<:hypesquadbalance:1485853862899224667>",
    PremiumEarlySupporter: "<:earlysupporter:1485853825247088680>",
    VerifiedDeveloper: "<:earlyverifiedbotdeveloper:1486091043811365026>",
    CertifiedModerator: "<:moderatorprogramsalumni:1486090665631682622>",
  };

  if (!flags.length) return "None";

  const badgeList = flags
    .map((flag) => badgeMap[flag])
    .filter(Boolean)
    .join(" ");

  return badgeList || "None";
}

async function getGuildTagData(user, client) {
  const primaryGuild = user.primaryGuild ?? null;
  if (!primaryGuild) return null;

  const tag = primaryGuild.tag ?? primaryGuild.identityGuildTag ?? null;

  const badge = primaryGuild.badge ?? primaryGuild.tagBadge ?? null;

  const identityEnabled = primaryGuild.identityEnabled ?? false;

  const guildId = primaryGuild.identityGuildId ?? null;

  let guildName = primaryGuild.identityGuildName ?? null;

  if (!guildName && guildId) {
    const guild =
      client.guilds.cache.get(guildId) ??
      (await client.guilds.fetch(guildId).catch(() => null));

    guildName = guild?.name ?? null;
  }

  let badgeIconURL = null;
  if (badge && guildId) {
    badgeIconURL = `https://cdn.discordapp.com/guild-tag-badges/${guildId}/${badge}.png?size=512`;
  }

  return {
    guildId,
    guildName,
    tag,
    badge,
    badgeIconURL,
    identityEnabled,
  };
}

function formatGuildTagDisplay(guildTagData) {
  if (!guildTagData || !guildTagData.tag) return "None";
  return guildTagData.tag;
}

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Show detailed information about a user")
  .setIntegrationTypes(
    ApplicationIntegrationType.GuildInstall,
    ApplicationIntegrationType.UserInstall,
  )
  .setContexts(
    InteractionContextType.Guild,
    InteractionContextType.BotDM,
    InteractionContextType.PrivateChannel,
  )
  .addUserOption((option) =>
    option
      .setName("user")
      .setDescription("The user to inspect")
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("raw")
      .setDescription("Show raw/plain user data instead of the fancy profile")
      .setRequired(false),
  );

export async function execute(interaction) {
  const t = interaction.t ?? getFixedT("en");
  try {
    const user = interaction.options.getUser("user") || interaction.user;
    const raw = interaction.options.getBoolean("raw") ?? false;

    const fetchedUser = await interaction.client.users.fetch(user.id, {
      force: true,
    });

    const member = interaction.guild
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;

    const avatar = fetchedUser.displayAvatarURL({
      size: 1024,
      extension: "png",
    });

    const banner = fetchedUser.bannerURL({
      size: 1024,
      extension: "png",
    });

    const flags = fetchedUser.flags ? fetchedUser.flags.toArray() : [];
    const badges = formatBadges(flags);

    const guildTagData = await getGuildTagData(fetchedUser, interaction.client);
    const guildTagDisplay = formatGuildTagDisplay(guildTagData);

    const createdAt = `<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:F>\n(<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:R>)`;

    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
      : t("userinfo.unknown");

    const highestRole =
      member?.roles?.highest &&
      interaction.guild &&
      member.roles.highest.id !== interaction.guild.id
        ? `<@&${member.roles.highest.id}>`
        : t("userinfo.none");

    const boosterSince = member?.premiumSinceTimestamp
      ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
      : t("userinfo.no");

    if (raw) {
      const rawData = {
        user: {
          id: fetchedUser.id,
          username: fetchedUser.username,
          globalName: fetchedUser.globalName ?? null,
          discriminator: fetchedUser.discriminator,
          tag: fetchedUser.tag,
          bot: fetchedUser.bot,
          system: fetchedUser.system ?? false,
          accentColor: fetchedUser.accentColor,
          accentColorHex: formatHex(fetchedUser.accentColor),
          avatar,
          banner: banner || null,
          createdTimestamp: fetchedUser.createdTimestamp,
          createdAt: new Date(fetchedUser.createdTimestamp).toISOString(),
          badges: flags,
          guildTag: guildTagData
            ? {
                display: guildTagDisplay,
                name: guildTagData.tag,
                badge: guildTagData.badge,
                badgeIconURL: guildTagData.badgeIconURL,
                guildId: guildTagData.guildId,
                guildName: guildTagData.guildName,
                identityEnabled: guildTagData.identityEnabled,
              }
            : null,
          primaryGuild: fetchedUser.primaryGuild ?? null,
        },
        guild: member
          ? {
              nickname: member.nickname ?? null,
              joinedTimestamp: member.joinedTimestamp ?? null,
              joinedAt: member.joinedTimestamp
                ? new Date(member.joinedTimestamp).toISOString()
                : null,
              premiumSinceTimestamp: member.premiumSinceTimestamp ?? null,
              premiumSince: member.premiumSinceTimestamp
                ? new Date(member.premiumSinceTimestamp).toISOString()
                : null,
              highestRole:
                member.roles?.highest?.id !== interaction.guild.id
                  ? {
                      id: member.roles.highest.id,
                      name: member.roles.highest.name,
                    }
                  : null,
            }
          : null,
      };

      return await interaction.reply({
        content: `## ${t("userinfo.rawTitle")}\n\`\`\`json\n${JSON.stringify(rawData, null, 2).slice(0, 3900)}\n\`\`\``,
        flags: 64,
      });
    }

    const mainText = [
      `# ${t("userinfo.profileTitle", { username: fetchedUser.username })}`,
      "",
      `**${t("userinfo.user")}**`,
      `${fetchedUser.tag}`,
      `\`${fetchedUser.id}\``,
      "",
      `**${t("userinfo.displayName")}:** ${fetchedUser.globalName || t("userinfo.none")}`,
      `**${t("userinfo.guildTag")}:** ${guildTagDisplay}`,
      `**${t("userinfo.bot")}:** ${fetchedUser.bot ? t("userinfo.yes") : t("userinfo.no")}`,
      `**${t("userinfo.accentColor")}:** ${formatHex(fetchedUser.accentColor)}`,
      `**${t("userinfo.badges")}:** ${badges}`,
      "",
      `**${t("userinfo.accountCreated")}:**`,
      `${createdAt}`,
    ].join("\n");

    const container = new ContainerBuilder()
      .setAccentColor(fetchedUser.accentColor || 0x2b2d31)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(mainText),
          )
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
      );

    if (guildTagData) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `## ${t("userinfo.guildTagTitle")}`,
              "",
              `**${t("userinfo.tagName")}:** ${guildTagData.tag || t("userinfo.none")}`,
              `**${t("userinfo.guildName")}:** ${guildTagData.guildName || t("userinfo.unknown")}`,
              `**${t("userinfo.guildId")}:** ${guildTagData.guildId || t("userinfo.unknown")}`,
              `**${t("userinfo.identityEnabled")}:** ${guildTagData.identityEnabled ? t("userinfo.yes") : t("userinfo.no")}`,
            ].join("\n"),
          ),
        );

      if (guildTagData.badgeIconURL) {
        container.addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(guildTagData.badgeIconURL),
          ),
        );
      }
    }

    if (member) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `## ${t("userinfo.serverInfo")}`,
              "",
              `**${t("userinfo.joinedServer")}:**`,
              `${joinedAt}`,
              "",
              `**${t("userinfo.nickname")}:** ${member.nickname || t("userinfo.none")}`,
              `**${t("userinfo.highestRole")}:** ${highestRole}`,
              `**${t("userinfo.serverBooster")}:** ${boosterSince}`,
            ].join("\n"),
          ),
        );
    }

    if (banner) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`## ${t("userinfo.banner")}`),
        )
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(banner),
          ),
        );
    }

    const buttons = [
      new ButtonBuilder()
        .setLabel(t("userinfo.avatarUrl"))
        .setStyle(ButtonStyle.Link)
        .setURL(avatar),
    ];

    if (banner) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("userinfo.bannerUrl"))
          .setStyle(ButtonStyle.Link)
          .setURL(banner),
      );
    }

    if (guildTagData?.badgeIconURL) {
      buttons.push(
        new ButtonBuilder()
          .setLabel(t("userinfo.guildTagBadge"))
          .setStyle(ButtonStyle.Link)
          .setURL(guildTagData.badgeIconURL),
      );
    }

    buttons.push(
      new ButtonBuilder()
        .setLabel(t("userinfo.profile"))
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${fetchedUser.id}`),
    );

    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(buttons),
    );

    await interaction.reply({
      flags: MessageFlags.IsComponentsV2,
      components: [container],
    });
  } catch (error) {
    console.error("userinfo error:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction
        .followUp({
          content: t("userinfo.error"),
          flags: 64,
        })
        .catch(() => {});
    } else {
      await interaction
        .reply({
          content: t("userinfo.error"),
          flags: 64,
        })
        .catch(() => {});
    }
  }
}
