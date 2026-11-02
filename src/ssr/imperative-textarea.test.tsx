import { act, cleanup, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { allSettled, fork } from 'effector';
import { Provider } from 'effector-react';
import React, { StrictMode } from 'react';

import { App } from '../../examples/imperative-textarea/app';
import { Editor } from '../../examples/imperative-textarea/editor';
import { LocalEditor } from '../../examples/imperative-textarea/local-editor';
import {
  $documents,
  $history,
  $validation,
  firstWordRequested,
  focusRequested,
  initialDocuments,
  selectionRequested,
  textChanged,
  validateRequested,
} from '../../examples/imperative-textarea/model';

afterEach(cleanup);

function textarea(container: HTMLElement, label: string) {
  return within(container).getByLabelText(label) as HTMLTextAreaElement;
}

function selected(input: HTMLTextAreaElement) {
  return input.value.slice(input.selectionStart, input.selectionEnd);
}

test('Reflect isolates text and addressed commands by editor ID and Scope', async () => {
  const scope = fork();
  const otherScope = fork();
  const page = render(
    <StrictMode>
      <Provider value={scope}>
        <Editor editorId="left" label="Left document" />
        <Editor editorId="right" label="Right document" />
      </Provider>
      <Provider value={otherScope}>
        <Editor editorId="left" label="Other scope" />
      </Provider>
    </StrictMode>,
  );
  const left = textarea(page.container, 'Left document');
  const right = textarea(page.container, 'Right document');
  const other = textarea(page.container, 'Other scope');
  const user = userEvent.setup();
  await user.clear(left);
  await user.type(left, '  Updated document');
  expect(scope.getState($documents).left).toBe('  Updated document');
  expect(right.value).toBe(initialDocuments.right);
  expect(other.value).toBe(initialDocuments.left);
  const rightFocus = vi.spyOn(right, 'focus');
  const otherFocus = vi.spyOn(other, 'focus');
  await act(async () => {
    await allSettled(firstWordRequested, { scope, params: 'left' });
  });
  expect(document.activeElement).toBe(left);
  expect(selected(left)).toBe('Updated');
  expect(rightFocus).not.toHaveBeenCalled();
  expect(otherFocus).not.toHaveBeenCalled();
});

test('validation selects TODO only in its target and clears stale results on edit', async () => {
  const scope = fork();
  const page = render(
    <Provider value={scope}>
      <Editor editorId="left" label="Document" />
    </Provider>,
  );
  const input = textarea(page.container, 'Document');
  await act(async () => {
    await allSettled(validateRequested, { scope, params: 'left' });
  });
  expect(selected(input)).toBe('TODO');
  expect(document.activeElement).toBe(input);
  expect(scope.getState($validation).left).toContain('TODO found');
  expect(scope.getState($validation).right).toBeNull();
  await act(async () => {
    await allSettled(textChanged, {
      scope,
      params: { editorId: 'left', text: 'Complete' },
    });
  });
  expect(scope.getState($validation).left).toBeNull();
  const history = scope.getState($history);
  await act(async () => {
    await allSettled(validateRequested, { scope, params: 'left' });
  });
  expect(scope.getState($validation).left).toBe('No errors');
  expect(scope.getState($history)).toEqual(history);
});

test('repeated events deliver once in StrictMode and unmount removes subscriptions', async () => {
  const scope = fork();
  await allSettled(focusRequested, { scope, params: 'left' });
  const page = render(
    <StrictMode>
      <Provider value={scope}>
        <Editor editorId="left" label="Document" />
      </Provider>
    </StrictMode>,
  );
  const input = textarea(page.container, 'Document');
  expect(document.activeElement).not.toBe(input);
  const focus = vi.spyOn(input, 'focus');
  for (let index = 0; index < 2; index++) {
    await act(async () => {
      await allSettled(focusRequested, { scope, params: 'left' });
    });
  }
  expect(focus).toHaveBeenCalledTimes(2);
  expect(
    scope.getState($history).filter((entry) => entry.endsWith('delivered')),
  ).toHaveLength(2);
  page.unmount();
  await allSettled(focusRequested, { scope, params: 'left' });
  await allSettled(selectionRequested, {
    scope,
    params: { editorId: 'left', from: 0, to: 5 },
  });
  expect(focus).toHaveBeenCalledTimes(2);
});

test('imperative methods read the latest committed View setting', async () => {
  const scope = fork();
  const tree = (focusOnSelection: boolean) => (
    <Provider value={scope}>
      <Editor editorId="left" label="Document" focusOnSelection={focusOnSelection} />
    </Provider>
  );
  const page = render(tree(false));
  const input = textarea(page.container, 'Document');
  const focus = vi.spyOn(input, 'focus');
  await act(async () => {
    await allSettled(firstWordRequested, { scope, params: 'left' });
  });
  expect(focus).not.toHaveBeenCalled();
  page.rerender(tree(true));
  await act(async () => {
    await allSettled(firstWordRequested, { scope, params: 'left' });
  });
  expect(focus).toHaveBeenCalledTimes(1);
  expect(
    scope.getState($history).filter((entry) => entry.endsWith('delivered')),
  ).toHaveLength(2);
});

test('demo shows dropped commands, remounts without replay, and switches to React refs', async () => {
  const page = render(<App />);
  const user = userEvent.setup();
  const left = within(page.container).getByRole('region', { name: 'Left editor' });
  await user.click(within(left).getByRole('button', { name: 'Check text' }));
  expect(selected(textarea(left, 'Left document'))).toBe('TODO');
  expect(within(left).getByRole('status').textContent).toContain('TODO found');
  await user.click(within(left).getByRole('button', { name: 'Hide editor' }));
  await user.click(within(left).getByRole('button', { name: 'Focus textarea' }));
  const history = within(page.container).getByRole('list', {
    name: 'Latest commands',
  });
  expect(history.lastElementChild?.textContent).toBe('left: focus requested');
  await user.click(within(left).getByRole('button', { name: 'Show editor' }));
  expect(document.activeElement).not.toBe(textarea(left, 'Left document'));
  expect(history.lastElementChild?.textContent).toBe('left: focus requested');
  await user.click(within(left).getByRole('button', { name: 'Focus textarea' }));
  expect(document.activeElement).toBe(textarea(left, 'Left document'));
  expect(history.lastElementChild?.textContent).toBe('left: focus delivered');
  await user.click(
    within(page.container).getByRole('button', { name: 'Clear history' }),
  );
  expect(within(page.container).queryByRole('list')).toBeNull();
  await user.click(
    within(page.container).getByRole('radio', { name: 'React ref only' }),
  );
  expect(within(page.container).queryByLabelText('Left document')).toBeNull();
  expect(within(page.container).getByLabelText('React document')).toBeTruthy();
});

test('the React-only example edits, focuses and validates without Provider', async () => {
  const page = render(<LocalEditor />);
  const user = userEvent.setup();
  const input = textarea(page.container, 'React document');
  await user.click(
    within(page.container).getByRole('button', { name: 'Check text' }),
  );
  expect(selected(input)).toBe('TODO');
  await user.clear(input);
  await user.type(input, 'Finished');
  expect(within(page.container).getByRole('status').textContent).toBe('Not checked');
  await user.click(
    within(page.container).getByRole('button', { name: 'Check text' }),
  );
  expect(within(page.container).getByRole('status').textContent).toBe('No errors');
  await user.click(
    within(page.container).getByRole('button', { name: 'Focus textarea' }),
  );
  expect(document.activeElement).toBe(input);
});
