import { reflect } from '@effector/reflect';
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
  return reflect({
    view: TextareaView,
    bind: {
      value: $documents.map((documents) => documents[editorId]),
      onChange: textChanged.prepend((text: string) => ({ editorId, text })),
      onCommand: commandDelivered.prepend((method: keyof TextareaHandle) => ({
        editorId,
        method,
      })),
    },
    events: {
      focus: focusRequested.filter({ fn: (targetId) => targetId === editorId }),
      selectRange: selectionRequested.filterMap(({ editorId: targetId, from, to }) =>
        targetId === editorId ? { from, to } : undefined,
      ),
    },
  });
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
