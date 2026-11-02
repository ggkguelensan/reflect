import React, { useRef, useState } from 'react';

import { TextareaHandle, TextareaView } from './textarea-view';
import { findTodo, firstWordRange } from './validation';

// The same View can be used without Effector, Reflect or an integration adapter.
export function LocalEditor() {
  const [text, setText] = useState(
    'A React-only document. TODO: finish this example.',
  );
  const [result, setResult] = useState<string | null>(null);
  const handle = useRef<TextareaHandle>(null);

  return (
    <section aria-label="React editor">
      <TextareaView
        events={handle}
        value={text}
        onChange={(value) => {
          setText(value);
          setResult(null);
        }}
        label="React document"
      />
      <div className="toolbar">
        <button onClick={() => handle.current?.focus()}>Focus textarea</button>
        <button onClick={() => handle.current?.selectRange(firstWordRange(text))}>
          Select first word
        </button>
        <button
          onClick={() => {
            const range = findTodo(text);
            setResult(
              range ? `TODO found at character ${range.from + 1}` : 'No errors',
            );
            if (range) handle.current?.selectRange(range);
          }}
        >
          Check text
        </button>
      </div>
      <p role="status">{result ?? 'Not checked'}</p>
    </section>
  );
}
