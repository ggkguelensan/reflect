import { reflect } from '@effector/reflect';
import { cleanup, render } from '@testing-library/react';
import { allSettled, attach, createEvent, createStore, fork } from 'effector';
import { Provider, useUnit } from 'effector-react';
import React, { type Ref, useEffect, useImperativeHandle, useState } from 'react';

import { withImperativeEvents } from './with-events';

afterEach(cleanup);
type Api = { warning(message: string): void };
function model() {
  const changed = createEvent<Api | null>();
  const $api = createStore<Api | null>(null, { serialize: 'ignore' }).on(
    changed,
    (_, api) => api,
  );
  const warningFx = attach({
    source: $api,
    effect(api, message: string) {
      if (!api) throw new Error('Notification API is not ready');
      api.warning(message);
    },
  });
  return { changed, $api, warningFx };
}

test('article dependencies leave the new Scope unregistered and retain the API after unmount', async () => {
  const m = model(),
    received = vi.fn();
  function App() {
    const publish = useUnit(m.changed);
    const [api] = useState<Api>(() => ({ warning: received }));
    useEffect(() => {
      publish(api);
    }, [api]); // Exact dependency/cleanup behavior from the article.
    return null;
  }
  const first = fork(),
    second = fork();
  const tree = (scope: typeof first) => (
    <Provider value={scope}>
      <App />
    </Provider>
  );
  const page = render(tree(first));
  expect(first.getState(m.$api)).not.toBeNull();
  page.rerender(tree(second));
  expect(second.getState(m.$api)).toBeNull();
  expect(
    await allSettled(m.warningFx, { scope: second, params: 'new scope' }),
  ).toMatchObject({ status: 'fail' });
  page.unmount();
  expect(first.getState(m.$api)).not.toBeNull();
  expect(
    await allSettled(m.warningFx, { scope: first, params: 'after unmount' }),
  ).toMatchObject({ status: 'done' });
  expect(received.mock.calls).toEqual([['after unmount']]);
});

test('callback through Reflect plus effect cleanup follows Scope replacement for one host per Scope', async () => {
  const m = model(),
    received = vi.fn();
  function View({ onApiChanged }: { onApiChanged(api: Api | null): void }) {
    const [api] = useState<Api>(() => ({ warning: received }));
    useEffect(() => {
      onApiChanged(api);
      return () => onApiChanged(null);
    }, [api, onApiChanged]);
    return null;
  }
  const Connected = reflect({ view: View, bind: { onApiChanged: m.changed } });
  const first = fork(),
    second = fork();
  const tree = (scope: typeof first) => (
    <Provider value={scope}>
      <Connected />
    </Provider>
  );
  const page = render(tree(first));
  expect(
    await allSettled(m.warningFx, { scope: first, params: 'first' }),
  ).toMatchObject({ status: 'done' });
  page.rerender(tree(second));
  expect(first.getState(m.$api)).toBeNull();
  expect(second.getState(m.$api)).not.toBeNull();
  expect(
    await allSettled(m.warningFx, { scope: second, params: 'second' }),
  ).toMatchObject({ status: 'done' });
  page.unmount();
  expect(second.getState(m.$api)).toBeNull();
  expect(
    await allSettled(m.warningFx, { scope: second, params: 'after unmount' }),
  ).toMatchObject({ status: 'fail' });
  expect(received.mock.calls).toEqual([['first'], ['second']]);
});

test('imperative HOC follows Scope replacement without registering a UI API in a Store', async () => {
  const requested = createEvent<string>(),
    received = vi.fn();
  function View({ events }: { events: Ref<Api> }) {
    const [api] = useState<Api>(() => ({ warning: received }));
    useImperativeHandle(
      events,
      () => ({
        warning(message) {
          api.warning(message);
        },
      }),
      [api],
    );
    return null;
  }
  const Connected = withImperativeEvents({ warning: requested })(View);
  const first = fork(),
    second = fork();
  const tree = (scope: typeof first) => (
    <Provider value={scope}>
      <Connected />
    </Provider>
  );
  await allSettled(requested, { scope: first, params: 'before mount' });
  const page = render(tree(first));
  await allSettled(requested, { scope: first, params: 'first' });
  page.rerender(tree(second));
  await allSettled(requested, { scope: first, params: 'old scope' });
  await allSettled(requested, { scope: second, params: 'second' });
  page.unmount();
  await allSettled(requested, { scope: second, params: 'after unmount' });
  expect(received.mock.calls).toEqual([['first'], ['second']]);
});
