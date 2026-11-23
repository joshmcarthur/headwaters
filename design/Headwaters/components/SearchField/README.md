The floating search combobox that finds a river or stream by name.

Provide `results` as `{id, maori?, english?, order?, context?}` and handle `onChange` (query text) and `onSelect` (chosen result). Control visibility with `open`, or let it open on focus when results exist.

- Show dual names in the order the official source uses, through `order`.
- Match with and without macrons, and match either name.
- Float it over the map at `z-panel`. On mobile it sits at the top of the screen with the sheet below.
- Empty results should say so plainly: "We can't find a river with that name yet."
