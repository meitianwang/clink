import { QQChannel } from "./channels/qq.js";
import { WeComChannel } from "./channels/wecom.js";
import { getChannelName } from "./config.js";
import { ChatSessionManager } from "./core.js";
import type { Channel } from "./channels/base.js";

const CHANNELS: Record<string, new () => Channel> = {
  qq: QQChannel,
  wecom: WeComChannel,
};

async function start(): Promise<void> {
  const channelName = getChannelName();
  const ChannelCls = CHANNELS[channelName];

  if (!ChannelCls) {
    console.error(`Unknown channel: ${channelName}`);
    console.error(`Available: ${Object.keys(CHANNELS).join(", ")}`);
    console.error("Run 'cpaw setup' to configure.");
    process.exit(1);
  }

  const sessions = new ChatSessionManager();
  const channel = new ChannelCls();

  const handler = async (
    sessionKey: string,
    text: string,
  ): Promise<string | null> => {
    if (["/new", "/reset", "/clear"].includes(text)) {
      await sessions.reset(sessionKey);
      return "Session reset.";
    }
    return sessions.chat(sessionKey, text);
  };

  try {
    await channel.start(handler);
  } finally {
    await sessions.close();
  }
}

function main(): void {
  const cmd = process.argv[2] ?? "start";

  switch (cmd) {
    case "setup":
      import("./setup-wizard.js").then((m) => m.runSetup());
      break;
    case "doctor":
      import("./doctor.js").then((m) => m.runDoctor());
      break;
    case "start":
      start().catch((err) => {
        console.error(err);
        process.exit(1);
      });
      break;
    default:
      console.log(
        "Cpaw — Use Claude Code from any messaging platform\n\n" +
          "Usage: cpaw [command]\n\n" +
          "Commands:\n" +
          "  setup    Interactive setup wizard\n" +
          "  start    Start the bot (default)\n" +
          "  doctor   Diagnose environment issues\n",
      );
      process.exit(1);
  }
}

main();
