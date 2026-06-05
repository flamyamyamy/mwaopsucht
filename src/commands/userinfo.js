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

function formatHex(color) {
  if (!color) return "Keine";
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

  if (!flags.length) return "Keine";
  return flags.map((f) => badgeMap[f]).filter(Boolean).join(" ") || "Keine";
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

  return { guildId, guildName, tag, badge, badgeIconURL, identityEnabled };
}

function formatGuildTagDisplay(guildTagData) {
  if (!guildTagData || !guildTagData.tag) return "Keiner";
  return guildTagData.tag;
}

export const data = new SlashCommandBuilder()
  .setName("userinfo")
  .setDescription("Zeigt detaillierte Informationen über einen Nutzer an")
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
    option.setName("nutzer").setDescription("Der zu prüfende Nutzer").setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName("roh")
      .setDescription("Rohdaten des Nutzers anzeigen")
      .setRequired(false),
  );

export async function execute(interaction) {
  try {
    const user = interaction.options.getUser("nutzer") || interaction.user;
    const raw = interaction.options.getBoolean("roh") ?? false;

    const fetchedUser = await interaction.client.users.fetch(user.id, { force: true });
    const member = interaction.guild
      ? await interaction.guild.members.fetch(user.id).catch(() => null)
      : null;

    const avatar = fetchedUser.displayAvatarURL({ size: 1024, extension: "png" });
    const banner = fetchedUser.bannerURL({ size: 1024, extension: "png" });
    const flags = fetchedUser.flags ? fetchedUser.flags.toArray() : [];
    const badges = formatBadges(flags);
    const guildTagData = await getGuildTagData(fetchedUser, interaction.client);
    const guildTagDisplay = formatGuildTagDisplay(guildTagData);

    const createdAt = `<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:F>\n(<t:${Math.floor(fetchedUser.createdTimestamp / 1000)}:R>)`;
    const joinedAt = member?.joinedTimestamp
      ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
      : "Unbekannt";

    const highestRole =
      member?.roles?.highest && interaction.guild && member.roles.highest.id !== interaction.guild.id
        ? `<@&${member.roles.highest.id}>`
        : "Keine";

    const boosterSince = member?.premiumSinceTimestamp
      ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>`
      : "Nein";

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
              joinedAt: member.joinedTimestamp ? new Date(member.joinedTimestamp).toISOString() : null,
              premiumSinceTimestamp: member.premiumSinceTimestamp ?? null,
              premiumSince: member.premiumSinceTimestamp
                ? new Date(member.premiumSinceTimestamp).toISOString()
                : null,
              highestRole:
                member.roles?.highest?.id !== interaction.guild.id
                  ? { id: member.roles.highest.id, name: member.roles.highest.name }
                  : null,
            }
          : null,
      };

      return await interaction.reply({
        content: `## Rohdaten des Nutzers\n\`\`\`json\n${JSON.stringify(rawData, null, 2).slice(0, 3900)}\n\`\`\``,
        flags: 64,
      });
    }

    const mainText = [
      `# Profil von ${fetchedUser.username}`,
      "",
      `**Nutzer**`,
      `${fetchedUser.tag}`,
      `\`${fetchedUser.id}\``,
      "",
      `**Anzeigename:** ${fetchedUser.globalName || "Keiner"}`,
      `**Server-Tag:** ${guildTagDisplay}`,
      `**Bot:** ${fetchedUser.bot ? "Ja" : "Nein"}`,
      `**Akzentfarbe:** ${formatHex(fetchedUser.accentColor)}`,
      `**Abzeichen:** ${badges}`,
      "",
      `**Konto erstellt:**`,
      `${createdAt}`,
    ].join("\n");

    const container = new ContainerBuilder()
      .setAccentColor(fetchedUser.accentColor || 0x2b2d31)
      .addSectionComponents(
        new SectionBuilder()
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(mainText))
          .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar)),
      );

    if (guildTagData) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `## Server-Tag`,
              "",
              `**Tag-Name:** ${guildTagData.tag || "Keiner"}`,
              `**Servername:** ${guildTagData.guildName || "Unbekannt"}`,
              `**Server-ID:** ${guildTagData.guildId || "Unbekannt"}`,
              `**Identität aktiv:** ${guildTagData.identityEnabled ? "Ja" : "Nein"}`,
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
              `## Serverinformationen`,
              "",
              `**Beigetreten:**`,
              `${joinedAt}`,
              "",
              `**Spitzname:** ${member.nickname || "Keiner"}`,
              `**Höchste Rolle:** ${highestRole}`,
              `**Server-Booster:** ${boosterSince}`,
            ].join("\n"),
          ),
        );
    }

    if (banner) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Banner`))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(banner)),
        );
    }

    const buttons = [
      new ButtonBuilder().setLabel("Avatar-URL").setStyle(ButtonStyle.Link).setURL(avatar),
    ];

    if (banner) {
      buttons.push(new ButtonBuilder().setLabel("Banner-URL").setStyle(ButtonStyle.Link).setURL(banner));
    }

    if (guildTagData?.badgeIconURL) {
      buttons.push(
        new ButtonBuilder().setLabel("Tag-Abzeichen").setStyle(ButtonStyle.Link).setURL(guildTagData.badgeIconURL),
      );
    }

    buttons.push(
      new ButtonBuilder()
        .setLabel("Profil öffnen")
        .setStyle(ButtonStyle.Link)
        .setURL(`https://discord.com/users/${fetchedUser.id}`),
    );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));

    await interaction.reply({ flags: MessageFlags.IsComponentsV2, components: [container] });
  } catch (error) {
    console.error("userinfo-Fehler:", error);
    const reply = { content: "❌ Beim Abrufen der Nutzerinformationen ist ein Fehler aufgetreten.", flags: 64 };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
}