import { reflect } from '@effector/reflect';
import { createWatch } from 'effector';
import { useProvidedScope, useUnit } from 'effector-react';
import React, { useLayoutEffect, useRef } from 'react';

import {
  $documents,
  commandDelivered,
  EditorId,
  focusRequested,
  selectionRequested,
  textChanged,
} from './model';
import { TextareaHandle, TextareaView } from './textarea-view';

function bindTextarea(editorId: EditorId) {
  return reflect({
    view: TextareaView,
    bind: {
      value: $documents.map((documents) => documents[editorId]),
      onChange: textChanged.prepend((text: string) => ({ editorId, text })),
    },
  });
}
const boundEditors = { left: bindTextarea('left'), right: bindTextarea('right') };

// Example integration adapter, not a built-in Reflect event-binding API.
export function Editor({
  editorId,
  label,
  focusOnSelection = true,
}: {
  editorId: EditorId;
  label: string;
  focusOnSelection?: boolean;
}) {
  const handle = useRef<TextareaHandle>(null);
  const scope = useProvidedScope();
  const delivered = useUnit(commandDelivered);

  useLayoutEffect(() => {
    if (!scope) throw new Error('Editor requires an Effector Provider.');

    const stopFocus = createWatch({
      unit: focusRequested,
      scope,
      fn: (targetId) => {
        if (targetId !== editorId || !handle.current) return;
        handle.current.focus();
        delivered({ editorId, method: 'focus' });
      },
    });
    const stopSelection = createWatch({
      unit: selectionRequested,
      scope,
      fn: ({ editorId: targetId, from, to }) => {
        if (targetId !== editorId || !handle.current) return;
        handle.current.selectRange({ from, to });
        delivered({ editorId, method: 'selectRange' });
      },
    });

    return () => {
      stopFocus();
      stopSelection();
    };
  }, [scope, editorId, delivered]);

  const BoundTextarea = boundEditors[editorId];
  return (
    <BoundTextarea
      events={handle}
      label={label}
      focusOnSelection={focusOnSelection}
    />
  );
}
