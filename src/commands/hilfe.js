import { SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MessageFlags } from "discord.js";

const COMMANDS = [
  { name: "/auktionen",        desc: "Aktive Auktionen durchsuchen & blättern" },
  { name: "/auktion-info",     desc: "Details zu einer Auktion per UID" },
  { name: "/auktion-suche",    desc: "Auktionen nach Itemname suchen & sortieren" },
  { name: "/auktion-top",      desc: "Top-Auktionen nach Preis, Geboten oder Laufzeit" },
  { name: "/markt-preis",      desc: "Aktuellen Marktpreis eines Items anzeigen" },
  { name: "/markt-verlauf",    desc: "Preisverlauf eines Items als Diagramm" },
  { name: "/markt-uebersicht", desc: "Alle Marktkategorien im Überblick" },
  { name: "/haendler",         desc: "Händler-Wechselkurse (Items → OPShards)" },
  { name: "/hilfe",            desc: "Diese Hilfe anzeigen" },
  { name: "/search",            desc: "Suche nach einem Item und zeige Statistiken" },

];

export const data = new SlashCommandBuilder()
  .setName("hilfe")
  .setDescription("Zeigt alle verfügbaren Befehle des Bots");

export async function execute(interaction) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("# 📖 OPSUCHT Bot – Befehle\n\nAlle verfügbaren Slash-Commands:")
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  const commandLines = COMMANDS.map((c) => `**${c.name}** — ${c.desc}`).join("\n");
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(commandLines)
  );

  container.addSeparatorComponents(new SeparatorBuilder());
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent("Daten von api.opsucht.net")
  );

  await interaction.reply({
    components: [container],
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
  });
}
