import type { Effect, Scope } from "effect"
import type { Registration } from "./registration.js"

export interface SessionSystemMaterializeModel {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export interface SessionSystemDraft {
  list(): readonly string[]
  replace(parts: readonly string[]): void
  prepend(part: string): void
  append(part: string): void
}

export interface SessionHookSpec {
  readonly "system.materialize": {
    readonly model: SessionSystemMaterializeModel
    readonly system: SessionSystemDraft
  }
}

export interface SessionDomain {
  readonly hook: <Name extends keyof SessionHookSpec>(
    name: Name,
    callback: (event: SessionHookSpec[Name]) => Effect.Effect<void> | void,
  ) => Effect.Effect<Registration, never, Scope.Scope>
}
