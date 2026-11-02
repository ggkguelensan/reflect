import { createWatch, type Event } from 'effector';
import { useProvidedScope } from 'effector-react';
import { type ComponentType, createElement, type Ref, useMemo } from 'react';

// Experimental narrow contract: valid event/method pairs under Provider.
// No error handler, config validation, or separate forwarded ref.
export const withImperativeEvents =
  (events: Record<string, Event<any>>) =>
  <Props extends { events: Ref<any> }>(View: ComponentType<Props>) =>
  (props: Omit<Props, 'events'>) => {
    const scope = useProvidedScope();
    const ref = useMemo(() => {
      let subscriptions: Array<() => void> = [];
      return (handle: Record<string, (payload: any) => unknown> | null) => {
        subscriptions.forEach((stop) => stop());
        subscriptions = [];
        if (handle) {
          subscriptions = Object.entries(events).map(([method, unit]) =>
            createWatch({
              unit,
              scope: scope!,
              fn: (payload) => handle[method](payload),
            }),
          );
        }
      };
    }, [scope]);
    return createElement(View, { ...props, events: ref } as Props);
  };
