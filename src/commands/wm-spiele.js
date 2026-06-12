import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('wm-spiele')
    .setDescription('Zeigt die aktuellen oder anstehenden Spiele der WM 2026.');

export async function execute(interaction) {
    await interaction.deferReply();
    try {
        const response = await fetch('https://worldcup26.ir/get/games');
        if (!response.ok) throw new Error('API nicht erreichbar');
        
        const rawData = await response.json();
        const matches = Array.isArray(rawData) ? rawData : (rawData.data || rawData.games || []);

        if (!matches.length) {
            return interaction.editReply('Aktuell keine Spieldaten verfügbar.');
        }

        const embed = new EmbedBuilder()
            .setTitle('🏆 WM 2026 – Spielplan')
            .setColor('#0F172A');

        matches.slice(0, 5).forEach(match => {
            const homeTeam = match.home_team_en || match.homeTeam?.name || match.home_team || 'Team 1';
            const awayTeam = match.away_team_en || match.awayTeam?.name || match.away_team || 'Team 2';
            const status = match.status || 'Geplant';
            
            embed.addFields({
                name: `${homeTeam} vs. ${awayTeam}`,
                value: `**Status:** ${status}\n**Ergebnis:** ${match.home_score || 0} - ${match.away_score || 0}`,
                inline: false
            });
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply('Fehler beim Abrufen der Spiele von worldcup26.ir.');
    }
}