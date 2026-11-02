import { reflect } from '@effector/reflect';
import { fork } from 'effector';
import { Provider } from 'effector-react';
import React from 'react';

import { Editor } from './editor';
import { firstWordRequested, focusRequested } from './model';

function ToolbarView({
  onFocus,
  onSelectFirstWord,
}: {
  onFocus(): void;
  onSelectFirstWord(): void;
}) {
  return (
    <div className="toolbar">
      <button onClick={onFocus}>Focus textarea</button>
      <button onClick={onSelectFirstWord}>Select first word</button>
    </div>
  );
}

const Toolbar = reflect({
  view: ToolbarView,
  bind: {
    onFocus: focusRequested,
    onSelectFirstWord: firstWordRequested,
  },
});

const leftScope = fork();
const rightScope = fork();

export function App() {
  return (
    <main>
      <h1>Effector events → React methods</h1>
      <p>
        Edit either document, then focus it or select its first word. Each editor uses
        its own Effector Scope. Buttons affect only their own editor.
      </p>
      <div className="editors">
        <Provider value={leftScope}>
          <section aria-label="Left editor">
            <Editor label="Left document" />
            <Toolbar />
          </section>
        </Provider>
        <Provider value={rightScope}>
          <section aria-label="Right editor">
            <Editor label="Right document" />
            <Toolbar />
          </section>
        </Provider>
      </div>
    </main>
  );
}
