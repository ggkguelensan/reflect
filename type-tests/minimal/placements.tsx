import { reflect } from '@effector/reflect';
import { createEvent, createStore } from 'effector';
import React, { type Ref } from 'react';

import {
  reflect as reflectField,
  reflectWithEvents,
} from '../../src/experiments/integrated';
import { withImperativeEvents } from '../../src/experiments/with-events';

function View(_props: {
  events: Ref<{ show(value: number): void }>;
  value: number;
  label: string;
}) {
  return null;
}
const events = { show: createEvent<number>() };
const bind = { value: createStore(0) };
const Outer = withImperativeEvents(events)(reflect({ view: View, bind }));
const Inner = reflect({ view: withImperativeEvents(events)(View), bind });
const Field = reflectField({ view: View, bind, events });
const Separate = reflectWithEvents({ view: View, bind, events });
<Outer label="x" />;
<Inner label="x" />;
<Field label="x" />;
<Separate label="x" />;
// @ts-expect-error wrong payload
reflectField({ view: View, bind, events: { show: createEvent<string>() } });
// @ts-expect-error wrong payload
reflectWithEvents({ view: View, bind, events: { show: createEvent<string>() } });
// @ts-expect-error own prop remains required
<Field />;
// @ts-expect-error own prop remains required
<Separate />;
// @ts-expect-error injected prop is private
<Field label="x" events={React.createRef()} />;
// @ts-expect-error wrong bound value type
reflectWithEvents({ view: View, bind: { value: createStore('wrong') }, events });

function pipe<A, B, C>(value: A, first: (value: A) => B, second: (value: B) => C): C {
  return second(first(value));
}
const InnerPipe = pipe(View, withImperativeEvents(events), (view) =>
  reflect({ view, bind }),
);
const OuterPipe = pipe(
  View,
  (view) => reflect({ view, bind }),
  withImperativeEvents(events),
);
<InnerPipe label="x" />;
<OuterPipe label="x" />;
// @ts-expect-error own prop required after pipe
<InnerPipe />;
// @ts-expect-error wrong own prop after pipe
<OuterPipe label={1} />;
// @ts-expect-error wrong event method
reflectField({ view: View, bind, events: { missing: createEvent<number>() } });
// @ts-expect-error store is not an event
reflectWithEvents({ view: View, bind, events: { show: createStore(1) } });
const invalidConfig = { view: View, bind, events: { show: createEvent<string>() } };
// @ts-expect-error the ordinary-reflect overload must not bypass event validation
reflectField(invalidConfig);
reflectWithEvents({
  view: View,
  // @ts-expect-error generated events ref must not be bound
  bind: { ...bind, events: React.createRef() },
  events,
});
// @ts-expect-error void events are only valid bindings for callbacks, not numeric values
reflectWithEvents({ view: View, bind: { value: createEvent<void>() }, events });
// @ts-expect-error injected prop private for separate export
<Separate label="x" events={React.createRef()} />;
// @ts-expect-error optional bound prop override remains typed
<Separate label="x" value="bad" />;
// @ts-expect-error optional bound prop override remains typed
<Field label="x" value="bad" />;
// @ts-expect-error unknown payload is not accepted by numeric method
reflectWithEvents({ view: View, bind, events: { show: createEvent<unknown>() } });

type PropsOf<Component> = Component extends React.ComponentType<infer Props>
  ? Props
  : never;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Assert<Value extends true> = Value;
type _OuterLabel = Assert<Equal<PropsOf<typeof Outer>['label'], string>>;
type _InnerLabel = Assert<Equal<PropsOf<typeof Inner>['label'], string>>;
type _FieldLabel = Assert<Equal<PropsOf<typeof Field>['label'], string>>;
type _SeparateLabel = Assert<Equal<PropsOf<typeof Separate>['label'], string>>;
type _FieldValue = Assert<Equal<PropsOf<typeof Field>['value'], number | undefined>>;
type _SeparateValue = Assert<
  Equal<PropsOf<typeof Separate>['value'], number | undefined>
>;
