import type { ExtensionInputProps, UiExtension } from '@hyper/ui';
/** Test-only card: refresh is deliberately not a completion/approval operation. */
export function FixtureInputCard({ input, context, onDone }: ExtensionInputProps) {
  return <><h3>{input.title}</h3><p>{context.readOnly ? 'Receipt' : 'Pending'}</p><button onClick={onDone}>Refresh receipt</button></>;
}
export const inputFixture: UiExtension = { id: 'fixture', apiVersion: 1, inputKinds: [{ kind: 'fixture-review', component: FixtureInputCard }] };
