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

import { withImperativeEvents } from './fixtures/minimal-imperative';

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
  const Connected = withImperativeEvents({ show: requested })(
    reflect({ view: View, bind: {} }),
  );
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
  const Connected = withImperativeEvents({ show: requested })(
    createReflect(View)({}),
  );
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
  const Connected = withImperativeEvents({ show: requested })(View);
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

test('SSR creates no subscriptions and hydration mounts the handle', async () => {
  const requested = createEvent<string>();
  const received = vi.fn();
  function View({ events }: { events: Ref<{ show(value: string): void }> }) {
    useImperativeHandle(events, () => ({ show: received }), []);
    return <p>Server content</p>;
  }
  const Connected = withImperativeEvents({ show: requested })(View);
  const scope = fork();
  const tree = (
    <Provider value={scope}>
      <Connected />
    </Provider>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree);
  document.body.appendChild(container);
  await allSettled(requested, { scope, params: 'before hydration' });
  expect(received).not.toHaveBeenCalled();
  const page = render(tree, { container, hydrate: true });
  await allSettled(requested, { scope, params: 'hydrated' });
  expect(received.mock.calls).toEqual([['hydrated']]);
  page.unmount();
  await allSettled(requested, { scope, params: 'after hydration unmount' });
  expect(received).toHaveBeenCalledTimes(1);
});

test('two mounted Scopes receive only their own events, never global events', async () => {
  const requested = createEvent<string>();
  const first = fork(),
    second = fork();
  const received = vi.fn();
  function View({
    events,
    label,
  }: {
    events: Ref<{ show(value: string): void }>;
    label: string;
  }) {
    useImperativeHandle(
      events,
      () => ({
        show(value) {
          received(label, value);
        },
      }),
      [label],
    );
    return null;
  }
  const Connected = withImperativeEvents({ show: requested })(
    reflect({ view: View, bind: {} }),
  );
  const page = render(
    <StrictMode>
      <Provider value={first}>
        <Connected label="first" />
      </Provider>
      <Provider value={second}>
        <Connected label="second" />
      </Provider>
    </StrictMode>,
  );
  requested('global');
  await allSettled(requested, { scope: first, params: 'one' });
  await allSettled(requested, { scope: second, params: 'two' });
  expect(received.mock.calls).toEqual([
    ['first', 'one'],
    ['second', 'two'],
  ]);
  page.unmount();
  await allSettled(requested, { scope: first, params: 'unmounted one' });
  await allSettled(requested, { scope: second, params: 'unmounted two' });
  expect(received).toHaveBeenCalledTimes(2);
});

test('multiple methods preserve their receiver and emitted events remain scoped', async () => {
  const requested = createEvent<string>();
  const reset = createEvent();
  const recorded = createEvent<string>();
  const $values = createStore<string[]>([]).on(recorded, (values, value) => [
    ...values,
    value,
  ]);
  const scope = fork();
  function View({
    events,
  }: {
    events: Ref<{ show(value: string): void; reset(): void }>;
  }) {
    useImperativeHandle(
      events,
      () => ({
        prefix: 'view',
        show(value: string) {
          recorded(`${this.prefix}:${value}`);
        },
        reset() {
          recorded(`${this.prefix}:reset`);
        },
      }),
      [],
    );
    return null;
  }
  const Connected = withImperativeEvents({ show: requested, reset })(View);
  render(
    <Provider value={scope}>
      <Connected />
    </Provider>,
  );
  await allSettled(requested, { scope, params: 'hello' });
  await allSettled(reset, { scope });
  expect(scope.getState($values)).toEqual(['view:hello', 'view:reset']);
  expect($values.getState()).toEqual([]);
});

test('a stable handle switches Scopes and repeated rerenders never multiply subscriptions', async () => {
  const requested = createEvent();
  const received = vi.fn();
  const first = fork(),
    second = fork();
  function View({ events }: { events: Ref<{ show(): void }> }) {
    useImperativeHandle(events, () => ({ show: received }), []);
    return null;
  }
  const Connected = withImperativeEvents({ show: requested })(View);
  const tree = (scope: typeof first) => (
    <Provider value={scope}>
      <Connected />
    </Provider>
  );
  const page = render(tree(first));
  for (let index = 0; index < 20; index++) page.rerender(tree(first));
  await allSettled(requested, { scope: first });
  expect(received).toHaveBeenCalledTimes(1);
  page.rerender(tree(second));
  await allSettled(requested, { scope: first });
  expect(received).toHaveBeenCalledTimes(1);
  await allSettled(requested, { scope: second });
  expect(received).toHaveBeenCalledTimes(2);
  page.unmount();
  const remount = render(tree(second));
  await allSettled(requested, { scope: second });
  expect(received).toHaveBeenCalledTimes(3);
  remount.unmount();
  await allSettled(requested, { scope: second });
  expect(received).toHaveBeenCalledTimes(3);
});
