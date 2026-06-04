export default function interactionCreateEvent(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
          await command.execute(interaction, client);
        } catch (err) {
          console.error(`Error in /${interaction.commandName}:`, err);
          const msg = "❌ Es ist ein Fehler aufgetreten. Bitte versuche es später nochmal.";
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: msg, flags: 64 }).catch(() => {});
          } else {
            await interaction.reply({ content: msg, flags: 64 }).catch(() => {});
          }
        }
        return;
      }

      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command?.autocomplete) {
          await command.autocomplete(interaction).catch((err) =>
            console.error(`Autocomplete error for /${interaction.commandName}:`, err)
          );
        }
      }
    } catch (err) {
      console.error("interactionCreate error:", err);
    }
  });
}