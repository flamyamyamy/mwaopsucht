import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('wm-teams')
        .setDescription('Listet die qualifizierten Teams der WM 2026 auf.'),
    async execute(interaction) {
        await interaction.deferReply();

        try {
            const response = await fetch('https://worldcup26.ir/get/teams');
            if (!response.ok) throw new Error('API Fehler');

            const rawData = await response.json();
            const teams = Array.isArray(rawData) ? rawData : (rawData.data || rawData.teams || []);

            // Alle Teamnamen in einem Array sammeln
            const teamNames = teams.map(team => team.name_en || team.name || 'Unbekannt');

            const embed = new EmbedBuilder()
                .setTitle(`🏳️ WM 2026 – Alle ${teams.length} Teams`)
                .setColor('#0F172A')
                // .join(', ') reiht die Länder sauber aneinander
                .setDescription(teamNames.join(', ') || 'Keine Teams gefunden.');

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error(error);
            await interaction.editReply('Fehler beim Abrufen der Teams.');
        }
    },
};