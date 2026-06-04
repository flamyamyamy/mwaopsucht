import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

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
];

export const data = new SlashCommandBuilder()
  .setName("hilfe")
  .setDescription("Zeigt alle verfügbaren Befehle des Bots");

export async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📖 OPSUCHT Bot – Befehle")
    .setDescription("Alle verfügbaren Slash-Commands:")
    .addFields(
      COMMANDS.map((c) => ({ name: c.name, value: c.desc, inline: false }))
    )
    .setFooter({ text: "Daten von api.opsucht.net" })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], flags: 64 });
}