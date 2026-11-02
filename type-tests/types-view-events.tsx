import { createReflect, reflect } from '@effector/reflect';
import { withImperativeEvents } from '@effector/reflect/imperative';
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
const Connected = withImperativeEvents({ focus, selectRange: range })(
  reflect({ view: View, bind: {} }),
);
<Connected label="Editor" />;
// @ts-expect-error the events ref belongs to the operator
<Connected label="Editor" events={React.createRef<Handle>()} />;
// @ts-expect-error own props still required
<Connected />;
// @ts-expect-error wrong method payload
withImperativeEvents({ selectRange: wrong })(View);
// @ts-expect-error unknown handle method
withImperativeEvents({ missing: focus })(View);
// @ts-expect-error a store is not an event
withImperativeEvents({ focus: createStore('value') })(View);
// @ts-expect-error a single event delivers one payload, not multiple positional arguments
withImperativeEvents({ multiple: focus })(View);
// @ts-expect-error the View must declare an events ref
withImperativeEvents({ focus })((_props: { label: string }) => null);
const Plain = reflect({ view: View, bind: {} });
<Plain label="Plain ref" events={React.createRef<Handle>()} />;
const FactoryConnected = withImperativeEvents({ focus })(createReflect(View)({}));
<FactoryConnected label="Factory" />;
const ReactOnly = withImperativeEvents({ focus })(View);
<ReactOnly label="React" />;

const Forwarded = React.forwardRef<
  HTMLInputElement,
  { events: Ref<Handle>; title: string }
>((_props, _ref) => null);
const WithForwardedRef = withImperativeEvents({ focus })(Forwarded);
<WithForwardedRef title="Input" ref={React.createRef<HTMLInputElement>()} />;
// @ts-expect-error preserve the component's forwarded ref type
<WithForwardedRef title="Input" ref={React.createRef<HTMLTextAreaElement>()} />;

// Composition uses ordinary function application; no pipe/compose dependency.
declare function pipe<A, B, C>(
  value: A,
  first: (value: A) => B,
  second: (value: B) => C,
): C;
const Piped = pipe(
  View,
  (view) => reflect({ view, bind: {} }),
  withImperativeEvents({ focus }),
);
<Piped label="Piped" />;
declare function compose<A, B, C>(
  last: (value: B) => C,
  first: (value: A) => B,
): (value: A) => C;
const Composed = compose(withImperativeEvents({ focus }), (view: typeof View) =>
  reflect({ view, bind: {} }),
)(View);
<Composed label="Composed" />;
