export const builtinRecipes = [
  {
    id: "discord-channel-persona",
    name: "Discord channel persona",
    description: "Inject different system prompt for one Discord channel",
    version: "1.0.0",
    tags: ["discord", "persona", "beginner"],
    difficulty: "easy",
    params: [
      {
        id: "guild_id",
        label: "Guild ID",
        type: "string",
        required: true,
        pattern: "^[0-9]+$",
        minLength: 17,
        maxLength: 20,
        placeholder: "Copy guild id",
      },
      {
        id: "channel_id",
        label: "Channel ID",
        type: "string",
        required: true,
        pattern: "^[0-9]+$",
        minLength: 17,
        maxLength: 20,
        placeholder: "Copy channel id",
      },
      {
        id: "persona",
        label: "Persona description",
        type: "textarea",
        required: true,
        minLength: 1,
        placeholder: "You are...",
      },
    ],
    patchTemplate: `{
      "channels": {
        "discord": {
          "guilds": {
            "{{guild_id}}": {
              "channels": {
                "{{channel_id}}": {
                  "systemPrompt": "{{persona}}"
                }
              }
            }
          }
        }
      }
    }`,
    impactCategory: "low",
    impactSummary: "Add/modify channel persona",
  },
];
