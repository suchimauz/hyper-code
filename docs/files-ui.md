# Files UI and Canvas files

The standalone Files page and the file tab beside chat share the native React
`CanvasFile` viewer. `FilesPage` supplies a standalone HTTP transport; Canvas uses
an agent-bound item transport. Neither is the old HTMX `#main` file editor.
The `ctx.fns.files.*` procedures are filesystem/state APIs, not browser navigation.

## Open and navigate

To show a person a file or directory **without leaving chat**, use Canvas:

```ts
await ctx.fns.canvas.show({ kind: "file", args: { path: "README.md" } });
// Optional args: host (SSH alias or "local"), mode: "auto" | "preview" | "source".
```

Canvas resolves relative paths against the target agent's workspace and defaults to
that workspace's host. It pins an absolute path and explicit host in the item.
For another project, pass an absolute path; use `host: "local"` to override an SSH
workspace. The tree root is the workspace when the target is inside it on the same
host, otherwise the target directory or the file's parent.

Standalone URLs include:

```text
/files                                      local request-context root
/files?path=docs                             local relative directory
/files?path=/tmp/example.txt                 local absolute file
/files?path=/srv/project&host=my-server       SSH directory
/files/absolute/tmp/example.txt              canonical local link
/files/remote/my-server/srv/project/file.md   canonical SSH link
/files/embed/tmp/example.txt                 embedded local link
/files/remote/embed/my-server/srv/file.md     embedded SSH link
```

`files.browserUrl({ path, host? })` produces the canonical path-based links,
encoding path segments. Remote paths passed to this helper must be absolute.
`files.embedUrl` resolves a target and builds the embedded variant. Path-based
middleware distinguishes page navigation from raw subresource requests using
`Sec-Fetch-Dest`, then `Accept` and extension fallbacks (`files.isPageRequest`).
This supports relative preview assets without returning UI markup for CSS/images.

On the standalone page, `tab=code` and `tab=edit` select source; `tab=preview`
selects preview; otherwise mode is automatic. Directory navigation uses full-page
`/files?path=...` links, preserving host and the embed flag, not a `#main` swap.
Local relative/empty paths resolve through `files.resolveSafe` against the session
agent's local workspace when available, otherwise the server working directory;
a remote workspace does not become a local base. A bare browser URL is not a
promise to inherit whichever chat is visible. GET `/files` normalizes relative
remote paths (empty means `~`); remote saves require absolute paths. The raw route
passes the path through to remote access, so prefer canonical links or explicit
absolute remote paths rather than relying on GET normalization for raw requests.

`ui.openFile({ path })` still resolves a local path, calls `files.open` with
broadcast disabled, builds `files.browserUrl`, and emits `ui.navigate`. Its legacy
`ui/control.js` command transport is not connected by the primary React entry;
do not rely on it as universal navigation for the current shell. `files.open`
only maintains shared server-side open-file state (and optionally emits its
historical event); it does not navigate the browser. Use `canvas.show` for showing
files beside chat rather than trying to repair or depend on that transport.

## Browse directories and edit text

Both surfaces list directories and open children. `files.list` sorts folders
first, then names, and omits `node_modules`, `.git`, and `.DS_Store`; the HTTP
browser filters private tool-result paths too. Standalone has parent navigation.
Native Canvas additionally has a collapsible, resizable tree, lazily lists each
expanded directory, and opens files in the same tab. The selected path is saved
in item state as `openPath`; expansion/cache are local to the mounted viewer.

Editable text uses React `CodeEditor` (CodeMirror 6), with syntax highlighting,
search, folding and a remembered line-wrap toggle. Saving is explicit via Save
or Ctrl/Cmd+S, **not autosave**. Markdown/HTML default to Preview in auto mode and
can switch to source. Drafts are kept separate from the last loaded content;
unrelated item-state changes do not reset a dirty draft. Switching files in the Canvas tree asks before discarding changes; Reload does
not replace a dirty draft. Dirty drafts also install a browser unload warning. These are warnings, not durable draft storage.

The native transports are:

| Purpose | Method and endpoint | Parameters/body |
|---|---|---|
| Standalone CSRF bootstrap | `GET /files?format=session` | Returns cookie-bound `csrfToken` |
| Standalone read/list | `GET /files?format=json&path=...&host=...` | `host` optional |
| Standalone save | `PUT /files?path=...&host=...` | JSON `{ content, expectedContent }`, `x-csrf-token` |
| Canvas read/list/save | `POST /canvas/:id/item/:itemId` | JSON `{ fileAction: "read" | "list" | "save", path? }`; save adds `content`, `expectedContent`; `x-csrf-token` required even for read/list |
| Canvas raw document | `GET /canvas/:id/item/:itemId/document` | Optional `path`; `download=1` adds attachment disposition |
| Standalone raw file | `GET /files/raw?path=...&host=...` | `host` optional |

