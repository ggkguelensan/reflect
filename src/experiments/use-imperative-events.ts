import { createWatch } from 'effector';
import { useProvidedScope } from 'effector-react';
import { useMemo } from 'react';

import type { Methods, Sources } from '../ssr/fixtures/minimal-imperative-types';

export function useImperativeEvents<Payloads extends Record<string, unknown>>(
  events: Sources<Payloads>,
) {
  const scope = useProvidedScope();
  if (!scope) throw new Error('Provider required');
  return useMemo(() => {
    let subscriptions: Array<() => void> = [];
    return (handle: Methods<Payloads> | null) => {
      subscriptions.forEach((stop) => stop());
      subscriptions = [];
      if (handle)
        for (const key in { ...events }) {
          subscriptions.push(
            createWatch({
              unit: events[key],
              scope,
              fn: (payload) => handle[key](payload),
            }),
          );
        }
    };
  }, [scope]);
}
