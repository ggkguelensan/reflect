# Effector events → React textarea methods

A runnable example using the existing Reflect API. The textarea View imports only
React; its `useImperativeHandle` exposes `focus` and `selectRange`. Reflect binds
text and change callbacks. A separate adapter subscribes to Effector events in the
current Scope and calls the current React handle. No store contains a ref, DOM
node or React callback.

From the repository root:

```sh
pnpm install
pnpm example:textarea
```

Open the local URL printed by Vite. Edit either document, use **Focus textarea**,
and then **Select first word**. The two editors use separate Scopes: state and
imperative events stay isolated. Leading whitespace is skipped when selecting.

```text
model.ts                         textarea-view.tsx
$text ─── Reflect bind ─────────→ value
textChanged ← Reflect bind ───── onChange
focusRequested ─┐                useImperativeHandle
                ├─ editor.tsx ─→ focus()
selectionRequested ────────────→ selectRange(range)
                   scoped watch    ↑
                               local DOM ref
```

- `textarea-view.tsx`: reusable React component with an ordinary `events` prop
  typed as `Ref<TextareaHandle>`. No Effector or Reflect imports; no `forwardRef`
  is needed because the prop is named `events`, including on React 18.
- `model.ts`: text state and events. Selecting the first word computes a range
  from current model state, then emits `selectionRequested`.
- `editor.tsx`: existing Reflect bindings plus a small integration adapter using
  `createWatch` and `useProvidedScope`. These low-level APIs are confined here.
- `app.tsx`: scope-bound toolbar callbacks supplied by Reflect and two editors.

The adapter requires an Effector Provider, installs subscriptions after commit and
removes them on unmount or Scope replacement. Watchers read `handle.current` on
every event; replacing the handle does not require another subscription. Events
before subscription or while the handle is unavailable are dropped, not replayed.
Each mounted editor in the same Scope receives the events; use separate Scopes
or an explicit target ID when only one of several editors should react. This is
an event-delivery example, not an acknowledged command queue. UI method failures
are not converted into Effector Effect failures.

Verification:

```sh
pnpm build
pnpm example:textarea:check
pnpm test:code src/ssr/imperative-textarea.test.tsx
```

The focused tests cover controlled editing, scope isolation, range selection,
repeated events, StrictMode cleanup, pre-mount delivery and unmount cleanup.
