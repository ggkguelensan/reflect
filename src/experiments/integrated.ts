import * as context from 'effector-react';
import type { ComponentType } from 'react';

import { type ReflectedResult, reflectFactory } from '../core/reflect';
import type { BindProps } from '../core/types';
import type {
  ConnectedView,
  Sources,
} from '../ssr/fixtures/minimal-imperative-types';
import { useImperativeEvents } from './use-imperative-events';

const baseReflect = reflectFactory(context);
type EventConfig<Props extends object, Bind, Payloads> = {
  view: ConnectedView<Props, Payloads>;
  bind: Bind & { events?: never };
  events: Sources<Payloads>;
};
type Result<Props, Bind> = ReflectedResult<Props, Bind, 'events'>;

export function reflectWithEvents<
  Props extends object,
  Bind extends Partial<BindProps<Props>>,
  Payloads extends Record<string, unknown>,
>(config: EventConfig<Props, Bind, Payloads>): Result<Props, Bind> {
  return baseReflect<Props, Bind, 'events'>(config, () => ({
    events: useImperativeEvents(config.events),
  }));
}

// Candidate B: a public reflect with an optional events field.
export function reflect<
  Props extends object,
  Bind extends Partial<BindProps<Props>>,
  Payloads extends Record<string, unknown>,
>(config: EventConfig<Props, Bind, Payloads>): Result<Props, Bind>;
export function reflect<
  Props extends object,
  Bind extends Partial<BindProps<Props>>,
>(config: {
  view: ComponentType<Props>;
  bind: Bind;
  events?: never;
}): ReflectedResult<Props, Bind>;
export function reflect<
  Props extends object,
  Bind extends Partial<BindProps<Props>>,
  Payloads extends Record<string, unknown>,
>(
  config:
    | { view: ComponentType<Props>; bind: Bind; events?: never }
    | EventConfig<Props, Bind, Payloads>,
) {
  const sources = config.events;
  return sources
    ? baseReflect<Props, Bind, 'events'>(config, () => ({
        events: useImperativeEvents(sources),
      }))
    : baseReflect(config);
}
