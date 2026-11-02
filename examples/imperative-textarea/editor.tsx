import { reflect } from '@effector/reflect';
import { withImperativeEvents } from '@effector/reflect/imperative';
import React from 'react';

import {
  $documents,
  commandDelivered,
  EditorId,
  focusRequested,
  selectionRequested,
  textChanged,
} from './model';
import { TextareaHandle, TextareaView } from './textarea-view';

function reflectEditor(editorId: EditorId) {
  const ReflectedEditor = reflect({
    view: TextareaView,
    bind: {
      value: $documents.map((documents) => documents[editorId]),
      onChange: textChanged.prepend((text: string) => ({ editorId, text })),
      onCommand: commandDelivered.prepend((method: keyof TextareaHandle) => ({
        editorId,
        method,
      })),
    },
  });
  return withImperativeEvents({
    focus: focusRequested.filter({ fn: (targetId) => targetId === editorId }),
    selectRange: selectionRequested.filterMap(({ editorId: targetId, from, to }) =>
      targetId === editorId ? { from, to } : undefined,
    ),
  })(ReflectedEditor);
}

const editors = { left: reflectEditor('left'), right: reflectEditor('right') };

// Select a statically connected editor. No hooks or subscriptions in application code.
export function Editor({
  editorId,
  ...props
}: {
  editorId: EditorId;
  label: string;
  focusOnSelection?: boolean;
}) {
  const BoundEditor = editors[editorId];
  return <BoundEditor {...props} />;
}
