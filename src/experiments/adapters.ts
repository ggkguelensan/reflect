import { reflect } from '@effector/reflect';
import type { Event, EventCallable, Store } from 'effector';
import type { ComponentType, FunctionComponent, Ref } from 'react';

import { reflect as reflectField, reflectWithEvents } from './integrated';
import { withImperativeEvents } from './with-events';

export type Snapshot = { version: number; text: string };
export type Command = { id: number; version: number; from: number; to: number };
export type EditorProps = {
  events: Ref<{ execute(command: Command): void }>;
  snapshot: Snapshot;
  onCommitted(version: number): void;
  label: string;
};
type Config = {
  view: FunctionComponent<EditorProps>;
  document: Store<Snapshot>;
  command: Event<Command>;
  committed: EventCallable<number>;
};
export const adapters: {
  name: string;
  connect(config: Config): ComponentType<{ label: string }>;
}[] = [
  {
    name: 'outer',
    connect({ view, document, command, committed }) {
      return withImperativeEvents({ execute: command })(
        reflect({ view, bind: { snapshot: document, onCommitted: committed } }),
      );
    },
  },
  {
    name: 'inner',
    connect({ view, document, command, committed }) {
      return reflect({
        view: withImperativeEvents({ execute: command })(view),
        bind: { snapshot: document, onCommitted: committed },
      });
    },
  },
  {
    name: 'field',
    connect({ view, document, command, committed }) {
      return reflectField({
        view,
        bind: { snapshot: document, onCommitted: committed },
        events: { execute: command },
      });
    },
  },
  {
    name: 'separate',
    connect({ view, document, command, committed }) {
      return reflectWithEvents({
        view,
        bind: { snapshot: document, onCommitted: committed },
        events: { execute: command },
      });
    },
  },
];
