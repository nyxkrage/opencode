# OpenCode V2 Effect Plugin API

The Effect plugin API grants plugins two in-process capabilities:

- `hook` installs behavior at an OpenCode extension point.
- `reload` reruns every transform hook for a stateful domain.

The public server client will be exposed separately. It is intentionally not part of `PluginContext` yet.

## Defining A Plugin

```ts
import { define } from "@opencode-ai/plugin/v2/effect"
import { Effect } from "effect"

export const Plugin = define({
  id: "example",
  effect: Effect.fn(function* (ctx) {
    yield* ctx.catalog.transform((catalog) => {
      catalog.provider.update("example", (provider) => {
        provider.name = "Example"
      })
    })
  }),
})
```

Plugin setup registers hooks imperatively. It does not return a hook object.

Configuration supplied for the plugin is available as `ctx.options`.

Registrations are owned by the plugin scope. Closing the scope removes them automatically; a registration may also be removed early through `dispose`.

## Transform Hooks

Transform hooks contribute to stateful domains:

```ts
yield *
  ctx.agent.transform((agent) => {
    agent.update("reviewer", (item) => {
      item.description = "Reviews code for regressions"
      item.mode = "subagent"
    })
  })
```

OpenCode rebuilds the domain when a transform is registered or disposed. A rebuild starts from fresh domain state and runs every active transform in registration order.

Available transform hooks are namespaced by domain:

```ts
ctx.agent.transform
ctx.catalog.transform
ctx.command.transform
ctx.integration.transform
ctx.reference.transform
ctx.skill.transform
```

## Runtime Hooks

Runtime hooks intercept live operations rather than rebuilding domain state:

```ts
yield *
  ctx.aisdk.sdk(
    Effect.fn(function* (event) {
      if (event.package !== "@ai-sdk/xai") return
      const mod = yield* Effect.promise(() => import("@ai-sdk/xai"))
      event.sdk = mod.createXai(event.options)
    }),
  )

yield *
  ctx.aisdk.language((event) => {
    if (event.model.providerID !== "xai") return
    event.language = event.sdk.responses(event.model.api.id)
  })
```

Hooks run sequentially in registration order. Later hooks observe mutations made by earlier hooks.

Tool materialization hooks can adjust the names exposed for one resolved model:

```ts
yield *
  ctx.tool.hook("materialize", ({ model, tools }) => {
    if (model.providerID !== "openai" || model.id !== "gpt-5.4") return
    tools.remove("edit")
    tools.remove("write")
    tools.rename("bash", "exec")
  })
```

Removing or renaming a tool only changes that provider turn's advertised catalog. Renamed tools retain their
canonical implementation and permission action. Renaming to an existing tool name fails the materialization.

Session system materialization hooks can replace or extend the system prompt for one resolved model:

```ts
yield *
  ctx.session.hook("system.materialize", ({ model, system }) => {
    if (model.providerID !== "openai" || model.id !== "gpt-5.4") return
    system.replace(["You are OpenAI Codex.", "Use apply_patch for file edits."])
    system.append("Follow the repository instructions.")
  })
```

The hook runs for every provider turn after durable system context is prepared and the model is resolved. Its
changes are ephemeral: they affect request construction and compaction accounting without changing durable
session history or context snapshots.

## Reloading A Domain

When data captured by a transform changes, reload the affected domain:

```ts
let data = yield * loadCatalog()

yield *
  ctx.catalog.transform((catalog) => {
    applyCatalog(data, catalog)
  })

data = yield * loadCatalog()
yield * ctx.catalog.reload()
```

Reload belongs to the domain, not an individual registration. `ctx.catalog.reload()` reruns every active catalog transform and publishes the rebuilt catalog.

Available reload operations are:

```ts
ctx.agent.reload()
ctx.catalog.reload()
ctx.command.reload()
ctx.integration.reload()
ctx.reference.reload()
ctx.skill.reload()
```