`expectedContent` is the previously loaded text, not the edited draft. The routes
compare it with disk and return **409** when it is stale; reload/reconcile before
saving again. They also pass the snapshot to `files.write`; its remote branch forwards it to
`remote.writeFile`, while the local branch writes directly without another check.
This is optimistic conflict detection, not a promise of an atomic filesystem
transaction or collaborative merging. Failed saves remain visible as errors.
The old plain-text `PUT /files` body is not the native editor contract.

Both read transports expose editable content only when the file is at most
1,048,576 bytes, is not a recognized image/audio/video/PDF, and its decoded text
contains no NUL. Larger files and detected binary files have no text editor/save;
unsupported previews show an unavailable message. Save rejects content whose
JavaScript string length exceeds 1,048,576 (a character/code-unit check, not the
same as the disk-byte threshold). This is a bounded text heuristic, not general
binary-format validation. The editor is temporarily read-only while busy;
`mode: "preview"` is a presentation choice, not a read-only permission grant.

## Previews and raw content

- Markdown is rendered by `react-markdown` with GFM and `skipHtml`; images and
  links resolve against a path-based Files URL.
- Editable HTML previews use `srcDoc` in an iframe with empty `sandbox` and
  `referrerPolicy="no-referrer"`. A prepended base and restrictive CSP allow
  Files assets/styles but not scripts or same-origin iframe privileges. This is
  a document preview, not a way to run an arbitrary application.
- Images (`png jpg jpeg gif webp avif svg bmp ico`) use `<img>`; video
  (`mp4 webm mov m4v ogv`) and audio (`mp3 wav ogg oga m4a aac flac opus`) use
  native controls. PDF uses a sandboxed iframe. Codec support depends on the browser.
- Media and large-file metadata bypass UTF-8 reads. Unknown small files are read
  as text before the NUL check. Raw bytes use `files.rawResponse`, not `files.read`.

Raw responses use explicit MIME mappings, `nosniff`, `no-referrer`, a sandbox CSP
and private revalidation caching; missing files/directories return 404. Local
responses use `Bun.file`; remote responses fetch bytes from SSH (not a promise of
streaming or range support). The Canvas document route further restricts CSP,
sets `Cross-Origin-Resource-Policy: same-origin` and `private, no-store` caching.
Both the standalone raw route and the Canvas document route handle `download=1`
by adding an attachment disposition; the viewer's download link sets this flag.

Keep raw rich previews, `canvas.itemDocument`, kind render/assets and retained
compatibility renderers/transports: non-file Canvas documents and other consumers
still use them. Sharing a native file viewer does not remove all SSR or HTML.

## Access and path boundaries

Files routes check configured authentication, validate explicit SSH aliases, and
hide private tool results. PUT requires cookie-bound CSRF. Standalone Files is
not scoped to an agent-owned Canvas item: `files.resolveSafe` is **not a sandbox**;
absolute paths and `../` can leave the workspace, subject to filesystem access.
Do not interpret its name as an authorization guarantee.

Canvas HTTP calls additionally use `canvas.authorizeHttp`: the agent must be
unarchived and owned by the current user; legacy/open access is limited to
ownerless agents. File operations select an open file item of that agent.
`canvas.fileTarget` takes host from the stored item, not browser input, and rejects
requested paths lexically outside the stored tree root (403). Omitted paths use
the pinned target. This normalized path check is not a realpath/symlink sandbox.
Private-result filtering still applies within the tree and to raw documents.

## Relevant files

```text
frontend/src/components/mauzcode/FilesPage.tsx
frontend/src/components/mauzcode/CanvasFile.tsx
frontend/src/components/mauzcode/CodeEditor.tsx
frontend/src/components/mauzcode/FilesPage.test.tsx
frontend/src/components/mauzcode/CanvasFile.test.tsx
src/files/$route_GET.ts
src/files/$route__PUT.ts
src/files/$route_raw_GET.ts
src/files/$middleware_absolute.ts
src/files/$middleware_embed.ts
src/files/$middleware_remote.ts
src/files/browserData.ts
src/files/browserUrl.ts
src/files/embedUrl.ts
src/files/isPageRequest.ts
src/files/rawResponse.ts
src/files/resolveSafe.ts
src/files/list.ts
src/files/write.ts
src/files/open.ts
src/ui/openFile.ts
src/canvas/$canvas_file.ts
src/canvas/$route_$id_item_$itemId_POST.ts
src/canvas/$route_$id_item_$itemId_document_GET.ts
src/canvas/fileTarget.ts
src/canvas/authorizeHttp.ts
src/canvas/itemDocument.ts
src/canvas/fileTransport.test.ts
src/files/reviewRegressions.test.ts
src/files/routeBreadcrumbs.test.ts
src/files/routeMediaPreview.test.ts
src/files/relativePreview.test.ts
src/files/absoluteRoute.test.ts
```

See [UI architecture](ui-architecture.md) for the primary React shell and retained
compatibility consumers. Route changes require namespace hot-reload and route
reload; a documentation-only update does not.
