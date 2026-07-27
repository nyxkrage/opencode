export * as ToolHooks from "./hooks"

import { Context, Effect, Layer, Scope } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { State } from "../state"

export interface Model {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export interface Draft {
  readonly list: () => ReadonlyArray<string>
  readonly remove: (name: string) => void
  readonly rename: (name: string, alias: string) => void
}

export interface MaterializeEvent {
  readonly model: Model
  readonly tools: Draft
}

type MaterializeHook = (event: MaterializeEvent) => Effect.Effect<void> | void

export interface Interface {
  readonly hook: {
    readonly materialize: (callback: MaterializeHook) => Effect.Effect<State.Registration, never, Scope.Scope>
  }
  readonly materialize: (event: MaterializeEvent) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/ToolHooks") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let hooks: ReadonlyArray<MaterializeHook> = []

    const hook = Effect.fn("ToolHooks.materialize")(function* (callback: MaterializeHook) {
      const scope = yield* Scope.Scope
      let active = true
      hooks = [...hooks, callback]
      const dispose = Effect.sync(() => {
        if (!active) return
        active = false
        hooks = hooks.filter((item) => item !== callback)
      })
      yield* Scope.addFinalizer(scope, dispose)
      return { dispose }
    })

    return Service.of({
      hook: { materialize: hook },
      materialize: Effect.fn("ToolHooks.runMaterialize")(function* (event) {
        const snapshot = hooks
        for (const callback of snapshot) {
          const result = callback(event)
          if (Effect.isEffect(result)) yield* result
        }
      }),
    })
  }),
)

export const node = makeLocationNode({ service: Service, layer, deps: [] })
