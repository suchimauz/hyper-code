# DeskSprite 2.1.0 (MIT)

Upstream: https://github.com/welltilln/desksprite
Pinned commit: `43c7437672ea589a0f184284f0900299be004e67`
Source: https://raw.githubusercontent.com/welltilln/desksprite/43c7437672ea589a0f184284f0900299be004e67/desksprite.js
SHA-256: `5b9672daab1695820aae3cc2b2c7ccc5866b3a5eace43f607cb35cf8cbcf6514`

`desksprite.js` is unmodified upstream source, checked byte-for-byte against the pinned download. Copyright (c) 2026 welltilln; full MIT license in LICENSE. Type declarations are a narrow integration facade, not the full upstream API.

The React adapter imports this file into the local Vite bundle: no CDN, skin URL, remote font, or runtime network request. Calls the real `DeskSprite.start` and `setStatus`, never translates its engine into React. Its mount is empty from React's perspective. Engine-created body nodes, animation frames, timers and global listeners are removed by `destroy`; upstream's one shared style element remains intentionally.

The 80×60 adapter disables roam/clock/lunch and all speech bubbles, blocks pointer events to the engine, and provides a keyboard-operable status button instead. Drag/throw would otherwise escape the mount even with roam:false. The engine renders static frames when reduced motion is enabled; the adapter recreates it on preference changes. Successful busy→idle transitions show done for three seconds. Initial idle does not claim a completed run. Agent switching remounts the engine.
