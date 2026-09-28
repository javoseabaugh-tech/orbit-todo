export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("OK");
    }

    const url = new URL(request.url);
    const token = url.pathname.slice(1);
    if (!token) {
      return new Response("Missing token", { status: 400 });
    }

    const update = await request.json();
    const chatId = update?.message?.chat?.id;
    const firstName = update?.message?.chat?.first_name || "there";

    if (chatId) {
      const message = `Hi ${firstName}! Your Chat ID is:\n\n${chatId}\n\nCopy that number and paste it into Orbit's Notification Settings.`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
    }

    return new Response("OK");
  },
};
