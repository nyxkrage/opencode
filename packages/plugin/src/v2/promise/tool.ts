import type { Registration } from "./registration.js"

export interface ToolMaterializeModel {
  readonly providerID: string
  readonly id: string
  readonly variant?: string
}

export interface ToolMaterializeDraft {
  list(): readonly string[]
  remove(name: string): void
  rename(name: string, alias: string): void
}

export interface ToolHookSpec {
  readonly materialize: {
    readonly model: ToolMaterializeModel
    readonly tools: ToolMaterializeDraft
  }
}

export interface ToolDomain {
  readonly hook: <Name extends keyof ToolHookSpec>(
    name: Name,
    callback: (event: ToolHookSpec[Name]) => Promise<void> | void,
  ) => Promise<Registration>
}
