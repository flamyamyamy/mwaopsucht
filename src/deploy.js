import "dotenv/config";
import { REST, Routes } from "discord.js";
import { Collection } from "discord.js";
import { loadCommands } from "./utils/loadCommands.js";

const client = { commands: new Collection(), commandsArray: [] };
await loadCommands(client);

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

try {
  console.log(`🚀 Registriere ${client.commandsArray.length} Slash-Commands...`);

  await rest.put(
    Routes.applicationCommands(process.env.CLIENT_ID),
    { body: client.commandsArray }
  );

  console.log("✅ Slash-Commands erfolgreich registriert.");
} catch (err) {
  console.error("❌ Fehler beim Registrieren:", err);
  process.exit(1);
}