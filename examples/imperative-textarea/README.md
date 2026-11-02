# Effector events → React textarea methods

A runnable example using the existing Reflect API. `TextareaView` imports only
React and exposes `focus` and `selectRange` through `useImperativeHandle`.
Reflect supplies text and change callbacks; a separate adapter delivers scoped,
addressed Effector events to the current handle. Stores contain only data.

From the repository root:

```sh
pnpm install
pnpm example:textarea
```

## Try the scenarios

1. **Addressed commands:** both documents share one Scope. Edit the left document
   and select its first word. The right document remains unchanged because every
   command carries an `editorId`.
2. **Jump to an error:** click **Check text**. The model finds the first `TODO`,
   updates the validation result and requests selection of its range. Remove all
   occurrences and check again to see **No errors**. Editing resets the result.
3. **Current View settings:** turn off **Focus when selecting**, then select a
   word or check the text. The selection changes without moving keyboard focus
   from the button. Turn it on to restore focusing. Methods capture the latest
   committed setting even though subscriptions do not depend on it.
4. **Unmount and dropped events:** hide an editor, then send it a focus or selection
   command. The history shows a request without delivery. Showing the editor
   preserves model text but does not replay those events.
5. **React-only reuse:** select **React ref only**. A separate instance uses the same
   `TextareaView` with local React state and direct ref calls, without Provider,
   Effector or Reflect in its implementation. Its local state resets when leaving
   this mode; the Effector documents retain their state in the demo's Scope.
6. **History:** requests and deliveries appear separately, with target IDs. The
   latest 20 entries are retained; **Clear history** resets them. Delivery means
   the View method returned, not that the browser acknowledged the operation.

```text
model.ts                             textarea-view.tsx
$documents[id] ─── Reflect bind ────→ value
textChanged({editorId,text}) ←─────── onChange
focusRequested(editorId) ─┐           useImperativeHandle
                         ├─ adapter → focus()
selectionRequested({editorId,from,to}) → selectRange(range)
                    Scope + ID           ↑
                                     local DOM ref

local-editor.tsx ─── ordinary React ref → same TextareaView
```

## Files and boundaries

- `textarea-view.tsx`: React-only component. `events` is an ordinary prop typed
  as `Ref<TextareaHandle>`; it needs no `forwardRef`, including on React 18.
- `model.ts`: document data, validation, addressed events and a bounded command
  history. Each reflected textarea reads only its own document's derived store.
- `validation.ts`: pure text operations shared with the standalone React example.
- `editor.tsx`: Reflect bindings and an integration adapter using `createWatch`
  and `useProvidedScope`. It filters events by ID and records successful method
  returns through a scope-bound event. This is not a new built-in Reflect API.
- `app.tsx`: two editors in one Scope, bound toolbars, settings, validation and
  history. Hide/show controls the actual mount lifetime.
- `local-editor.tsx`: the same View controlled by plain React state and ref calls.

Subscriptions require Provider, install after commit and clean up on unmount,
Scope replacement or target-ID change. Each delivery reads `handle.current`.
Events before subscription or without a handle are dropped. Two mounted editors
with the same ID in the same Scope would both receive the command; unique IDs
identify targets within the Scope. This example is not an acknowledged command
queue, and UI method errors are not converted into Effector Effect failures.

## Verification

```sh
pnpm build
pnpm example:textarea:check
CI=1 pnpm exec vitest run src/ssr/imperative-textarea.test.tsx
```

Tests cover text binding, ID and Scope isolation, validation, repeated commands,
StrictMode/unmount cleanup, current handle settings, hidden-editor delivery,
history, mode switching and standalone React reuse.
