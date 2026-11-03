import { createEvent, createStore, sample } from 'effector';

import type { Command, Snapshot } from './adapters';

// Latest selection wins. Only known document versions are selectable; IDs are monotonic.
export function createCommittedModel() {
  const replace = createEvent<{
    snapshot: Snapshot;
    id: number;
    from: number;
    to: number;
  }>();
  const accepted = createEvent<{
    snapshot: Snapshot;
    id: number;
    from: number;
    to: number;
  }>();
  const select = createEvent<Command>();
  const selectionAccepted = createEvent<Command>();
  const committed = createEvent<number>();
  const ready = createEvent<Command>();
  const document = createStore<Snapshot>({ version: 0, text: 'abc' }).on(
    accepted,
    (_, intent) => intent.snapshot,
  );
  const revision = createStore(-1).on(committed, (current, value) =>
    Math.max(current, value),
  );
  const handled = createStore(-1).on(ready, (_, command) => command.id);
  const pending = createStore<Command | null>(null)
    .on(accepted, (_, intent) => ({
      id: intent.id,
      version: intent.snapshot.version,
      from: intent.from,
      to: intent.to,
    }))
    .on(selectionAccepted, (_, command) => command)
    .on(committed, (command, version) =>
      command && command.version < version ? null : command,
    )
    .reset(ready);
  sample({
    clock: replace,
    source: { document, handled, pending },
    filter: ({ document, handled, pending }, intent) =>
      intent.snapshot.version > document.version &&
      intent.id > Math.max(handled, pending?.id ?? -1),
    fn: (_, intent) => intent,
    target: accepted,
  });
  sample({
    clock: select,
    source: { document, handled, pending },
    filter: ({ document, handled, pending }, command) =>
      document.version === command.version &&
      command.id > Math.max(handled, pending?.id ?? -1),
    fn: (_, command) => command,
    target: selectionAccepted,
  });
  sample({
    clock: [committed, selectionAccepted],
    source: { pending, revision, handled },
    filter: ({ pending, revision, handled }) =>
      pending !== null && pending.version === revision && pending.id > handled,
    fn: ({ pending }) => {
      if (!pending) throw new Error('Missing selection');
      return pending;
    },
    target: ready,
  });
  return { replace, select, committed, ready, document, pending };
}
