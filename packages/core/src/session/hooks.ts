export * as SessionHooks from "./hooks"

import { Context, Effect, Layer, Scope } from "effect"
import { makeLocationNode } from "../effect/app-node"
import { State } from "../state"

export interface Model {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export interface SystemDraft {
  readonly list: () => ReadonlyArray<string>
  readonly replace: (parts: ReadonlyArray<string>) => void
  readonly prepend: (part: string) => void
  readonly append: (part: string) => void
}

export interface SystemMaterializeEvent {
  readonly model: Model
  readonly system: SystemDraft
}

type SystemMaterializeHook = (event: SystemMaterializeEvent) => Effect.Effect<void> | void

export interface Interface {
  readonly hook: {
    readonly systemMaterialize: (
      callback: SystemMaterializeHook,
    ) => Effect.Effect<State.Registration, never, Scope.Scope>
  }
  readonly materializeSystem: (event: SystemMaterializeEvent) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/SessionHooks") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    let hooks: ReadonlyArray<SystemMaterializeHook> = []

    const hook = Effect.fn("SessionHooks.systemMaterialize")(function* (callback: SystemMaterializeHook) {
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
      hook: { systemMaterialize: hook },
      materializeSystem: Effect.fn("SessionHooks.runSystemMaterialize")(function* (event) {
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
