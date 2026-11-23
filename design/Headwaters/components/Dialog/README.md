A modal dialog over a scrim for confirmations that need a decision.

Provide `title`, `children` and `actions`. `open` hides it when `false`. `inline` renders it in place for documentation.

- Trap focus, close on Escape, and return focus to the trigger.
- Prefer a callout or toast over a dialog when no decision is needed.
- Name the buttons by what they do: "Back to the map", not "OK".
