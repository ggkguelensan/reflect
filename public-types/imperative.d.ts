import type { Event } from 'effector';
import type { ComponentProps, ComponentType, NamedExoticComponent, Ref } from 'react';

type HandleOf<Props> = 'events' extends keyof Props
  ? NonNullable<Props['events']> extends Ref<infer Handle>
    ? Handle
    : never
  : never;

type CompatibleEvents<Props, Sources> = [HandleOf<Props>] extends [never]
  ? never
  : {
      [Key in keyof Sources]: Key extends keyof HandleOf<Props>
        ? HandleOf<Props>[Key] extends (...args: infer Args) => unknown
          ? Args extends []
            ? Sources[Key]
            : Args extends [infer Payload]
            ? Event<Payload>
            : never
          : never
        : never;
    };

/**
 * Connect scoped Effector events to methods exposed through the View's events ref.
 * Works with React Views and components returned by reflect/createReflect.
 * Requires Provider; subscriptions follow the committed imperative handle.
 */
export function withImperativeEvents<Sources extends Record<string, Event<any>>>(
  events: Sources,
  options?: { onError?: (error: unknown) => void },
): <View extends ComponentType<any>>(
  view: View &
    (Sources extends CompatibleEvents<ComponentProps<View>, Sources>
      ? unknown
      : never),
) => NamedExoticComponent<Omit<ComponentProps<View>, 'events'> & { events?: never }>;
