# Settings: declarations, instance files, database

One mechanism, three places a value can come from. Every key is **declared** once by the module that owns it;
the effective instance value follows the precedence below. Lower-priority values can still exist.

## 1. Declare a key — `$setting_<key>.ts` (code, owned by the module or plugin)

```ts
// src/nav/$setting_pages.ts          → key nav.pages
// ~/.mauzcode/user/hetzner/src/hetzner/$setting_projects.ts → key hetzner.projects
export default {
    type: "json",          // string | text | number | boolean | enum | json | secret
    default: undefined,    // value when nothing else sets it
    title: "Menu pages",
    description: "What it does, what values mean, where it is usually set.",
    // env?: "MAUZCODE_X", options?: [...] (enum), min?/max? (number)
};
```

Core modules and plugins (official and user) declare keys the same way; the key is `<namespace>.<file name>`.
A plugin declares only its own namespace. Describe the meaning of the value in `description` — the settings
page and agents read it.

## 2. Fix a value for the instance — `$settings_<module>.json` (files of this instance)

```
~/.mauzcode/settings/                 # env MAUZCODE_SETTINGS overrides the directory
  $settings_nav.json               # { "pages": ["search", "settings", "plugins"] }
  $settings_hetzner.json           # { "projects": [...] }
```

- One file per module, one directory per instance (atomic, exec, a laptop each have their own). It is
  configuration, not code: keep it out of plugin folders; it may be its own git repo or backup.
- The file must be a JSON object of setting keys and values. Keys must be declared by a `$setting_` file.
  An undeclared key is a warning; a rejected value is an error; either way that key is ignored.
  `string`, `number`, `boolean` and `enum` values are checked against their declared type/options;
  `text` and `json` accept any JSON value at this layer, not a consumer-specific schema.
  `secret` keys are never accepted from files — use encrypted secret storage.
- Edits apply without a restart (the directory is re-checked at most once a second). A file with broken JSON
  keeps its last good values and reports an error. `ctx.fns.settings.files({ force: true })` shows the values,
  their file paths, errors and warnings.
- A value given by a file is **the** instance value: `settings.set` for that key at scope `global` throws
  ("fixed by <path>"), and the settings page (`/settings/declared`) shows it read-only with source `file: …`.
  To change it, edit the file; to hand it back to the UI, delete the key from the file. Any existing database
  value then becomes effective before env/default. `settings.remove` only deletes the database row; it does
  not remove or unlock a file value.

## 3. Everything else — the database (UI, `settings.set`)

Resolution for `settings.get({ module, scopeType: "global", key })` (no `scopeId`, or an empty one):

1. instance file `~/.mauzcode/settings/$settings_<module>.json`
2. database row (set from the UI or `settings.set`)
3. `env` named in the declaration
4. declared `default`

Other scopes (`user`, `agent`, `provider`, …) read their own database rows; instance files, env and declared
defaults do not apply to them. `settings.get` does not automatically fall back from a user scope to global.
The consumer decides whether to do that. For `nav.layout` and `dock.layout`, the effective-layout readers
try the signed-in person's user value first: a valid layout replaces the instance layout **as a whole**,
not by merging fields. Without a valid user layout they read global, then use an empty layout as fallback.
Thus a file-fixed global layout does not prohibit personal overrides.

## Examples

### Pages widget, not the whole application menu

`nav.pages` is an ordered list read by `src/nav/$widget_pages.ts`. It selects items **only for that widget**
from `nav.items({ includeAgents: false, limit: 500 })`, after the widget's group filtering. Its `daily` or
`management` section filter still applies. `[]` shows no items in that widget; unknown or filtered-out ids
are skipped. With no array configured, the widget uses core (non-plugin) items in their declared order;
without a section filter, administration items are grouped separately.

A page id is the `<name>` of its `$app_<name>.json`: `src/auth/$app_people.json` → `people`,
`src/cron/$app_cron.json` → `cron` (the declared `/cron` destination still exists).
For example, in `~/.mauzcode/settings/$settings_nav.json`:

```json
{ "pages": ["search", "settings", "plugins", "people", "cron"] }
```

List registered ids with `Object.keys(ctx.state.nav.apps)`. This is the registry, not a guarantee that every
id survives the widget's filtering. `nav.items` itself does **not** read `nav.pages`; React Applications
uses that destination list independently. This setting is neither an Applications allowlist nor a way to
configure the React sidebar. Hiding an item never blocks access to its route.

**A plugin's own setting** — declare `~/.mauzcode/user/lisboalive/src/lisboalive/$setting_home.ts`, then fix it
for the instance in `~/.mauzcode/settings/$settings_lisboalive.json` as `{ "home": "Cascais" }`.

## Layout settings: instance files and surviving consumers

`nav.layout` and `dock.layout` already use the same file → database → env → default resolution as other
global settings. Their declarations have `type: "text"`, env names `MAUZCODE_NAV` / `MAUZCODE_DOCK`, and
an empty-string default. The file validator accepts JSON objects for `text`, and both effective-layout
readers accept either an object or a string containing JSON. No migration is needed to use instance files.

For example, `~/.mauzcode/settings/$settings_nav.json` can contain this object-valued layout (alongside
`pages`, if desired):

```json
{
  "layout": {
    "version": 1,
    "tabs": [{ "id": "home", "title": "Home" }],
    "hidden": [],
    "searchHidden": []
  }
}
```

An equivalent string-valued form is also supported:

```json
{ "layout": "{\"version\":1,\"tabs\":[{\"id\":\"home\",\"title\":\"Home\"}],\"hidden\":[],\"searchHidden\":[]}" }
```

For `~/.mauzcode/settings/$settings_dock.json`:

```json
{ "layout": { "top": [], "bottom": [], "hidden": [], "pins": ["/settings"] } }
```

These are configuration examples, not a promise to rearrange the current React shell:

- `nav.effectiveLayout` → `nav.tabs` → `frontendBridge.searchData` remains a live structured-data path for
  tabs, widget placements and search sources. `nav.tabs` resolves configured entries against the loaded
  registries, includes remaining declared tabs and applies hidden lists; listing one tab is not an allowlist.
- `dock.effectiveLayout`, `dock.pin`, `dock.saveLayout` and the Dock routes still consume/persist layouts and
  pins. Saving uses the viewer's user scope, or global without a viewer; resetting deletes that scope's
  database row. A file-fixed global value still wins after a global reset, and a global save is rejected.
  These retained operations do not establish that `dock.layout` controls the React sidebar.
- The former navigation/dock/chat shell is removed. The remaining `ui.layout` is a minimal server-document
  renderer, not that shell. React owns the primary UI, while necessary server documents and compatibility
  transports remain. See [UI architecture](ui-architecture.md) for the consumer map.

Layout parsing is separate from file validation: malformed JSON strings or non-object layouts are ignored
by the effective-layout readers, which then try the next scope/fallback. They do not retry lower-priority
global database/env values if a file value was selected by `settings.get` but is unusable as a layout.
