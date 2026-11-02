import { createReflect, reflect } from '@effector/reflect';
import { createEvent, createStore } from 'effector';
import React, { Ref } from 'react';

type Handle = {
  focus(): void;
  selectRange(range: { from: number; to: number }): void;
  multiple(first: string, second: string): void;
};
function View(_props: { events: Ref<Handle>; label: string }) {
  return null;
}
const focus = createEvent<string>();
const range = createEvent<{ from: number; to: number }>();
const wrong = createEvent<number>();
const Connected = reflect({
  view: View,
  bind: {},
  events: { focus, selectRange: range },
});
<Connected label="Editor" />;
// @ts-expect-error the events ref belongs to Reflect when event delivery is configured
<Connected label="Editor" events={React.createRef<Handle>()} />;
// @ts-expect-error own props still required
<Connected />;
reflect({
  view: View,
  bind: {},
  events: {
    // @ts-expect-error wrong method payload
    selectRange: wrong,
  },
});
reflect({
  view: View,
  bind: {},
  events: {
    // @ts-expect-error unknown handle method
    missing: focus,
  },
});
reflect({
  view: View,
  bind: {},
  events: {
    // @ts-expect-error a store is not an event
    focus: createStore('value'),
  },
});
reflect({
  view: View,
  bind: {},
  events: {
    // @ts-expect-error a single event delivers one payload, not multiple positional arguments
    multiple: focus,
  },
});
reflect({
  view: (_props: { label: string }) => null,
  bind: {},
  events: {
    // @ts-expect-error the View must declare an events ref
    focus,
  },
});
reflect({
  view: View,
  // @ts-expect-error the generated events prop cannot also be bound
  bind: { events: React.createRef<Handle>() },
  events: { focus },
});
const Plain = reflect({ view: View, bind: {} });
<Plain label="Plain ref" events={React.createRef<Handle>()} />;
const FactoryConnected = createReflect(View)({}, { events: { focus } });
<FactoryConnected label="Factory" />;
