# dsh-claude-style mascots

Sprite sheets and animation geometry were taken from the installed dsh-claude-style package (© 2026 Nwflower). See LICENSE for the upstream license and artwork exceptions. The crab character belongs to Anthropic and its artwork is not MIT licensed. This is an unofficial fan interface, not endorsed by the character owners.

Deepy: original SVG sprite sheets, 50 ms frames, one-pixel cell gutters.
Whalegirl: original PNG sprite sheets with per-frame durations and no gutters.
Crab: existing split body/ink sheets, 80 ms frames.

Only mascot artwork and animation metadata are reused. No Sodium engine code is included. MauzCode activity and interactions are implemented by the React component; this is not a complete port of dsh's activity scheduler.

## Additional local companions

DeskSprite is vendored with its MIT license and pinned provenance under src/vendor/desksprite/. It stays at its desk; roaming and grab/throw are intentionally disabled inside chat. Click/keyboard activation shows its current status.

Bitty, TmuxAI Official, Planet and Rainbow Terminal Cat were downloaded from the OpenPets public gallery at the user's request. Each directory records its exact source URL and original metadata in provenance.json. The separately hosted artwork does not include an explicit license grant; OpenPets' MIT software license must NOT be represented as an artwork license. Rights remain with their respective owners. Verify redistribution permission before publishing/bundling these artworks for others. Source terms: https://openpets.dev/terms ; rights contact: admin@openpets.dev.

The OpenPets animation mapping follows packages/pet-format/src/animation.ts at commit c8dfeb661ee60e9c0f270316dd4e0f9c9158eb3d. Local rendering uses a 192×208 frame grid (8 columns, 9 rows), scaled to 72×78; no OpenPets desktop runtime or AI integrations are installed.
