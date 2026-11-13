---
description: Resolve one of your workspace Git review comments after addressing it. Requires an open owned Git tab; repeated resolution is idempotent.
fn: gitUi.gitResolveComment
parameters:
  type: object
  additionalProperties: false
  required: [id]
  properties:
    id:
      type: string
      description: Owned review comment UUID.
      pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    note:
      type: string
      maxLength: 2048
      description: Optional resolution note, at most 2048 UTF-8 bytes.
---
Only the calling agent's workspace comments can be resolved.
