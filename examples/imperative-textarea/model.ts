import { createEvent, createStore, sample } from 'effector';

import { findTodo, firstWordRange } from './validation';

export type EditorId = 'left' | 'right';
type Range = { from: number; to: number };
type Validation = { editorId: EditorId; range: Range | null };
export type Command = { editorId: EditorId; method: 'focus' | 'selectRange' };

export const initialDocuments = {
  left: 'Hello from Reflect. TODO: finish the left document.',
  right: 'Another document. TODO: review the right document.',
};
export const textChanged = createEvent<{ editorId: EditorId; text: string }>();
export const focusRequested = createEvent<EditorId>();
export const firstWordRequested = createEvent<EditorId>();
export const validateRequested = createEvent<EditorId>();
export const selectionRequested = createEvent<Range & { editorId: EditorId }>();
export const commandDelivered = createEvent<Command>();
export const historyCleared = createEvent();
const validationCompleted = createEvent<Validation>();

export const $documents = createStore(initialDocuments).on(
  textChanged,
  (documents, { editorId, text }) => ({ ...documents, [editorId]: text }),
);
export const $validation = createStore<Record<EditorId, string | null>>({
  left: null,
  right: null,
})
  .on(validationCompleted, (results, { editorId, range }) => ({
    ...results,
    [editorId]: range ? `TODO found at character ${range.from + 1}` : 'No errors',
  }))
  .on(textChanged, (results, { editorId }) => ({ ...results, [editorId]: null }));

sample({
  clock: firstWordRequested,
  source: $documents,
  fn: (documents, editorId) => ({ editorId, ...firstWordRange(documents[editorId]) }),
  target: selectionRequested,
});
sample({
  clock: validateRequested,
  source: $documents,
  fn: (documents, editorId) => ({ editorId, range: findTodo(documents[editorId]) }),
  target: validationCompleted,
});
sample({
  clock: validationCompleted.filterMap(({ editorId, range }) =>
    range ? { editorId, ...range } : undefined,
  ),
  target: selectionRequested,
});

export const $history = createStore<string[]>([])
  .on(focusRequested, (entries, editorId) =>
    [...entries, `${editorId}: focus requested`].slice(-20),
  )
  .on(selectionRequested, (entries, { editorId, from, to }) =>
    [...entries, `${editorId}: selectRange(${from}, ${to}) requested`].slice(-20),
  )
  .on(commandDelivered, (entries, { editorId, method }) =>
    [...entries, `${editorId}: ${method} delivered`].slice(-20),
  )
  .reset(historyCleared);
