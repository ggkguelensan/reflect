# Effector events → React textarea methods

A runnable example of the experimental `withImperativeEvents` operator in this fork. `TextareaView` imports only
React and exposes `focus` and `selectRange` through `useImperativeHandle`.
Reflect supplies text and change callbacks. The separately imported
`withImperativeEvents` operator delivers scoped Effector events to the View handle. Native Effector operators address commands by editor ID.
Stores contain only data.

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
   committed setting when React publishes the updated handle.
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
                         ├─ withImperativeEvents → focus()
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
- `editor.tsx`: `reflect` bindings wrapped with `withImperativeEvents`. Native Effector
  operators filter by ID and project range payloads. No application subscription
  or lifecycle hooks are needed. The View reports returned commands through an
  ordinary bound `onCommand` callback.
- `app.tsx`: two editors in one Scope, bound toolbars, settings, validation and
  history. Hide/show controls the actual mount lifetime.
- `local-editor.tsx`: the same View controlled by plain React state and ref calls.

Subscriptions require Provider. The operator passes a callback ref to the View's
`events` prop. React publishes the handle during commit; the operator subscribes in
that callback and releases the previous subscriptions when the handle is replaced
or cleared. No effect hook or render-time registration is involved in delivery.
Events before publication or without a handle are dropped. Two mounted editors
with the same ID in the same Scope would both receive the command. This is not an
acknowledged queue. Handler errors reach the operator’s `onError` option (or `console.error`),
and returned promises are not tracked as Effector Effects.

## Verification

```sh
pnpm build
pnpm example:textarea:check
CI=1 pnpm exec vitest run src/ssr/imperative-textarea.test.tsx
```

Tests cover text binding, ID and Scope isolation, validation, repeated commands,
StrictMode/unmount cleanup, current handle settings, hidden-editor delivery,
history, mode switching and standalone React reuse.

The optional runtime lives in `src/imperative.ts` and `src/imperative/view-events.ts`.
The base Reflect implementation and declarations are unchanged. Run
`pnpm test:imperative:bundle` after building to check import isolation, consumer
bundle sizes and the packed ESM/CJS entry point. Measurements externalize peer
dependencies; they are not full application bundle sizes.
