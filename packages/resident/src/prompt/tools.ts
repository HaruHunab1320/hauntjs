import type { ToolDefinition } from "../model/types.js";

export const ACTION_TOOLS: ToolDefinition[] = [
  {
    name: "speak",
    description:
      "Say something aloud in the current room. All guests in the room will hear it. Use this for greetings, conversation, commentary, or announcements.",
    parameters: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "What to say",
        },
        audience: {
          type: "string",
          description:
            'Either "all" to address everyone in the room, or a specific guest ID to address one person',
          default: "all",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "move",
    description:
      "Move to a different room in the place. Only rooms connected to your current room are reachable.",
    parameters: {
      type: "object",
      properties: {
        toRoom: {
          type: "string",
          description: "The ID of the room to move to",
        },
      },
      required: ["toRoom"],
    },
  },
  {
    name: "act",
    description:
      "Interact with an affordance (object) in the current room — light a fireplace, leave a note on a desk, etc.",
    parameters: {
      type: "object",
      properties: {
        affordanceId: {
          type: "string",
          description: "The ID of the affordance to interact with",
        },
        actionId: {
          type: "string",
          description: "The specific action to perform on the affordance",
        },
      },
      required: ["affordanceId", "actionId"],
    },
  },
  {
    name: "note",
    description:
      "Write an internal note to yourself about a guest or your own state. Notes are private — no one else sees them. Use these to remember important details.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The content of the note",
        },
        about: {
          type: "string",
          description: 'A guest ID this note is about, or "self" if it\'s about you',
        },
      },
      required: ["content", "about"],
    },
  },
  {
    name: "wait",
    description:
      "Do nothing. Choose this when no action is warranted — when the moment doesn't call for your involvement, or when silence is more appropriate than speech. Most tick events should result in waiting.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
];
