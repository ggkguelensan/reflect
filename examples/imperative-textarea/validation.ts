export function findTodo(text: string) {
  const from = text.indexOf('TODO');
  return from < 0 ? null : { from, to: from + 4 };
}

export function firstWordRange(text: string) {
  const word = /\S+/.exec(text);
  const from = word?.index ?? 0;
  return { from, to: from + (word?.[0].length ?? 0) };
}
