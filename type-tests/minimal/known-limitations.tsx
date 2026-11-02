import { createEvent } from 'effector';
import React, { type ComponentProps, type Ref } from 'react';

import { withImperativeEvents } from '../../src/ssr/fixtures/minimal-imperative';

// Characterization of a known limitation, not a supported inference guarantee:
// the HOC specializes a generic View at unknown; it does not preserve its type parameter.
function GenericView<Value>(_props: {
  events: Ref<{ show(value: Value): void }>;
  value: Value;
  onChange: (value: Value) => void;
}) {
  return null;
}
const GenericEditor = withImperativeEvents({ show: createEvent<string>() })(
  GenericView,
);
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Assert<Value extends true> = Value;
type _ErasedGeneric = Assert<
  Equal<ComponentProps<typeof GenericEditor>['value'], unknown>
>;

<GenericEditor
  value="text"
  onChange={(value) => {
    const unknownValue: unknown = value;
  }}
/>;
// @ts-expect-error known limitation: the valid generic string callback is no longer inferred
<GenericEditor value="text" onChange={(value: string) => value.toUpperCase()} />;

// Explicit specialization retains the relationship without a cast.
const StringEditor = withImperativeEvents({ show: createEvent<string>() })(
  GenericView<string>,
);
<StringEditor value="text" onChange={(value) => value.toUpperCase()} />;
// @ts-expect-error specialization keeps the dependent value type
<StringEditor value={123} onChange={(value) => value.toUpperCase()} />;
