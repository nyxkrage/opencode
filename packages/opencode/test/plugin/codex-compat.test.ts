import { describe, expect, test } from "bun:test"
import CodexPlugin, { CODEX_SYSTEM_PROMPT } from "../../../../plugins/codex"

const canonicalTools = [
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "apply_patch",
  "question",
  "todowrite",
  "skill",
] as const

describe("plugin.codex compatibility", () => {
  test("exposes Codex-style tools only for configured models", async () => {
    const hooks = await CodexPlugin.server({} as never, {
      providers: ["openai", "kimi-for-coding"],
      models: ["gpt-5.6-sol", "k3"],
    })
    const other: { tools: Array<{ readonly id: string; name: string; enabled: boolean }> } = {
      tools: canonicalTools.map((id) => ({ id, name: id, enabled: id !== "apply_patch" })),
    }
    await hooks["tool.materialize"]?.({ model: { providerID: "anthropic", modelID: "claude-opus" } }, other)
    expect(other.tools.filter((tool) => tool.enabled).map((tool) => tool.name)).toEqual(
      canonicalTools.filter((name) => name !== "apply_patch"),
    )

    const target: { tools: Array<{ readonly id: string; name: string; enabled: boolean }> } = {
      tools: canonicalTools.map((id) => ({ id, name: id, enabled: id !== "apply_patch" })),
    }
    await hooks["tool.materialize"]?.({ model: { providerID: "kimi-for-coding", modelID: "k3" } }, target)
    expect(target.tools.filter((tool) => tool.enabled).map((tool) => tool.name)).toEqual([
      "exec_command",
      "apply_patch",
      "request_user_input",
      "update_plan",
      "skill",
    ])
    await hooks["tool.materialize"]?.({ model: { providerID: "kimi-for-coding", modelID: "k3" } }, target)
    expect(target.tools.filter((tool) => tool.enabled).map((tool) => tool.name)).toEqual([
      "exec_command",
      "apply_patch",
      "request_user_input",
      "update_plan",
      "skill",
    ])
  })

  test("replaces the agent prompt while preserving durable context", async () => {
    const hooks = await CodexPlugin.server({} as never, { providers: ["openai"] })
    const other = { system: ["OpenCode agent prompt", "Durable context"] }
    await hooks["experimental.chat.system.materialize"]?.(
      { model: { providerID: "anthropic", id: "claude-opus" } as never },
      other,
    )
    expect(other.system).toEqual(["OpenCode agent prompt", "Durable context"])

    const target = { system: ["OpenCode agent prompt", "Durable context"] }
    await hooks["experimental.chat.system.materialize"]?.(
      { model: { providerID: "openai", id: "gpt-5.6-sol" } as never },
      target,
    )
    expect(target.system).toEqual([CODEX_SYSTEM_PROMPT, "Durable context"])
    expect(CODEX_SYSTEM_PROMPT).toContain("You are Codex, a coding agent running inside OpenCode")
    expect(CODEX_SYSTEM_PROMPT).toContain("Pass the patch text directly in its freeform Lark grammar")
    expect(CODEX_SYSTEM_PROMPT).toContain("call `update_plan` with the complete current `todos` list")
    expect(CODEX_SYSTEM_PROMPT).toContain("a `priority` of `high`, `medium`, or `low`")
    expect(CODEX_SYSTEM_PROMPT).not.toContain(`{"command":["apply_patch"`)
    expect(CODEX_SYSTEM_PROMPT).not.toContain("provide an `explanation`")
  })

  test("targets GPT models at or above a configured version floor", async () => {
    const hooks = await CodexPlugin.server({} as never, {
      providers: ["openai"],
      minimumGPTVersion: "5.2",
    })
    const tools = async (providerID: string, modelID: string) => {
      const output: { tools: Array<{ readonly id: string; name: string; enabled: boolean }> } = {
        tools: canonicalTools.map((id) => ({ id, name: id, enabled: id !== "apply_patch" })),
      }
      await hooks["tool.materialize"]?.({ model: { providerID, modelID } }, output)
      return output.tools.filter((tool) => tool.enabled).map((tool) => tool.name)
    }

    expect(await tools("openai", "gpt-5.1")).toContain("bash")
    expect(await tools("openai", "gpt-5.2")).toContain("exec_command")
    expect(await tools("openai", "gpt-5.3-codex-spark")).toContain("exec_command")
    expect(await tools("openai", "gpt-5.6-sol-fast")).toContain("exec_command")
    expect(await tools("openai", "gpt-6")).toContain("exec_command")
    expect(await tools("openai", "gpt-oss-120b")).toContain("bash")
    expect(await tools("kimi-for-coding", "gpt-5.6-sol")).toContain("bash")
  })
})
