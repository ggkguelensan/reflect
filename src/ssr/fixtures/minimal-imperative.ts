import { createWatch, type Event } from 'effector';
import { useProvidedScope } from 'effector-react';
import { type ComponentType, createElement, type Ref, useMemo } from 'react';

type IsAny<Value> = 0 extends 1 & Value ? true : false;
type OwnProps<Props> = Props extends unknown ? Omit<Props, 'events'> : never;
type Methods<Payloads> = {
  [Key in keyof Payloads]: (payload: Payloads[Key]) => unknown;
};
type HandleOf<Props> = 'events' extends keyof Props
  ? NonNullable<Props['events']> extends Ref<infer Handle>
    ? Handle
    : never
  : never;
type InvalidKeys<Props, Payloads> = {
  [Key in keyof Payloads]: IsAny<Payloads[Key]> extends true
    ? Key
    : Key extends keyof HandleOf<Props>
    ? HandleOf<Props>[Key] extends (...args: infer Args) => unknown
      ? IsAny<Args[number]> extends true
        ? Key
        : HandleOf<Props> extends ThisParameterType<HandleOf<Props>[Key]>
        ? Args['length'] extends 0 | 1
          ? Args extends []
            ? never
            : [Payloads[Key]] extends Args
            ? never
            : Key
          : Key
        : Key
      : Key
    : Key;
}[keyof Payloads];
type Compatible<Props, Payloads> = Exclude<keyof Payloads, string> extends never
  ? IsAny<Props> extends true
    ? never
    : unknown extends HandleOf<Props>
    ? never
    : [HandleOf<Props>] extends [never]
    ? never
    : [InvalidKeys<Props, Payloads>] extends [never]
    ? unknown
    : never
  : never;
type Sources<Payloads> = { [Key in keyof Payloads]: Event<Payloads[Key]> };

export const withImperativeEvents =
  <Payloads extends Record<string, unknown>>(events: Sources<Payloads>) =>
  <Props extends object>(
    View: ComponentType<Props> &
      ComponentType<
        OwnProps<Props> & { events: (handle: Methods<Payloads> | null) => void }
      > &
      Compatible<Props, Payloads>,
  ) =>
  (props: OwnProps<Props> & { events?: never }) => {
    const scope = useProvidedScope();
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
                ...(scope ? { scope } : {}),
                fn: (payload) => handle[method](payload),
              }),
            );
          }
        }
      };
    }, [scope]);
    return createElement(View, { ...props, events: ref });
  };
