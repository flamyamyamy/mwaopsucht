import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";

export async function loadCommands(client) {
  const commandsPath = path.join(process.cwd(), "src", "commands");

  const getFiles = (dir) => {
    const result = [];
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) result.push(...getFiles(fullPath));
      else if (file.endsWith(".js")) result.push(fullPath);
    }
    return result;
  };

  client.commandsArray = [];

  for (const filePath of getFiles(commandsPath)) {
    try {
      const mod = await import(pathToFileURL(filePath).href);
      if (mod?.data && mod?.execute) {
        client.commands.set(mod.data.name, mod);
        client.commandsArray.push(mod.data.toJSON());
        console.log(`  ✅ Loaded: /${mod.data.name}`);
      } else {
        console.warn(`  ⚠️  Skipped (missing data/execute): ${filePath}`);
      }
    } catch (err) {
      console.error(`  ❌ Error loading: ${filePath}`, err);
    }
  }

  console.log(`\n=== ${client.commandsArray.length} commands loaded ===\n`);
}