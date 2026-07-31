# Plugins

## Codex compatibility

`codex.ts` gives selected models a Codex-like system prompt and tool catalog. It defaults to every model from the
`openai` provider. Configure exact providers or models with plugin options:

```jsonc
{
  "plugin": [
    [
      "./plugins/codex.ts",
      {
        "providers": ["openai", "github-copilot"],
        "minimumGPTVersion": "5.2",
      },
    ],
  ],
}
```

Plugin paths are relative to the configuration file that declares them. From `.opencode/opencode.jsonc`, use
`../plugins/codex.ts`. The plugin uses the V1 server hook API, so it applies to the normal TUI, `run`, and web app
session paths. `models` selects exact model IDs, while `minimumGPTVersion` selects GPT models at or above that
version, including suffixed variants such as `gpt-5.4-mini`.

When active, the plugin:

- renames `bash` to `exec_command`, `question` to `request_user_input`, and `todowrite` to `update_plan`;
- removes `read`, `write`, `edit`, `glob`, and `grep`;
- keeps `apply_patch` for file mutations, using its freeform Lark grammar with OpenAI Responses and a `{ text }`
  parameter fallback elsewhere;
- replaces the ordinary agent prompt while preserving durable environment and repository context.

The prompt in `codex-prompt.md` is adapted from OpenAI Codex's current default base instructions at commit
`4d1f66bf8199713e4a77ad55458bc6e3dcbef5c5`. The adaptation only changes assumptions that differ in OpenCode:
tool names and schemas, permission handling, durable context placement, and client rendering. Its attribution and
Apache-2.0 license are preserved in `codex-prompt.NOTICE` and `codex-prompt.LICENSE`.
