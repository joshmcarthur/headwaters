The floating panel that shows the selected river: name, summary, length, catchment area, source, destination and the three main actions.

Provide `maori`/`english`/`order`, `summary`, `stats`, `source`, `destination` (each `{name,lat,lon}`) and `onAction(id)` where `id` is `source`, `downstream` or `catchment`. Children append below the actions.

- Start with the five most interesting facts. Put everything else in a `Disclosure`.
- On mobile this content lives inside `BottomSheet`.
- Always show which river is selected, in the panel heading.
