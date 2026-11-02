import { reflect } from '@effector/reflect';
import { createEffect, createEvent, createStore } from 'effector';
import React, { type ComponentProps, type Ref } from 'react';

import { withImperativeEvents } from '../../src/ssr/fixtures/minimal-imperative';

type Handle = { focus(): void; range(value: { from: number; to: number }): void };
function View(props: { events: Ref<Handle>; label: string; count?: number }) {
  return null;
}
const focus = createEvent<void>();
const range = createEvent<{ from: number; to: number }>();
const Editor = withImperativeEvents({ focus, range })(View);
<Editor label="hello" />;
// @ts-expect-error label required
<Editor />;
// @ts-expect-error wrong range payload
withImperativeEvents({ range: createEvent<string>() })(View);
// @ts-expect-error unknown key
withImperativeEvents({ typo: focus })(View);
// @ts-expect-error ref not externally writable
<Editor label="hello" events={React.createRef<Handle>()} />;

function pipe<A, B, C>(value: A, first: (value: A) => B, second: (value: B) => C): C {
  return second(first(value));
}
const Piped = pipe(
  View,
  (view) => reflect({ view, bind: { count: 1 } }),
  withImperativeEvents({ focus, range }),
);
<Piped label="piped" />;
<Piped label="piped" count={2} />;
// @ts-expect-error required own prop survives pipe
<Piped />;
// @ts-expect-error property type survives pipe
<Piped label={123} />;
// @ts-expect-error optional property type survives pipe
<Piped label="test" count="wrong" />;
// @ts-expect-error unknown property does not leak through pipe
<Piped label="test" extra="wrong" />;
// @ts-expect-error generated ref cannot be replaced through pipe
<Piped label="test" events={React.createRef<Handle>()} />;
const bad = createEvent<{ from: string; to: number }>();
pipe(
  View,
  (view) => reflect({ view, bind: {} }),
  // @ts-expect-error incompatible events rejected inside pipe
  withImperativeEvents({ range: bad }),
);

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Assert<T extends true> = T;
type IsAny<T> = 0 extends 1 & T ? true : false;
type EditorProps = ComponentProps<typeof Editor>;
type _NotAny = Assert<Equal<IsAny<EditorProps>, false>>;
type _Label = Assert<Equal<EditorProps['label'], string>>;
type _Count = Assert<Equal<EditorProps['count'], number | undefined>>;
type _NoKeyLoss = Assert<Equal<keyof EditorProps, 'label' | 'count' | 'events'>>;
type _PipedProps = Assert<Equal<ComponentProps<typeof Piped>, EditorProps>>;

// Payload compatibility is checked in the direction of delivery.
function StringView(_props: { events: Ref<{ show(value: string): void }> }) {
  return null;
}
function LiteralView(_props: { events: Ref<{ show(value: 'ready'): void }> }) {
  return null;
}
function UnknownView(_props: { events: Ref<{ show(value: unknown): void }> }) {
  return null;
}
withImperativeEvents({ show: createEvent<'ready'>() })(StringView);
withImperativeEvents({ show: createEvent<string>() })(UnknownView);
// @ts-expect-error a string source is wider than the accepted literal
withImperativeEvents({ show: createEvent<string>() })(LiteralView);
// @ts-expect-error unknown must not be silently narrowed
withImperativeEvents({ show: createEvent<unknown>() })(StringView);
// @ts-expect-error no payload cannot satisfy a required string
withImperativeEvents({ show: createEvent<void>() })(StringView);
withImperativeEvents({ focus: createEvent<string>() })(View);

function ArityView(_props: {
  events: Ref<{
    two(first: string, second: number): void;
    rest(...values: string[]): void;
    optional(value?: string): void;
    tuple(value: [string, number]): void;
    property: string;
    missing?: (value: string) => void;
  }>;
}) {
  return null;
}
// @ts-expect-error one event cannot provide two positional arguments
withImperativeEvents({ two: createEvent<string>() })(ArityView);
// @ts-expect-error unbounded positional arguments are outside the single-payload contract
withImperativeEvents({ rest: createEvent<string>() })(ArityView);
withImperativeEvents({ optional: createEvent<string | undefined>() })(ArityView);
withImperativeEvents({ tuple: createEvent<[string, number]>() })(ArityView);
// @ts-expect-error tuple payload is not spread into positional arguments
withImperativeEvents({ two: createEvent<[string, number]>() })(ArityView);
// @ts-expect-error properties cannot be called
withImperativeEvents({ property: createEvent<string>() })(ArityView);
// @ts-expect-error an optional method may be missing at runtime
withImperativeEvents({ missing: createEvent<string>() })(ArityView);

