# UI design system

## Scope and primary components

For Hyper UI work first read [Apple Design](skills/apple-design/SKILL.md) and its [scope notes](skills/apple-design/README.md). Apply clear hierarchy, restraint, immediate feedback, accessible targets and reduced motion within the existing design, not a new visual theme. This is Hyper-only guidance, not a policy for other projects.

The primary React frontend owns its component and theme layer. Trusted extensions import `Button`, `IconButton`, `Sheet`, `Stack`, `Panel`, `TextField` and `Dialog` from `@hyper/ui` (`frontend/src/sdk/index.ts`). Use these shared primitives instead of private host imports, a second component runtime, or injected HTML. The host supplies one React/React DOM instance.

## Tokens and themes

The current frontend tokens live in `frontend/src/styles/tokens.css`; shared frontend styles and `frontend/src/sdk/sdk.css` build on them. Use semantic tokens such as `--bg`, `--surface`, `--surface-raised`, `--text`, `--text-secondary`, `--line`, `--line-strong`, `--accent`, `--success`, and `--tool-error`. Reuse spacing, radius, font, control-height and feedback-duration tokens. Do not replace them with fixed light-only colors or assume the older SSR palette describes React.

The shell owns theme selection and supplies the resolved light/dark theme in `ExtensionContext`. Extensions inherit tokens rather than introducing their own theme store. Check both themes and system preference behavior.

## Accessibility and interaction

- Buttons need meaningful accessible names; icon-only actions need labels. Text fields need associated labels and readable help/error messages.
- Keep visible keyboard focus, sensible tab order, native control semantics and disabled/pending states. Do not rely on color alone to indicate status.
- Dialogs and sheets must preserve keyboard dismissal, focus containment and restoration. Use SDK primitives rather than shell DOM manipulation.
- Honor `prefers-reduced-motion`; motion should explain a transition, not delay an action. Preserve usable touch targets and responsive layouts.
- Keep asynchronous errors visible and actionable. Read-only/pending controls are usability protections, not backend authorization.

## Compatibility SSR design layer

Some server-rendered surfaces remain, including approval and Canvas content consumers. Their styles live in `src/procs/styles/$style_app.css` and use `--theme-*`, `--ui-*`, semantic Tailwind utilities and classes such as `btn`, `input`, `card`, `badge` and `alert`. Existing runtime renderers (`ui.inspectorSection`, `ui.statusBadge`, `ui.progressBar`, `ui.chatEventCard`, `procs.ui.*`) remain valid for those consumers only. Preserve their theme restoration, accessible labels, popup behavior and stronger input borders when changing them.

Do not delete shared styles or SSR renderers merely because `/old-ui` redirects. Do not use this compatibility layer as the default recipe for new React extensions.

## Verification

Run focused frontend component tests, typecheck/build checks and `git diff --check`. Inspect light/dark themes, narrow layouts, overflow, labels, keyboard focus, disabled/error states, dialogs and reduced motion. When changing SSR styles, also hot-reload affected renderers, rebuild via `procs.styles.rebuild({})`, and verify the assets actually served. Close temporary browser tabs after checks.
