import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactDOM from 'react-dom';
import * as MauzCodeUi from '../sdk/index';

declare global {
  // eslint-disable-next-line no-var
  var __MAUZCODE_UI_RUNTIME__: Readonly<Record<'react' | 'react-jsx-runtime' | 'react-dom' | 'mauzcode-ui', unknown>> | undefined;
}

/** Publish the host's single React and SDK instances for runtime plugin bundles.
 * The /plugins/ui/runtime/*.js shims read exactly these objects. */
export function installHostRuntime(): void {
  if (globalThis.__MAUZCODE_UI_RUNTIME__) return;
  globalThis.__MAUZCODE_UI_RUNTIME__ = Object.freeze({ react: React, 'react-jsx-runtime': ReactJsxRuntime, 'react-dom': ReactDOM, 'mauzcode-ui': MauzCodeUi });
}
