import { act, cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { allSettled, fork } from 'effector';
import { Provider } from 'effector-react';
import React, { StrictMode } from 'react';

import { Editor } from '../../examples/imperative-textarea/editor';
import {
  $text,
  firstWordRequested,
  focusRequested,
  selectionRequested,
} from '../../examples/imperative-textarea/model';

afterEach(cleanup);

test('Reflect binds text updates while imperative events stay inside their Scope', async () => {
  const left = fork();
  const right = fork();
  const page = render(
    <StrictMode>
      <Provider value={left}>
        <Editor label="Left document" />
      </Provider>
      <Provider value={right}>
        <Editor label="Right document" />
      </Provider>
    </StrictMode>,
  );
  const leftInput = within(page.container).getByLabelText(
    'Left document',
  ) as HTMLTextAreaElement;
  const rightInput = within(page.container).getByLabelText(
    'Right document',
  ) as HTMLTextAreaElement;
  const user = userEvent.setup();
  await user.clear(leftInput);
  await user.type(leftInput, '  Updated document');
  expect(left.getState($text)).toBe('  Updated document');
  expect(rightInput.value).toBe('Hello from Effector and Reflect.');

  rightInput.focus();
  await act(async () => {
    await allSettled(firstWordRequested, { scope: left });
  });
  expect(document.activeElement).toBe(leftInput);
  expect(
    leftInput.value.slice(leftInput.selectionStart, leftInput.selectionEnd),
  ).toBe('Updated');

  await act(async () => {
    await allSettled(focusRequested, { scope: right });
  });
  expect(document.activeElement).toBe(rightInput);
});

test('repeated events call the current handle once and unmount removes subscriptions', async () => {
  const scope = fork();
  // Events before mount are intentionally not replayed.
  await allSettled(focusRequested, { scope });
  const page = render(
    <StrictMode>
      <Provider value={scope}>
        <Editor label="Document" />
      </Provider>
    </StrictMode>,
  );
  const textarea = within(page.container).getByLabelText(
    'Document',
  ) as HTMLTextAreaElement;
  expect(document.activeElement).not.toBe(textarea);
  const focus = vi.spyOn(textarea, 'focus');
  for (let index = 0; index < 2; index++) {
    await act(async () => {
      await allSettled(focusRequested, { scope });
    });
  }
  expect(focus).toHaveBeenCalledTimes(2);

  page.unmount();
  await allSettled(focusRequested, { scope });
  await allSettled(selectionRequested, { scope, params: { from: 0, to: 5 } });
  expect(focus).toHaveBeenCalledTimes(2);
});
