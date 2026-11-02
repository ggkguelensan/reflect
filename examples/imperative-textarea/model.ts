import { createEvent, createStore, sample } from 'effector';

export const textChanged = createEvent<string>();
export const focusRequested = createEvent();
export const firstWordRequested = createEvent();
export const selectionRequested = createEvent<{ from: number; to: number }>();

export const $text = createStore('Hello from Effector and Reflect.').on(
  textChanged,
  (_, text) => text,
);

sample({
  clock: firstWordRequested,
  source: $text,
  fn: (text) => {
    const word = /\S+/.exec(text);
    const from = word?.index ?? 0;
    return { from, to: from + (word?.[0].length ?? 0) };
  },
  target: selectionRequested,
});
