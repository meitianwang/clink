/**
 * QQ Bot channel: WebSocket connection via qq-group-bot SDK.
 * Auto-installs qq-group-bot if missing.
 */

import { execSync } from "node:child_process";
import { Channel, type Handler } from "./base.js";
import { loadQQBotConfig } from "../config.js";

export class QQChannel extends Channel {
  private cfg = loadQQBotConfig();

  async start(handler: Handler): Promise<void> {
    console.log("Cpaw QQ Bot channel starting...");

    let BotClass: new (config: Record<string, unknown>) => Record<string, unknown>;
    try {
      const mod = await import("qq-group-bot");
      BotClass = (mod.Bot ?? mod.QQBot) as typeof BotClass;
    } catch {
      console.log("[QQ] qq-group-bot not found, installing...");
      try {
        execSync("npm install -g qq-group-bot", { stdio: "inherit" });
        const mod = await import("qq-group-bot");
        BotClass = (mod.Bot ?? mod.QQBot) as typeof BotClass;
      } catch {
        console.error(
          "[QQ] Failed to install qq-group-bot.\n" +
            "Install manually: npm install -g qq-group-bot"
        );
        process.exit(1);
      }
    }

    const bot = new BotClass({
      appid: this.cfg.appid,
      secret: this.cfg.secret,
      intents: ["C2C_MESSAGE_CREATE", "GROUP_AT_MESSAGE_CREATE"],
      sandbox: true,
      removeAt: true,
      logLevel: "info",
      maxRetry: 10,
    }) as Record<string, Function>;

    await (bot.start as () => Promise<void>)();
    console.log("Cpaw QQ Bot online");

    // Private messages (C2C)
    bot.on("message.private", async (e: Record<string, unknown>) => {
      const content = ((e.content as string) ?? (e.raw_message as string) ?? "").trim();
      const userId = (e.user_openid ?? e.user_id ?? e.sender?.toString()) as string;
      if (!content || !userId) return;

      const sessionKey = `c2c:${userId}`;
      console.log(`[C2C] Received (${sessionKey}): ${content}`);

      try {
        const reply = await handler(sessionKey, content);
        if (reply === null) {
          console.log("[C2C] Message merged into batch, skipping reply");
          return;
        }
        console.log(`[C2C] Replying: ${reply.slice(0, 100)}...`);
        await (e.reply as (msg: string) => Promise<void>)(reply);
      } catch (err) {
        console.error(`[C2C] Error: ${err}`);
      }
    });

    // Group messages (@bot)
    bot.on("message.group", async (e: Record<string, unknown>) => {
      const content = ((e.content as string) ?? (e.raw_message as string) ?? "").trim();
      const groupId = (e.group_openid ?? e.group_id) as string;
      if (!content || !groupId) return;

      const sessionKey = `group:${groupId}`;
      console.log(`[Group] Received (${sessionKey}): ${content}`);

      try {
        const reply = await handler(sessionKey, content);
        if (reply === null) {
          console.log("[Group] Message merged into batch, skipping reply");
          return;
        }
        console.log(`[Group] Replying: ${reply.slice(0, 100)}...`);
        await (e.reply as (msg: string) => Promise<void>)(reply);
      } catch (err) {
        console.error(`[Group] Error: ${err}`);
      }
    });

    // Block forever
    await new Promise(() => {});
  }
}
