import { reflect } from '@effector/reflect';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import {
  allSettled,
  createEvent,
  createStore,
  createWatch,
  fork,
  sample,
} from 'effector';
import { Provider } from 'effector-react';
import React, {
  memo,
  Profiler,
  type Ref,
  useImperativeHandle,
  useState,
} from 'react';

import { withImperativeEvents } from './fixtures/minimal-imperative';

const watches = vi.hoisted(() => ({ created: 0, stopped: 0 }));
vi.mock('effector', async (importOriginal) => {
  const original = await importOriginal<typeof import('effector')>();
  return {
    ...original,
    createWatch: vi.fn((config: Parameters<typeof original.createWatch>[0]) => {
      watches.created++;
      const unsubscribe = original.createWatch(config);
      const stop = () => {
        watches.stopped++;
        unsubscribe();
      };
      return Object.assign(stop, { unsubscribe: stop });
    }),
  };
});

beforeEach(() => {
  watches.created = 0;
  watches.stopped = 0;
});
afterEach(cleanup);

test('1000 imperative events add no HOC renders, View renders, commits or subscriptions', async () => {
  const requested = createEvent<number>();
  const rendered = vi.fn();
  const received = vi.fn();
  const committed = vi.fn();
  function View({ events }: { events: Ref<{ show(value: number): void }> }) {
    rendered();
    useImperativeHandle(events, () => ({ show: received }), []);
    return null;
  }
  const Component = withImperativeEvents({ show: requested })(View);
  const renderedHoc = vi.fn(Component);
  const Connected: typeof Component = (props) => renderedHoc(props);
  const scope = fork();
  render(
    <Provider value={scope}>
      <Profiler id="audit" onRender={committed}>
        <Connected />
      </Profiler>
    </Provider>,
  );
  const before = {
    hoc: renderedHoc.mock.calls.length,
    view: rendered.mock.calls.length,
    commits: committed.mock.calls.length,
  };
  for (let value = 0; value < 1000; value++)
    await allSettled(requested, { scope, params: value });
  expect(received).toHaveBeenCalledTimes(1000);
  expect(renderedHoc).toHaveBeenCalledTimes(before.hoc);
  expect(rendered).toHaveBeenCalledTimes(before.view);
  expect(committed).toHaveBeenCalledTimes(before.commits);
  expect(watches).toEqual({ created: 1, stopped: 0 });
});

test.each(['plain', 'stable handle', 'memo View', 'memo HOC'])(
  'parent updates: %s',
  async (mode) => {
    const requested = createEvent();
    const rendered = vi.fn();
    const received = vi.fn();
    function View({ events }: { events: Ref<{ show(): void }> }) {
      rendered();
      useImperativeHandle(
        events,
        () => ({ show: received }),
        mode === 'plain' ? undefined : [],
      );
      return null;
    }
    const Component = withImperativeEvents({ show: requested })(
      mode === 'memo View' ? memo(View) : View,
    );
    const renderedHoc = vi.fn(Component);
    const Connected: typeof Component = (props) => renderedHoc(props);
    const Child = mode === 'memo HOC' ? memo(Connected) : Connected;
    function Parent() {
      const [count, update] = useState(0);
      return (
        <>
          <button onClick={() => update(count + 1)}>{count}</button>
          <Child />
        </>
      );
    }
    const scope = fork();
    const page = render(
      <Provider value={scope}>
        <Parent />
      </Provider>,
    );
    for (let index = 0; index < 5; index++) fireEvent.click(page.getByRole('button'));
    expect(renderedHoc).toHaveBeenCalledTimes(mode === 'memo HOC' ? 1 : 6);
    expect(rendered).toHaveBeenCalledTimes(mode.startsWith('memo') ? 1 : 6);
    expect(watches.created).toBe(mode === 'plain' ? 6 : 1);
    expect(watches.stopped).toBe(mode === 'plain' ? 5 : 0);
    await allSettled(requested, { scope });
    expect(received).toHaveBeenCalledTimes(1);
    page.unmount();
    expect(watches.stopped).toBe(watches.created);
  },
);

test('an event can read previous props when the same transaction updates a bound store', async () => {
  const changed = createEvent<string>();
  const requested = createEvent();
  const $value = createStore('before').on(changed, (_, value) => value);
  sample({ clock: changed, fn: () => undefined, target: requested });
  const received = vi.fn();
  const rendered = vi.fn();
  function View({ events, value }: { events: Ref<{ read(): void }>; value: string }) {
    rendered();
    useImperativeHandle(
      events,
      () => ({
        read() {
          received(value);
        },
      }),
      [value],
    );
    return <span>{value}</span>;
  }
  const Component = withImperativeEvents({ read: requested })(
    reflect({ view: View, bind: { value: $value } }),
  );
  const renderedHoc = vi.fn(Component);
  const Connected: typeof Component = (props) => renderedHoc(props);
  const scope = fork();
  const page = render(
    <Provider value={scope}>
      <Connected />
    </Provider>,
  );
  await act(async () => {
    await allSettled(changed, { scope, params: 'after' });
  });
  expect(page.getByText('after')).toBeTruthy();
  expect(received.mock.calls).toEqual([['before']]);
  expect(renderedHoc).toHaveBeenCalledTimes(1);
  expect(rendered).toHaveBeenCalledTimes(2);
  expect(watches).toEqual({ created: 2, stopped: 1 });
  await allSettled(requested, { scope });
  expect(received.mock.calls).toEqual([['before'], ['after']]);
});

test('without Provider the HOC fails before creating a global subscription', async () => {
  const requested = createEvent<string>();
  const received = vi.fn();
  function View({ events }: { events: Ref<{ show(value: string): void }> }) {
    useImperativeHandle(events, () => ({ show: received }), []);
    return null;
  }
  const Connected = withImperativeEvents({ show: requested })(View);
  expect(() => render(<Connected />)).toThrow(Error);
  expect(watches.created).toBe(0);
  requested('global');
  await allSettled(requested, { scope: fork(), params: 'fork' });
  expect(received).not.toHaveBeenCalled();
});

test('multiple instances in one Scope receive a broadcast, not an addressed command', async () => {
  const requested = createEvent();
  const received = vi.fn();
  function View({ events, id }: { events: Ref<{ show(): void }>; id: string }) {
    useImperativeHandle(
      events,
      () => ({
        show() {
          received(id);
        },
      }),
      [id],
    );
    return null;
  }
  const Connected = withImperativeEvents({ show: requested })(View);
  const scope = fork();
  render(
    <Provider value={scope}>
      <Connected id="first" />
      <Connected id="second" />
    </Provider>,
  );
  await allSettled(requested, { scope });
  expect(received.mock.calls).toEqual([['first'], ['second']]);
});
