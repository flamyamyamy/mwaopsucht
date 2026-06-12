import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('wm-gruppen')
    .setDescription('Zeigt alle WM-Gruppen und ihre Teams.');

export async function execute(interaction) {
    await interaction.deferReply();
    try {
        const response = await fetch('https://worldcup26.ir/get/groups');
        if (!response.ok) throw new Error('API Fehler');

        const rawData = await response.json();
        const groups = Array.isArray(rawData) ? rawData : (rawData.data || rawData.groups || []);

        const embed = new EmbedBuilder()
            .setTitle('📊 WM 2026 – Gruppenübersicht')
            .setColor('#0F172A');

        groups.slice(0, 6).forEach(group => {
            const groupName = group.name || group.letter || 'Unbekannt';
            const teams = group.teams || [];
            const teamNames = teams.map(t => t.name_en || t.name || 'Unbekannt').join('\n');

            embed.addFields({
                name: `Gruppe ${groupName}`,
                value: teamNames || 'Keine Teams gefunden',
                inline: true
            });
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error(error);
        await interaction.editReply('Konnte die Gruppendaten nicht laden.');
    }
}