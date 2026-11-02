import type { Event } from 'effector';
import type { ComponentType, Ref } from 'react';

// The runtime delivers exactly one payload and calls the method with its handle as `this`.
type IsAny<Value> = 0 extends 1 & Value ? true : false;
type All<Checks extends readonly boolean[]> = false extends Checks[number]
  ? false
  : true;
type IsConcrete<Handle> = unknown extends Handle
  ? false
  : [Handle] extends [never]
  ? false
  : true;

type HandleOf<Props> = 'events' extends keyof Props
  ? NonNullable<Props['events']> extends Ref<infer Handle>
    ? Handle
    : never
  : never;

type AcceptsPayload<Args extends readonly unknown[], Payload> = Args extends []
  ? true
  : [Payload] extends Args
  ? true
  : false;

type AcceptsMethod<Handle, Method, Payload> = Method extends (
  ...args: infer Args
) => unknown
  ? All<
      [
        IsAny<Payload> extends true ? false : true,
        IsAny<Args[number]> extends true ? false : true,
        Handle extends ThisParameterType<Method> ? true : false,
        Args['length'] extends 0 | 1 ? true : false,
        AcceptsPayload<Args, Payload>,
      ]
    >
  : false;

type InvalidMethods<Handle, Payloads> = {
  [Key in keyof Payloads]: Key extends keyof Handle
    ? AcceptsMethod<Handle, Handle[Key], Payloads[Key]> extends true
      ? never
      : Key
    : Key;
}[keyof Payloads];

// Keep the four independent rules visible instead of nesting conditional branches.
type Compatible<Props, Payloads> = All<
  [
    IsAny<Props> extends true ? false : true,
    IsConcrete<HandleOf<Props>>,
    Exclude<keyof Payloads, string> extends never ? true : false,
    [InvalidMethods<HandleOf<Props>, Payloads>] extends [never] ? true : false,
  ]
> extends true
  ? unknown
  : never;

export type Sources<Payloads> = { [Key in keyof Payloads]: Event<Payloads[Key]> };
export type Methods<Payloads> = {
  [Key in keyof Payloads]: (payload: Payloads[Key]) => unknown;
};
export type OwnProps<Props> = Props extends unknown ? Omit<Props, 'events'> : never;

// The second component constraint proves prop injection to createElement, without a cast.
export type ConnectedView<Props, Payloads> = ComponentType<Props> &
  ComponentType<
    OwnProps<Props> & { events: (handle: Methods<Payloads> | null) => void }
  > &
  Compatible<Props, Payloads>;
