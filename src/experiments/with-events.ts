import { createElement } from 'react';

import type {
  ConnectedView,
  OwnProps,
  Sources,
} from '../ssr/fixtures/minimal-imperative-types';
import { useImperativeEvents } from './use-imperative-events';

export const withImperativeEvents =
  <Payloads extends Record<string, unknown>>(events: Sources<Payloads>) =>
  <Props extends object>(View: ConnectedView<Props, Payloads>) =>
  (props: OwnProps<Props> & { events?: never }) =>
    createElement(View, { ...props, events: useImperativeEvents(events) });
