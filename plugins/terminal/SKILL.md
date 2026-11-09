# Terminal

Interactive shell in the chat's local workspace, shown as a Canvas tab.

- UI: declares one Canvas Start launcher (`canvasLaunchers: ["terminal"]`). The Start page shows a
  **Terminal** button with the plugin icon (`procs.icon`); each click opens a local tab "Terminal",
  "Terminal 2", … Closing the tab closes the socket and kills the shell; hidden tabs keep it running.
- Socket: `/terminal/socket` (`$ws_socket.ts`), authorized by `terminal.authorize`: signed-in owner,
  exact same origin, `hyper-terminal` subprotocol, local (non-SSH) workspace that exists. At most
  4 shells at once, 12 h idle timeout, bounded messages and output backlog.
- `/terminal/font` serves the symbols-only Nerd Font for prompt icons.
- xterm.js comes from this plugin's own `dependencies` (bundled into the approved UI hash).

There are no agent-facing functions: to show a shell to the person, they open it from Canvas Start.
