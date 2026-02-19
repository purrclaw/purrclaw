function ensureService(reminderService) {
  if (!reminderService) {
    throw new Error("Reminder service is not configured");
  }
}

const reminderCreateTool = (reminderService) => ({
  name: "reminder_create",
  description: "Create a reminder for the current chat after N seconds",
  parameters: {
    type: "object",
    properties: {
      text: { type: "string", description: "Reminder text" },
      in_seconds: { type: "integer", description: "Seconds from now" },
    },
    required: ["text", "in_seconds"],
  },
  async execute(args, context = {}) {
    ensureService(reminderService);
    const text = String(args?.text || "").trim();
    const inSeconds = Number(args?.in_seconds || 0);
    if (!text) return { forLLM: "text is required", forUser: "text is required", isError: true };
    if (!Number.isFinite(inSeconds) || inSeconds <= 0) {
      return {
        forLLM: "in_seconds must be a positive integer",
        forUser: "in_seconds must be a positive integer",
        isError: true,
      };
    }

    const reminder = await reminderService.create({
      sessionKey: context.sessionKey,
      channel: context.channel,
      chatId: context.chatId,
      text,
      inSeconds,
    });

    return {
      forLLM: `Reminder created: id=${reminder.id}, due_in=${Math.round((reminder.dueAt - Date.now()) / 1000)}s`,
      forUser: `✅ Reminder set for ${inSeconds}s: ${text}`,
      isError: false,
    };
  },
});

const reminderListTool = (reminderService) => ({
  name: "reminder_list",
  description: "List pending reminders for the current chat/session",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  async execute(args, context = {}) {
    ensureService(reminderService);
    const reminders = await reminderService.listBySession(context.sessionKey);
    if (!reminders.length) {
      return { forLLM: "No pending reminders.", forUser: "No pending reminders.", isError: false };
    }

    const out = reminders
      .map((r) => `${r.id} | in ${Math.max(0, Math.round((r.dueAt - Date.now()) / 1000))}s | ${r.text}`)
      .join("\n");

    return { forLLM: out, forUser: out, isError: false };
  },
});

const reminderDeleteTool = (reminderService) => ({
  name: "reminder_delete",
  description: "Delete a pending reminder by id",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Reminder ID" },
    },
    required: ["id"],
  },
  async execute(args, context = {}) {
    ensureService(reminderService);
    const id = String(args?.id || "").trim();
    if (!id) return { forLLM: "id is required", forUser: "id is required", isError: true };

    const deleted = await reminderService.deleteById(id, context.sessionKey);
    if (!deleted) {
      return { forLLM: `Reminder not found: ${id}`, forUser: `Reminder not found: ${id}`, isError: false };
    }

    return { forLLM: `Reminder deleted: ${id}`, forUser: `✅ Reminder deleted: ${id}`, isError: false };
  },
});

module.exports = { reminderCreateTool, reminderListTool, reminderDeleteTool };
