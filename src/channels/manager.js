class ChannelManager {
  constructor(channels = []) {
    this.channels = channels;
  }

  async start() {
    for (const channel of this.channels) {
      await channel.start();
    }
  }

  async stop() {
    for (const channel of this.channels) {
      try {
        await channel.stop();
      } catch (err) {
        console.error(`[channel-manager] Failed to stop channel: ${err.message}`);
      }
    }
  }

  list() {
    return this.channels.map((c) => c.name || c.constructor.name);
  }
}

module.exports = { ChannelManager };
