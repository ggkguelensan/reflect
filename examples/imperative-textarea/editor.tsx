import { reflect } from '@effector/reflect';
import { createWatch } from 'effector';
import { useProvidedScope } from 'effector-react';
import React, { useLayoutEffect, useRef } from 'react';

import { $text, focusRequested, selectionRequested, textChanged } from './model';
import { TextareaHandle, TextareaView } from './textarea-view';

const BoundTextarea = reflect({
  view: TextareaView,
  bind: {
    value: $text,
    onChange: textChanged,
  },
});

// Example integration adapter, not a built-in Reflect event-binding API.
export function Editor({ label }: { label: string }) {
  const handle = useRef<TextareaHandle>(null);
  const scope = useProvidedScope();

  useLayoutEffect(() => {
    if (!scope) throw new Error('Editor requires an Effector Provider.');

    const stopFocus = createWatch({
      unit: focusRequested,
      scope,
      fn: () => handle.current?.focus(),
    });
    const stopSelection = createWatch({
      unit: selectionRequested,
      scope,
      fn: (range) => handle.current?.selectRange(range),
    });

    return () => {
      stopFocus();
      stopSelection();
    };
  }, [scope]);

  return <BoundTextarea events={handle} label={label} />;
}
