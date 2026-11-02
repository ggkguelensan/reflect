import React, { Ref, useImperativeHandle, useRef } from 'react';

export type TextareaHandle = {
  focus(): void;
  selectRange(range: { from: number; to: number }): void;
};

type TextareaProps = {
  value: string;
  onChange(value: string): void;
  events: Ref<TextareaHandle>;
  label: string;
  focusOnSelection?: boolean;
  onCommand?(method: keyof TextareaHandle): void;
};

// This module depends only on React. `events` is an ordinary ref-valued prop,
// so it works without forwardRef on both React 18 and React 19.
export function TextareaView({
  value,
  onChange,
  events,
  label,
  focusOnSelection = true,
  onCommand,
}: TextareaProps) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(events, () => ({
    focus() {
      textarea.current?.focus();
      onCommand?.('focus');
    },
    selectRange({ from, to }) {
      if (focusOnSelection) textarea.current?.focus();
      textarea.current?.setSelectionRange(from, to);
      onCommand?.('selectRange');
    },
  }));

  return (
    <label>
      <span>{label}</span>
      <textarea
        ref={textarea}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        rows={6}
      />
    </label>
  );
}
