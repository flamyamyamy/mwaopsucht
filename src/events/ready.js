import { REST, Routes } from "discord.js";

export default function readyEvent(client) {
  client.once("ready", async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    try {
      await rest.put(Routes.applicationCommands(client.user.id), {
        body: client.commandsArray,
      });
      console.log("✅ Global slash commands registered");
    } catch (err) {
      console.error("❌ Failed to register commands:", err);
    }
  });
}