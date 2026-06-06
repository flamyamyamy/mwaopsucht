import "dotenv/config";
import { Client, GatewayIntentBits, Collection } from "discord.js";
import { loadCommands } from "./src/utils/loadCommands.js";
import interactionCreateEvent from "./src/events/interactionCreate.js";
import readyEvent from "./src/events/ready.js";
import mediaOnlyEvent from "./src/events/mediaOnly.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();

async function start() {
  try {
    await loadCommands(client);

    readyEvent(client);
    interactionCreateEvent(client);
    mediaOnlyEvent(client);

    process.on("unhandledRejection", (err) =>
      console.error("Unhandled rejection:", err)
    );
    process.on("uncaughtException", (err) =>
      console.error("Uncaught exception:", err)
    );

    await client.login(process.env.TOKEN);
  } catch (err) {
    console.error("❌ Startup error:", err);
    process.exit(1);
  }
}

start();