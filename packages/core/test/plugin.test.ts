import { describe, expect } from "bun:test"
import { Effect, Exit, Fiber, Schema } from "effect"
import { define } from "@opencode-ai/plugin/v2/effect"
import { AgentV2 } from "@opencode-ai/core/agent"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { SessionHooks } from "@opencode-ai/core/session/hooks"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { Tool } from "@opencode-ai/core/tool/tool"
import { testEffect } from "./lib/effect"
import { PluginTestLayer } from "./plugin/fixture"

const it = testEffect(PluginTestLayer)

describe("PluginV2", () => {
  it.effect("waits for a plugin and returns immediately once active", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const id = PluginV2.ID.make("waited")
      const waiting = yield* plugins.wait(id).pipe(Effect.forkChild)

      yield* plugins.add(id, () => Effect.void)
      yield* Fiber.join(waiting)
      yield* plugins.wait(id)
    }),
  )

  it.effect("propagates plugin activation defects to waiters", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const id = PluginV2.ID.make("failed")
      const waiting = yield* plugins.wait(id).pipe(Effect.exit, Effect.forkChild)

      const added = yield* plugins.add(id, () => Effect.die("boom")).pipe(Effect.exit)
      const pending = yield* Fiber.join(waiting)
      const later = yield* plugins.wait(id).pipe(Effect.exit)

      expect(Exit.isFailure(added)).toBe(true)
      expect(Exit.isFailure(pending)).toBe(true)
      expect(Exit.isFailure(later)).toBe(true)
    }),
  )

  it.effect("adds, replaces, and removes plugins", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const agents = yield* AgentV2.Service
      let description = "first"

      const managed = () =>
        define({
          id: "managed",
          effect: (ctx) =>
            ctx.agent
              .transform((agents) =>
                agents.update("configured", (agent) => {
                  agent.description = description
                }),
              )
              .pipe(Effect.asVoid),
        })

      yield* plugins.add(PluginV2.ID.make("managed"), managed().effect)

      expect((yield* agents.get(AgentV2.ID.make("configured")))?.description).toBe("first")

      description = "second"
      yield* plugins.add(PluginV2.ID.make("managed"), managed().effect)
      expect((yield* agents.get(AgentV2.ID.make("configured")))?.description).toBe("second")

      yield* plugins.remove(PluginV2.ID.make("managed"))
      expect(yield* agents.get(AgentV2.ID.make("configured"))).toBeUndefined()
    }),
  )

  it.effect("scopes model-specific tool materialization hooks to the plugin", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const tools = yield* ToolRegistry.Service
      yield* tools.register({
        shell: Tool.make({
          description: "Run a shell command",
          input: Schema.Struct({ text: Schema.String }),
          output: Schema.String,
          execute: ({ text }) => Effect.succeed(text),
        }),
      })
      const managed = define({
        id: "tool-policy",
        effect: (ctx) =>
          ctx.tool
            .hook("materialize", ({ model, tools }) => {
              if (model.providerID === "openai" && model.id === "gpt-5.4") tools.rename("shell", "exec")
            })
            .pipe(Effect.asVoid),
      })

      yield* plugins.add(PluginV2.ID.make(managed.id), managed.effect)
      expect(
        (yield* tools.materialize([], { providerID: "openai", id: "gpt-5.4" })).definitions.map((tool) => tool.name),
      ).toEqual(["exec"])

      yield* plugins.remove(PluginV2.ID.make(managed.id))
      expect(
        (yield* tools.materialize([], { providerID: "openai", id: "gpt-5.4" })).definitions.map((tool) => tool.name),
      ).toEqual(["shell"])
    }),
  )

  it.effect("scopes system materialization hooks to the plugin", () =>
    Effect.gen(function* () {
      const plugins = yield* PluginV2.Service
      const hooks = yield* SessionHooks.Service
      const materialize = () =>
        Effect.gen(function* () {
          const state = { parts: ["Base instructions"] }
          yield* hooks.materializeSystem({
            model: { providerID: "openai", id: "gpt-5.4" },
            system: {
              list: () => [...state.parts],
              replace: (parts) => (state.parts = [...parts]),
              prepend: (part) => (state.parts = [part, ...state.parts]),
              append: (part) => (state.parts = [...state.parts, part]),
            },
          })
          return state.parts
        })
      const managed = define({
        id: "system-policy",
        effect: (ctx) =>
          ctx.session
            .hook("system.materialize", ({ model, system }) => {
              if (model.providerID === "openai") system.replace(["Codex instructions"])
            })
            .pipe(Effect.asVoid),
      })

      yield* plugins.add(PluginV2.ID.make(managed.id), managed.effect)
      expect(yield* materialize()).toEqual(["Codex instructions"])

      yield* plugins.remove(PluginV2.ID.make(managed.id))
      expect(yield* materialize()).toEqual(["Base instructions"])
    }),
  )
})
