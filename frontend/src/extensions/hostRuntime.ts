import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as HyperUi from '../sdk/index';

declare global {
  // eslint-disable-next-line no-var
  var __HYPER_UI_RUNTIME__: Readonly<Record<'react' | 'react-jsx-runtime' | 'react-dom' | 'hyper-ui', unknown>> | undefined;
}

/** Publish the host's single React and SDK instances for runtime plugin bundles.
 * The /plugins/ui/runtime/*.js shims read exactly these objects. */
export function installHostRuntime(): void {
  if (globalThis.__HYPER_UI_RUNTIME__) return;
  globalThis.__HYPER_UI_RUNTIME__ = Object.freeze({ react: React, 'react-jsx-runtime': ReactJsxRuntime, 'react-dom': ReactDOM, 'hyper-ui': HyperUi });
}
