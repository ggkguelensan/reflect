import { act, cleanup, render } from '@testing-library/react';
import { allSettled, fork } from 'effector';
import { Provider } from 'effector-react';
import React, {
  createContext,
  Profiler,
  StrictMode,
  Suspense,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';

import { adapters, type EditorProps } from './adapters';
import { createCommittedModel } from './committed-model';

afterEach(cleanup);
const Hidden = createContext(false);
const never = new Promise<never>(() => {});
for (const adapter of adapters)
  describe(`${adapter.name}: explicit commit protocol`, () => {
    function setup(strict = false) {
      const model = createCommittedModel();
      const scope = fork();
      const applied = vi.fn(),
        rendered = vi.fn(),
        commits = vi.fn();
      function View({ events, snapshot, onCommitted }: EditorProps) {
        rendered();
        const field = useRef<HTMLTextAreaElement>(null);
        useImperativeHandle(
          events,
          () => ({
            execute(command) {
              const node = field.current;
              if (!node) throw new Error('Not mounted');
              node.setSelectionRange(command.from, command.to);
              applied({
                id: command.id,
                commandVersion: command.version,
                viewVersion: snapshot.version,
                text: node.value,
                from: node.selectionStart,
                to: node.selectionEnd,
              });
            },
          }),
          [snapshot.version],
        );
        useLayoutEffect(() => {
          onCommitted(snapshot.version);
        }, [snapshot.version, onCommitted]);
        if (useContext(Hidden)) throw never;
        return (
          <textarea aria-label="editor" value={snapshot.text} readOnly ref={field} />
        );
      }
      const Connected = adapter.connect({
        view: View,
        document: model.document,
        command: model.ready,
        committed: model.committed,
      });
      const tree = (hidden = false) => {
        const content = (
          <Provider value={scope}>
            <Hidden.Provider value={hidden}>
              <Suspense fallback="loading">
                <Profiler id="editor" onRender={commits}>
                  <Connected label="test" />
                </Profiler>
              </Suspense>
            </Hidden.Provider>
          </Provider>
        );
        return strict ? <StrictMode>{content}</StrictMode> : content;
      };
      const page = render(tree());
      return { model, scope, applied, rendered, commits, page, tree };
    }
    test('selection executes against the new DOM with no extra UI commit', async () => {
      const t = setup();
      await act(async () => {
        await allSettled(t.model.replace, {
          scope: t.scope,
          params: {
            id: 1,
            snapshot: { version: 1, text: '0123456789' },
            from: 8,
            to: 9,
          },
        });
      });
      expect(t.applied.mock.calls).toEqual([
        [
          {
            id: 1,
            commandVersion: 1,
            viewVersion: 1,
            text: '0123456789',
            from: 8,
            to: 9,
          },
        ],
      ]);
      expect(t.rendered).toHaveBeenCalledTimes(2);
      expect(t.commits).toHaveBeenCalledTimes(2);
      expect(t.scope.getState(t.model.pending)).toBeNull();
      await allSettled(t.model.committed, { scope: t.scope, params: 1 });
      expect(t.applied).toHaveBeenCalledTimes(1);
    });
    test('coalesced versions cancel superseded selections; StrictMode does not duplicate commands', async () => {
      const t = setup(true);
      await act(async () => {
        await Promise.all(
          [1, 2, 3, 4, 5].map((version) =>
            allSettled(t.model.replace, {
              scope: t.scope,
              params: {
                id: version,
                snapshot: { version, text: `version ${version}` },
                from: 1,
                to: 3,
              },
            }),
          ),
        );
      });
      expect(t.applied.mock.calls).toEqual([
        [
          {
            id: 5,
            commandVersion: 5,
            viewVersion: 5,
            text: 'version 5',
            from: 1,
            to: 3,
          },
        ],
      ]);
      expect(t.scope.getState(t.model.pending)).toBeNull();
    });
    test('Suspense holds the latest command until the target actually commits', async () => {
      const t = setup();
      t.page.rerender(t.tree(true));
      await act(async () => {
        await allSettled(t.model.replace, {
          scope: t.scope,
          params: {
            id: 1,
            snapshot: { version: 1, text: 'first version' },
            from: 1,
            to: 2,
          },
        });
      });
      await act(async () => {
        await allSettled(t.model.replace, {
          scope: t.scope,
          params: {
            id: 2,
            snapshot: { version: 2, text: 'second version' },
            from: 4,
            to: 7,
          },
        });
      });
      await allSettled(t.model.select, {
        scope: t.scope,
        params: { id: 1, version: 2, from: 0, to: 1 },
      });
      expect(t.applied).not.toHaveBeenCalled();
      expect(t.scope.getState(t.model.pending)?.id).toBe(2);
      t.page.rerender(t.tree(false));
      expect(t.applied.mock.calls).toEqual([
        [
          {
            id: 2,
            commandVersion: 2,
            viewVersion: 2,
            text: 'second version',
            from: 4,
            to: 7,
          },
        ],
      ]);
    });
    test('already committed commands need no render; unknown/old revisions and duplicate IDs are ignored', async () => {
      const t = setup();
      const before = t.rendered.mock.calls.length;
      await allSettled(t.model.select, {
        scope: t.scope,
        params: { id: 1, version: 0, from: 1, to: 2 },
      });
      expect(t.applied).toHaveBeenCalledTimes(1);
      expect(t.rendered).toHaveBeenCalledTimes(before);
      await allSettled(t.model.select, {
        scope: t.scope,
        params: { id: 1, version: 0, from: 1, to: 2 },
      });
      await allSettled(t.model.select, {
        scope: t.scope,
        params: { id: 2, version: -1, from: 1, to: 2 },
      });
      await allSettled(t.model.select, {
        scope: t.scope,
        params: { id: 3, version: 999, from: 1, to: 2 },
      });
      expect(t.applied).toHaveBeenCalledTimes(1);
      expect(t.scope.getState(t.model.pending)).toBeNull();
    });
  });
