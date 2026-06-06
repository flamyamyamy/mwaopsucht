// Channel-ID hier eintragen (z.B. aus .env oder direkt als String)
const MEDIA_ONLY_CHANNEL_ID = process.env.MEDIA_ONLY_CHANNEL_ID;

export default function mediaOnlyEvent(client) {
  client.on("messageCreate", async (message) => {
    // Bots ignorieren
    if (message.author.bot) return;

    // Nur im definierten Channel
    if (message.channelId !== MEDIA_ONLY_CHANNEL_ID) return;

    const hasImage = message.attachments.some((a) => {
      const type = a.contentType ?? "";
      return type.startsWith("image/") || type.startsWith("video/");
    });

    if (hasImage) {
      // Foto/Video vorhanden → Thread erstellen
      try {
        await message.startThread({
          name: `🗨️ Kommentarthread zu ${message.author.username}s Bild`,
          autoArchiveDuration: 1440, // 24h, dann auto-archiviert
        });
      } catch (err) {
        console.error("❌ Thread konnte nicht erstellt werden:", err);
      }
    } else {
      // Nur Text, kein Bild → direkt löschen
      try {
        await message.delete();
      } catch (err) {
        console.error("❌ Nachricht konnte nicht gelöscht werden:", err);
      }
    }
  });
}
