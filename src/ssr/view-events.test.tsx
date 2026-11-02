import { createReflect, reflect } from '@effector/reflect';
import { act, cleanup, render } from '@testing-library/react';
import { allSettled, createEvent, createStore, fork } from 'effector';
import { Provider } from 'effector-react';
import React, {
  createContext,
  Ref,
  StrictMode,
  Suspense,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
} from 'react';
import { renderToString } from 'react-dom/server';

import { TextareaView } from '../../examples/imperative-textarea/textarea-view';

afterEach(cleanup);

test('plain events deliver repeated payloads without rendering and stop on unmount', async () => {
  const requested = createEvent<string>();
  const received = vi.fn();
  const rendered = vi.fn();
  function View({ events }: { events: Ref<{ show(payload: string): void }> }) {
    rendered();
    useImperativeHandle(events, () => ({ show: received }));
    return null;
  }
  const Connected = reflect({ view: View, bind: {}, events: { show: requested } });
  const scope = fork();
  await allSettled(requested, { scope, params: 'before mount' });
  const page = render(
    <StrictMode>
      <Provider value={scope}>
        <Connected />
      </Provider>
    </StrictMode>,
  );
  const renders = rendered.mock.calls.length;
  await allSettled(requested, { scope, params: 'hello' });
  await allSettled(requested, { scope, params: 'hello' });
  expect(received.mock.calls).toEqual([['hello'], ['hello']]);
  expect(rendered).toHaveBeenCalledTimes(renders);
  page.unmount();
  await allSettled(requested, { scope, params: 'after unmount' });
  expect(received).toHaveBeenCalledTimes(2);
});

test('subscriptions follow Scope replacement and handle publications before later child effects', async () => {
  const requested = createEvent<string>();
  const received = vi.fn();
  const first = fork();
  const second = fork();
  function View({ events }: { events: Ref<{ show(payload: string): void }> }) {
    useImperativeHandle(events, () => ({ show: received }));
    useLayoutEffect(() => {
      void allSettled(requested, { scope: first, params: 'child layout' });
    }, []);
    return null;
  }
  const Connected = createReflect(View)({}, { events: { show: requested } });
  const tree = (scope: typeof first) => (
    <Provider value={scope}>
      <Connected />
    </Provider>
  );
  const page = render(tree(first));
  expect(received.mock.calls).toEqual([['child layout']]);
  page.rerender(tree(second));
  await allSettled(requested, { scope: first, params: 'old scope' });
  await allSettled(requested, { scope: second, params: 'new scope' });
  expect(received.mock.calls).toEqual([['child layout'], ['new scope']]);
});

test('context changes update methods; abandoned renders cannot publish handlers', async () => {
  const requested = createEvent<string>();
  const received = vi.fn();
  const pending = new Promise<never>(() => {});
  const Context = createContext({ prefix: 'initial', pending: false });
  function View({ events }: { events: Ref<{ show(payload: string): void }> }) {
    const context = useContext(Context);
    useImperativeHandle(events, () => ({
      show(payload) {
        received(`${context.prefix}:${payload}`);
      },
    }));
    if (context.pending) throw pending;
    return null;
  }
  const Connected = reflect({ view: View, bind: {}, events: { show: requested } });
  const scope = fork();
  const tree = (prefix: string, suspended = false) => (
    <Provider value={scope}>
      <Context.Provider value={{ prefix, pending: suspended }}>
        <Suspense fallback="Loading">
          <Connected />
        </Suspense>
      </Context.Provider>
    </Provider>
  );
  const page = render(tree('first'));
  await allSettled(requested, { scope, params: '1' });
  page.rerender(tree('second'));
  await allSettled(requested, { scope, params: '2' });
  await act(async () => {
    React.startTransition(() => page.rerender(tree('abandoned', true)));
  });
  await allSettled(requested, { scope, params: '3' });
  expect(received.mock.calls).toEqual([['first:1'], ['second:2'], ['second:3']]);
  page.rerender(tree('hidden', true));
  await allSettled(requested, { scope, params: 'while hidden' });
  expect(received).toHaveBeenCalledTimes(3);
  page.rerender(tree('restored'));
  await allSettled(requested, { scope, params: '4' });
  expect(received.mock.calls[3]).toEqual(['restored:4']);
});

test('throws and rejected promises reach onError in their original Scope', async () => {
  const sync = createEvent();
  const async = createEvent();
  const errorSeen = createEvent<unknown>();
  const $errors = createStore<unknown[]>([]).on(errorSeen, (errors, error) => [
    ...errors,
    error,
  ]);
  const syncError = new Error('sync');
  const asyncError = new Error('async');
  function View({
    events,
  }: {
    events: Ref<{ sync(): void; async(): Promise<void> }>;
  }) {
    useImperativeHandle(events, () => ({
      sync() {
        throw syncError;
      },
      async() {
        return Promise.reject(asyncError);
      },
    }));
    return null;
  }
  const Connected = reflect({
    view: View,
    bind: {},
    events: { sync, async },
    onError: errorSeen,
  });
  const scope = fork();
  render(
    <Provider value={scope}>
      <Connected />
    </Provider>,
  );
  await allSettled(sync, { scope });
  await allSettled(async, { scope });
  await Promise.resolve();
  expect(scope.getState($errors)).toEqual([syncError, asyncError]);
  expect($errors.getState()).toEqual([]);
});

test('missing methods are reported; error-reporting failures fall back to console.error', async () => {
  const requested = createEvent();
  const onError = vi.fn();
  const Broken = reflect({
    view: ({ events }: { events: Ref<{ show(): void }> }) => {
      useImperativeHandle(events, () => ({} as { show(): void }));
      return null;
    },
    bind: {},
    events: { show: requested },
    onError,
  });
  const scope = fork();
  render(
    <Provider value={scope}>
      <Broken />
    </Provider>,
  );
  await allSettled(requested, { scope });
  expect(onError.mock.calls[0][0]).toBeInstanceOf(TypeError);
  const failure = new Error('reporter failed');
  onError.mockImplementation(() => {
    throw failure;
  });
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await allSettled(requested, { scope });
    expect(log).toHaveBeenCalledWith(failure);
  } finally {
    log.mockRestore();
  }
});

test('SSR publishes no handle or subscriptions; event config rejects stores', async () => {
  const requested = createEvent();
  const received = vi.fn();
  const scope = fork();
  const Connected = reflect({
    view: ({ events }: { events: Ref<{ show(): void }> }) => {
      useImperativeHandle(events, () => ({ show: received }));
      return <p>Server content</p>;
    },
    bind: {},
    events: { show: requested },
  });
  expect(
    renderToString(
      <Provider value={scope}>
        <Connected />
      </Provider>,
    ),
  ).toContain('Server content');
  await allSettled(requested, { scope });
  expect(received).not.toHaveBeenCalled();
  expect(() => renderToString(<Connected />)).toThrow(
    'requires an Effector Provider',
  );
  expect(() =>
    reflect({
      view: TextareaView,
      bind: {},
      // @ts-expect-error runtime guard for JavaScript consumers
      events: { focus: createStore(0) },
    }),
  ).toThrow('requires an Effector event');
});
