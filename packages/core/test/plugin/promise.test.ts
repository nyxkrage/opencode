import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { PluginHost } from "@opencode-ai/core/plugin/host"
import { PluginPromise } from "@opencode-ai/core/plugin/promise"
import { SessionHooks } from "@opencode-ai/core/session/hooks"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { Tool } from "@opencode-ai/core/tool/tool"
import { define } from "@opencode-ai/plugin/v2/promise"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

describe("fromPromise", () => {
  it.effect("loads a promise plugin and registers a transform hook", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const plugin = yield* PluginV2.Service
      const host = yield* PluginHost.make(plugin)

      const promisePlugin = define({
        id: "promise-example",
        setup: async (ctx) => {
          expect(ctx.options.mode).toBe("strict")
          await ctx.agent.transform((draft) => {
            draft.update("reviewer", (item) => {
              item.description = "Reviews code"
              item.mode = "subagent"
            })
          })
        },
      })

      const adapted = PluginPromise.fromPromise(promisePlugin)
      yield* adapted.effect({ ...host, options: { mode: "strict" } })

      expect(yield* agents.get(AgentV2.ID.make("reviewer"))).toMatchObject({
        description: "Reviews code",
        mode: "subagent",
      })
    }),
  )

  it.effect("disposes a hook registration on request", () =>
    Effect.gen(function* () {
      const agents = yield* AgentV2.Service
      const plugin = yield* PluginV2.Service
      const host = yield* PluginHost.make(plugin)

      const promisePlugin = define({
        id: "promise-dispose",
        setup: async (ctx) => {
          const registration = await ctx.agent.transform((draft) => {
            draft.update("temp", (item) => {
              item.description = "temporary"
            })
          })
          await registration.dispose()
        },
      })

      const adapted = PluginPromise.fromPromise(promisePlugin)
      yield* adapted.effect(host)

      expect(yield* agents.get(AgentV2.ID.make("temp"))).toBeUndefined()
    }),
  )

  it.effect("adapts model-specific tool materialization hooks", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const tools = yield* ToolRegistry.Service
      const host = yield* PluginHost.make(plugin)
      yield* tools.register({
        shell: Tool.make({
          description: "Run a shell command",
          input: Schema.Struct({ text: Schema.String }),
          output: Schema.String,
          execute: ({ text }) => Effect.succeed(text),
        }),
      })
      const promisePlugin = define({
        id: "promise-tools",
        setup: async (ctx) => {
          await ctx.tool.hook("materialize", ({ model, tools }) => {
            if (model.providerID === "openai") tools.rename("shell", "exec")
          })
        },
      })

      yield* PluginPromise.fromPromise(promisePlugin).effect(host)

      expect(
        (yield* tools.materialize([], { providerID: "openai", id: "gpt-5.4" })).definitions.map((tool) => tool.name),
      ).toEqual(["exec"])
    }),
  )

  it.effect("adapts system materialization hooks", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const hooks = yield* SessionHooks.Service
      const host = yield* PluginHost.make(plugin)
      const promisePlugin = define({
        id: "promise-system",
        setup: async (ctx) => {
          await ctx.session.hook("system.materialize", ({ model, system }) => {
            if (model.variant === "codex") system.append("Codex instructions")
          })
        },
      })

      yield* PluginPromise.fromPromise(promisePlugin).effect(host)
      const state = { parts: ["Base instructions"] }
      yield* hooks.materializeSystem({
        model: { providerID: "openai", id: "gpt-5.4", variant: "codex" },
        system: {
          list: () => [...state.parts],
          replace: (parts) => (state.parts = [...parts]),
          prepend: (part) => (state.parts = [part, ...state.parts]),
          append: (part) => (state.parts = [...state.parts, part]),
        },
      })

      expect(state.parts).toEqual(["Base instructions", "Codex instructions"])
    }),
  )
})
