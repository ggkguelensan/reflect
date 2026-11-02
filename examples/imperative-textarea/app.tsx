import { reflect } from '@effector/reflect';
import { fork } from 'effector';
import { Provider } from 'effector-react';
import React, { useState } from 'react';

import { Editor } from './editor';
import { LocalEditor } from './local-editor';
import {
  $history,
  $validation,
  EditorId,
  firstWordRequested,
  focusRequested,
  historyCleared,
  validateRequested,
} from './model';

function ToolbarView({
  editorId,
  onFocus,
  onSelectFirstWord,
  onValidate,
}: {
  editorId: EditorId;
  onFocus(editorId: EditorId): void;
  onSelectFirstWord(editorId: EditorId): void;
  onValidate(editorId: EditorId): void;
}) {
  return (
    <div className="toolbar">
      <button onClick={() => onFocus(editorId)}>Focus textarea</button>
      <button onClick={() => onSelectFirstWord(editorId)}>Select first word</button>
      <button onClick={() => onValidate(editorId)}>Check text</button>
    </div>
  );
}
const Toolbar = reflect({
  view: ToolbarView,
  bind: {
    onFocus: focusRequested,
    onSelectFirstWord: firstWordRequested,
    onValidate: validateRequested,
  },
});

function ValidationView({ result }: { result: string | null }) {
  return <p role="status">{result ?? 'Not checked'}</p>;
}
const validationViews = {
  left: reflect({
    view: ValidationView,
    bind: { result: $validation.map((results) => results.left) },
  }),
  right: reflect({
    view: ValidationView,
    bind: { result: $validation.map((results) => results.right) },
  }),
};

function EditorCard({ editorId, name }: { editorId: EditorId; name: string }) {
  const [visible, setVisible] = useState(true);
  const [focusOnSelection, setFocusOnSelection] = useState(true);
  const Validation = validationViews[editorId];
  return (
    <section aria-label={`${name} editor`}>
      <h2>{name} editor</h2>
      <div className="settings">
        <button onClick={() => setVisible((value) => !value)}>
          {visible ? 'Hide editor' : 'Show editor'}
        </button>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={focusOnSelection}
            onChange={(event) => setFocusOnSelection(event.currentTarget.checked)}
          />
          Focus when selecting
        </label>
      </div>
      {visible ? (
        <Editor
          editorId={editorId}
          label={`${name} document`}
          focusOnSelection={focusOnSelection}
        />
      ) : (
        <p>Editor unmounted. Commands are logged but will not be replayed.</p>
      )}
      <Toolbar editorId={editorId} />
      <Validation />
    </section>
  );
}

function HistoryView({ entries, onClear }: { entries: string[]; onClear(): void }) {
  return (
    <section aria-label="Command history">
      <h2>Command history</h2>
      <p>Requested = model event. Delivered = a mounted View method returned.</p>
      <button onClick={onClear} disabled={entries.length === 0}>
        Clear history
      </button>
      {entries.length ? (
        <ol aria-label="Latest commands">
          {entries.map((entry, index) => (
            <li key={index}>{entry}</li>
          ))}
        </ol>
      ) : (
        <p>No commands yet.</p>
      )}
    </section>
  );
}
const History = reflect({
  view: HistoryView,
  bind: { entries: $history, onClear: historyCleared },
});
const scope = fork();

export function App() {
  const [mode, setMode] = useState('effector');
  return (
    <main>
      <h1>Effector events → React methods</h1>
      <fieldset className="settings">
        <legend>Control the same React View with</legend>
        {['effector', 'react'].map((value) => (
          <label className="checkbox" key={value}>
            <input
              type="radio"
              name="mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {value === 'effector' ? 'Effector + Reflect' : 'React ref only'}
          </label>
        ))}
      </fieldset>
      {mode === 'effector' ? (
        <Provider value={scope}>
          <p>
            Both editors share one Scope. Commands carry an editor ID. Check text to
            select the first TODO; remove all TODOs to pass validation. Hide an editor
            and send commands to see that they are not replayed when it returns.
          </p>
          <div className="editors">
            <EditorCard editorId="left" name="Left" />
            <EditorCard editorId="right" name="Right" />
          </div>
          <History />
        </Provider>
      ) : (
        <>
          <p>
            This instance uses only React state and a ref to the same TextareaView.
          </p>
          <LocalEditor />
        </>
      )}
    </main>
  );
}
