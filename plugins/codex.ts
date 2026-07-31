import type { PluginModule } from "@opencode-ai/plugin"
import CODEX_SYSTEM_PROMPT from "./codex-prompt.md" with { type: "text" }

export { CODEX_SYSTEM_PROMPT }

export const REMOVED_TOOLS = ["read", "write", "edit", "glob", "grep"] as const

export const TOOL_ALIASES = [
  ["bash", "exec_command"],
  ["question", "request_user_input"],
  ["todowrite", "update_plan"],
] as const

export default {
  id: "codex-compat",
  server: async (_input, options) => {
    const providerIDs = stringList(options?.providers, ["openai"])
    const modelIDs = stringList(options?.models, [])
    const minimumGPTVersion =
      typeof options?.minimumGPTVersion === "string" ? gptVersion(options.minimumGPTVersion) : undefined
    const enabled = (model: { readonly providerID: string; readonly id: string }) =>
      providerIDs.includes(model.providerID) &&
      (modelIDs.length === 0 && !minimumGPTVersion
        ? true
        : modelIDs.includes(model.id) || gptAtLeast(model.id, minimumGPTVersion))

    return {
      "tool.materialize": ({ model }, output) => {
        if (!enabled({ providerID: model.providerID, id: model.modelID })) return Promise.resolve()
        const patch = output.tools.find((tool) => tool.id === "apply_patch")
        if (patch) patch.enabled = true
        const names = new Set(output.tools.filter((tool) => tool.enabled).map((tool) => tool.name))
        REMOVED_TOOLS.forEach((name) => {
          const tool = output.tools.find((tool) => tool.id === name)
          if (!tool) return
          tool.enabled = false
          names.delete(tool.name)
        })
        TOOL_ALIASES.forEach(([name, alias]) => {
          const tool = output.tools.find((tool) => tool.id === name)
          if (!tool?.enabled) return
          if (tool.name === alias) return
          if (names.has(alias)) {
            tool.enabled = false
            names.delete(tool.name)
            return
          }
          names.delete(tool.name)
          tool.name = alias
          names.add(alias)
        })
        return Promise.resolve()
      },
      "experimental.chat.system.materialize": (input, output) => {
        if (!enabled(input.model)) return Promise.resolve()
        output.system.splice(0, 1, CODEX_SYSTEM_PROMPT)
        return Promise.resolve()
      },
    }
  },
} satisfies PluginModule

function stringList(input: unknown, fallback: readonly string[]) {
  if (!Array.isArray(input)) return [...fallback]
  return input.filter((value): value is string => typeof value === "string")
}

function gptAtLeast(modelID: string, minimum: readonly [number, number] | undefined) {
  if (!minimum) return false
  if (!modelID.toLowerCase().startsWith("gpt-")) return false
  const version = gptVersion(modelID)
  if (!version) return false
  return version[0] > minimum[0] || (version[0] === minimum[0] && version[1] >= minimum[1])
}

function gptVersion(modelID: string): readonly [number, number] | undefined {
  const match = /^(?:gpt-)?(\d+)(?:\.(\d+))?(?:-|$)/i.exec(modelID)
  if (!match) return
  return [Number(match[1]), Number(match[2] ?? 0)]
}
