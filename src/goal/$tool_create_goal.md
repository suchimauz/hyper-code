---
fn: goal.toolCreate
description: "Create a goal only when explicitly requested by the user or system/developer instructions; do not infer goals from ordinary tasks. Provide a concrete objective. Set token_budget only when an explicit token budget is requested; it must be positive. Starts an active goal when absent or replaces a complete goal. Fails if any unfinished goal exists; update_goal changes status only."
parameters: {"type":"object","properties":{"objective":{"type":"string"},"token_budget":{"type":"integer"}},"required":["objective"],"additionalProperties":false}
---
