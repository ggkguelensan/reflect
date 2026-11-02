import { createWatch, type Event } from 'effector';
import { useProvidedScope } from 'effector-react';
import { createElement, useMemo } from 'react';

import type {
  ConnectedView,
  Methods,
  OwnProps,
  Sources,
} from './minimal-imperative-types';

export const withImperativeEvents =
  <Payloads extends Record<string, unknown>>(events: Sources<Payloads>) =>
  <Props extends object>(View: ConnectedView<Props, Payloads>) =>
  (props: OwnProps<Props> & { events?: never }) => {
    const scope = useProvidedScope();
    if (!scope) throw new Error();
    const ref = useMemo(() => {
      let subscriptions: Array<() => void> = [];
      return (handle: Methods<Payloads> | null) => {
        subscriptions.forEach((stop) => stop());
        subscriptions = [];
        if (handle) {
          for (const method in { ...events }) {
            subscriptions.push(
              createWatch({
                unit: events[method],
                scope,
                fn: (payload) => handle[method](payload),
              }),
            );
          }
        }
      };
    }, [scope]);
    return createElement(View, { ...props, events: ref });
  };
