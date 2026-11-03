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
  createContext,
  memo,
  Profiler,
  StrictMode,
  Suspense,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { renderToString } from 'react-dom/server';

import { adapters, type Command, type EditorProps, type Snapshot } from './adapters';
import { useImperativeEvents } from './use-imperative-events';

const watches = vi.hoisted(() => ({ created: 0, stopped: 0 }));
vi.mock('effector', async (importOriginal) => {
  const original = await importOriginal<typeof import('effector')>();
  return {
    ...original,
    createWatch: vi.fn((config: Parameters<typeof original.createWatch>[0]) => {
      watches.created++;
      const unsub = original.createWatch(config);
      const stop = () => {
        watches.stopped++;
        unsub();
      };
      return Object.assign(stop, { unsubscribe: stop });
    }),
  };
});
vi.mock('./use-imperative-events', async (importOriginal) => {
  const original = await importOriginal<typeof import('./use-imperative-events')>();
  return { ...original, useImperativeEvents: vi.fn(original.useImperativeEvents) };
});
beforeEach(() => {
  vi.clearAllMocks();
  watches.created = 0;
  watches.stopped = 0;
});
afterEach(cleanup);
const command: Command = { id: 1, version: 1, from: 1, to: 2 };

for (const adapter of adapters)
  describe(adapter.name, () => {
    test('1000 commands deliver without renders or subscription growth', async () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' });
      const received = vi.fn(),
        rendered = vi.fn(),
        commits = vi.fn();
      function View({ events }: EditorProps) {
        rendered();
        useImperativeHandle(events, () => ({ execute: received }), []);
        return null;
      }
      const Connected = adapter.connect({
        view: View,
        document,
        command: requested,
        committed,
      });
      const scope = fork();
      render(
        <Provider value={scope}>
          <Profiler id="case" onRender={commits}>
            <Connected label="test" />
          </Profiler>
        </Provider>,
      );
      const before = {
        view: rendered.mock.calls.length,
        commits: commits.mock.calls.length,
        hooks: vi.mocked(useImperativeEvents).mock.calls.length,
      };
      for (let i = 0; i < 1000; i++)
        await allSettled(requested, { scope, params: command });
      expect(received).toHaveBeenCalledTimes(1000);
      expect(rendered).toHaveBeenCalledTimes(before.view);
      expect(commits).toHaveBeenCalledTimes(before.commits);
      expect(vi.mocked(useImperativeEvents)).toHaveBeenCalledTimes(before.hooks);
      expect(watches).toEqual({ created: 1, stopped: 0 });
    });
    test('store updates render the View once; outer HOC skips its own hook work', async () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>(),
        changed = createEvent<Snapshot>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' }).on(
        changed,
        (_, value) => value,
      );
      const rendered = vi.fn();
      function View({ events, snapshot }: EditorProps) {
        rendered();
        useImperativeHandle(
          events,
          () => ({
            execute() {
              return snapshot.version;
            },
          }),
          [snapshot.version],
        );
        return null;
      }
      const Connected = adapter.connect({
        view: View,
        document,
        command: requested,
        committed,
      });
      const scope = fork();
      const page = render(
        <Provider value={scope}>
          <Connected label="test" />
        </Provider>,
      );
      const before = vi.mocked(useImperativeEvents).mock.calls.length;
      for (let version = 1; version <= 5; version++)
        await act(async () => {
          await allSettled(changed, {
            scope,
            params: { version, text: `text ${version}` },
          });
        });
      expect(rendered).toHaveBeenCalledTimes(6);
      // Bundling inlines this hook, so only the source run can instrument its calls.
      if (!process.env.EXPERIMENT_MINIFIED) {
        expect(vi.mocked(useImperativeEvents).mock.calls.length - before).toBe(
          adapter.name === 'outer' ? 0 : 5,
        );
      }
      expect(watches).toEqual({ created: 6, stopped: 5 });
      page.unmount();
      expect(watches.stopped).toBe(6);
    });
    test('memo View retains its bailout on parent updates', () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' });
      const rendered = vi.fn();
      function View({ events }: EditorProps) {
        rendered();
        useImperativeHandle(events, () => ({ execute() {} }), []);
        return null;
      }
      const Connected = adapter.connect({
        view: memo(View),
        document,
        command: requested,
        committed,
      });
      const scope = fork();
      function Parent() {
        const [n, set] = useState(0);
        return (
          <>
            <button onClick={() => set(n + 1)}>{n}</button>
            <Connected label="same" />
          </>
        );
      }
      const page = render(
        <Provider value={scope}>
          <Parent />
        </Provider>,
      );
      for (let i = 0; i < 5; i++) fireEvent.click(page.getByRole('button'));
      expect(rendered).toHaveBeenCalledTimes(1);
      expect(watches).toEqual({ created: 1, stopped: 0 });
    });
    test('StrictMode, two Scopes, replacement, and unmount do not leak listeners', async () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' });
      const received = vi.fn();
      function View({ events, label }: EditorProps) {
        useImperativeHandle(
          events,
          () => ({
            execute() {
              received(label);
            },
          }),
          [label],
        );
        return null;
      }
      const Connected = adapter.connect({
        view: View,
        document,
        command: requested,
        committed,
      });
      const first = fork(),
        second = fork(),
        third = fork();
      const tree = (scope: typeof first) => (
        <StrictMode>
          <Provider value={scope}>
            <Connected label="one" />
          </Provider>
          <Provider value={second}>
            <Connected label="two" />
          </Provider>
        </StrictMode>
      );
      const page = render(tree(first));
      await allSettled(requested, { scope: first, params: command });
      await allSettled(requested, { scope: second, params: command });
      expect(received.mock.calls).toEqual([['one'], ['two']]);
      page.rerender(tree(third));
      await allSettled(requested, { scope: first, params: command });
      await allSettled(requested, { scope: third, params: command });
      expect(received.mock.calls).toEqual([['one'], ['two'], ['one']]);
      page.unmount();
      await allSettled(requested, { scope: third, params: command });
      expect(received).toHaveBeenCalledTimes(3);
      expect(watches.created).toBe(watches.stopped);
    });
    test('immediate commands see previous committed props in a batched data update', async () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>(),
        changed = createEvent<Snapshot>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' }).on(
        changed,
        (_, value) => value,
      );
      const received = vi.fn();
      function View({ events, snapshot }: EditorProps) {
        useImperativeHandle(
          events,
          () => ({
            execute() {
              received(snapshot.version);
            },
          }),
          [snapshot.version],
        );
        return null;
      }
      const Connected = adapter.connect({
        view: View,
        document,
        command: requested,
        committed,
      });
      const scope = fork();
      render(
        <Provider value={scope}>
          <Connected label="test" />
        </Provider>,
      );
      sample({ clock: changed, fn: () => command, target: requested });
      await act(async () => {
        await allSettled(changed, { scope, params: { version: 1, text: 'new' } });
      });
      expect(received.mock.calls).toEqual([[0]]);
      await allSettled(requested, { scope, params: command });
      expect(received.mock.calls).toEqual([[0], [1]]);
    });
    test('SSR hydration and Suspense publish only committed handles', async () => {
      const requested = createEvent<Command>(),
        committed = createEvent<number>();
      const document = createStore<Snapshot>({ version: 0, text: 'abc' });
      const received = vi.fn();
      const hidden = createContext(false),
        never = new Promise<never>(() => {});
      function View({ events }: EditorProps) {
        useImperativeHandle(events, () => ({ execute: received }), []);
        if (useContext(hidden)) throw never;
        return <p>ready</p>;
      }
      const Connected = adapter.connect({
        view: View,
        document,
        command: requested,
        committed,
      });
      const scope = fork();
      const tree = (suspended: boolean) => (
        <Provider value={scope}>
          <hidden.Provider value={suspended}>
            <Suspense fallback="loading">
              <Connected label="test" />
            </Suspense>
          </hidden.Provider>
        </Provider>
      );
      const container = documentOwner();
      container.innerHTML = renderToString(tree(false));
      await allSettled(requested, { scope, params: command });
      expect(received).not.toHaveBeenCalled();
      const page = render(tree(false), { container, hydrate: true });
      await allSettled(requested, { scope, params: command });
      expect(received).toHaveBeenCalledTimes(1);
      page.rerender(tree(true));
      await allSettled(requested, { scope, params: command });
      expect(received).toHaveBeenCalledTimes(1);
      page.rerender(tree(false));
      await allSettled(requested, { scope, params: command });
      expect(received).toHaveBeenCalledTimes(2);
    });
  });
function documentOwner() {
  const container = globalThis.document.createElement('div');
  globalThis.document.body.appendChild(container);
  return container;
}