// A dependency's unchecked type must not bypass compatibility checks.
type Unchecked = ReturnType<typeof JSON.parse>;
declare const uncheckedPayload: import('effector').Event<Unchecked>;
// @ts-expect-error unchecked event payload
withImperativeEvents({ show: uncheckedPayload })(StringView);
function UncheckedHandle(_props: { events: Ref<Unchecked> }) {
  return null;
}
// @ts-expect-error unchecked handle
withImperativeEvents({ focus })(UncheckedHandle);
function UncheckedMethod(_props: { events: Ref<{ show(value: Unchecked): void }> }) {
  return null;
}
// @ts-expect-error unchecked method argument
withImperativeEvents({ show: createEvent<string>() })(UncheckedMethod);
function UncheckedProps(_props: Unchecked) {
  return null;
}
// @ts-expect-error unchecked component props
withImperativeEvents({ focus })(UncheckedProps);

function InvalidThisView(_props: {
  events: Ref<{ show(this: { other: true }, value: string): void }>;
}) {
  return null;
}
// @ts-expect-error the receiver is the handle, not another object
withImperativeEvents({ show: createEvent<string>() })(InvalidThisView);

// Omit must distribute over discriminated unions.
type UnionProps = { events: Ref<Handle> } & (
  | { kind: 'text'; text: string }
  | { kind: 'count'; count: number }
);
function UnionView(_props: UnionProps) {
  return null;
}
const UnionEditor = withImperativeEvents({ focus })(UnionView);
<UnionEditor kind="text" text="hello" />;
<UnionEditor kind="count" count={3} />;
// @ts-expect-error dependent field remains required
<UnionEditor kind="text" />;
// @ts-expect-error dependent field type remains exact
<UnionEditor kind="count" count="three" />;
// @ts-expect-error discriminants must not lose their field relationship
<UnionEditor kind="text" count={3} />;

const MemoEditor = withImperativeEvents({ focus })(React.memo(View));
<MemoEditor label="memo" />;
// @ts-expect-error memo does not erase required props
<MemoEditor />;
const ForwardedView = React.forwardRef<
  HTMLTextAreaElement,
  { events: Ref<Handle>; label: string }
>((_props, _ref) => null);
const ForwardedEditor = withImperativeEvents({ focus })(ForwardedView);
<ForwardedEditor label="forwarded" ref={React.createRef<HTMLTextAreaElement>()} />;
// @ts-expect-error ref type is preserved
<ForwardedEditor label="forwarded" ref={React.createRef<HTMLInputElement>()} />;

const BoundEditor = pipe(
  View,
  (view) => reflect({ view, bind: { label: 'bound' } }),
  withImperativeEvents({ focus }),
);
<BoundEditor />;
<BoundEditor label="override" />;
// @ts-expect-error bound props remain typed
<BoundEditor label={1} />;
// @ts-expect-error Store cannot be used as an imperative event
withImperativeEvents({ focus: createStore(0) });
// @ts-expect-error effects are not event sources
withImperativeEvents({ focus: createEffect(() => {}) });

const symbol = Symbol('method');
function SymbolView(_props: { events: Ref<{ [symbol](): void }> }) {
  return null;
}
// @ts-expect-error runtime dispatch supports string method names
withImperativeEvents({ [symbol]: focus })(SymbolView);

function OptionalRefView(_props: { events?: Ref<Handle>; label: string }) {
  return null;
}
const OptionalRefEditor = withImperativeEvents({ focus })(OptionalRefView);
<OptionalRefEditor label="optional" />;
// @ts-expect-error own required props stay required even with an optional ref
<OptionalRefEditor />;

// Callback parameters remain contextually typed after composition.
function CallbackView(_props: {
  events: Ref<Handle>;
  label: string;
  onChange(value: { text: string; version: number }): void;
}) {
  return null;
}
const CallbackEditor = pipe(
  CallbackView,
  (view) => reflect({ view, bind: { label: 'bound' } }),
  withImperativeEvents({ focus }),
);
<CallbackEditor
  onChange={(value) => {
    const text: string = value.text;
    const version: number = value.version;
    // @ts-expect-error the callback payload is not unchecked
    const wrong: number = value.text;
    // @ts-expect-error unknown callback property
    value.missing;
  }}
/>;
// @ts-expect-error required callback survives binding and pipe
<CallbackEditor />;
