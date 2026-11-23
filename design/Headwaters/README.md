Load the three fonts from Google Fonts before anything else: `https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,400..600&family=IBM+Plex+Mono:wght@400;500&family=Source+Sans+3:ital,wght@0,300..700;1,400..600&display=swap`. All three cover the macrons used in te reo Māori (ā ē ī ō ū). Then load `tokens.css`, `components/bundle.css`, React 18 and `components/bundle.js`, which defines `window.Headwaters`.

## Content fundamentals

Headwaters sounds like a knowledgeable New Zealander showing someone around a landscape. Write plainly, say what you know, and say what you don't.

Every line of visitor-facing copy goes through the humanize skill at `github.com/joshmcarthur/dotfiles/tree/master/agents/skills/humanize` before it ships. Read its `SKILL.md` and the references first, write, then check the result against it. If the skill can't be retrieved, stop and report that. Don't substitute another framework.

Write in New Zealand English: colour, metres, kilometres, harbour, organise. Use metric units only.

Use sentence case everywhere, including headings, buttons and labels. Start button labels with a verb: "Find the source", "Follow the water", "Show the catchment". Use contractions: "you've", "can't", "there's".

Say what's uncertain and why. The brief's own examples set the tone:

- Prefer "Follow the Hutt River back into the Tararua Range, or see the streams that join it on the way to Wellington Harbour." Avoid "Discover the fascinating hydrological characteristics of this magnificent waterway."
- Prefer "Everything inside this boundary drains towards the point you've selected."
- Prefer "We can't trace this stream all the way to its source. There's a gap in the mapped river network." Avoid "The system has encountered an error determining the upstream terminal node."

Don't use marketing adjectives (stunning, vibrant, breathtaking), significance inflation, "journey" as a noun for a river, or analogies that stand in for an explanation. No exclamation marks, no emoji, no decorative enthusiasm.

Use plain English first and introduce a technical term when it helps, with a one-line definition: a catchment is the area of land where rain and streams drain to the same place; a tributary is a stream or river that flows into another; headwaters are the streams and upper reaches where a river begins.

### Te reo Māori

Keep macrons in every Māori place name and never ASCII-fold them. Take names from the New Zealand Geographic Board / Ngā Pou Taunaha o Aotearoa and show official dual names with `PlaceName`, in the order the source gives for that feature. Don't invent translations or new Māori phrases, and don't use Māori concepts as decoration. Mark Māori text with `lang="mi"`. Any longer explanation of ki uta ki tai needs review by people with the right standing before it goes live. Never imply endorsement by iwi or hapū.

The subtitle is fixed: "Ki uta ki tai: from the mountains to the sea."

### Placeholder data

Figures, coordinates and tributary lengths in previews are placeholders so the layouts have something to hold. They are not measurements. Real values come from the data pipeline, and the tone rules above apply to them too.

## Visual foundations

The map is the centre of the experience and everything else supports it. Keep the interface restrained, warm and geographic, closer to a Topo50 sheet than to a GIS dashboard or an outdoor brand.

### Themes

Three themes share every token name. `paper` is the default light theme on warm off-white. `dusk` is the dark theme and lightens the blues and accent, so text on those fills uses `on-river` and `on-accent` rather than white. `contrast` is an added high-contrast theme: text is at least 7:1, and surfaces and controls are set apart by solid borders that meet 3:1. Switch by setting `data-theme` on the root element.

### Colour

Set body text in `ink` on `surface-100` and `surface-200`. Use `ink-muted` for secondary text and `ink-subtle` only for placeholders. Primary actions fill with `river` and use `on-river` text. Use `accent` for sources, destinations and the one action that matters most on a screen, with `on-accent` text. It is a grid red in the Topo50 manner and appears sparingly.

Land colours (`tussock`, `forest`, `stone`, `earth`) belong to the map and to illustration. They are never text colours. Don't make everything blue because the subject is water, and don't use bright cyan, saturated green or dark navy.

Status colours (`success`, `warning`, `danger`, `info`) always travel with an icon and a word. Colour is never the only signal anywhere in the system, and on the map each state also differs by line weight, dash or shape.

Focus is a solid 2px `focus` ring with a 2px offset on every surface.

### Map states

| State | Colour token | Weight token | Extra cue |
| --- | --- | --- | --- |
| Selected waterway | `map-river-selected` | `line-selected` (4px) | Brightest blue, solid |
| Named main channel | `map-main-channel` | `line-main` (3px) | Solid |
| Upstream network | `map-upstream` | `line-upstream` (2px) | Branching |
| Downstream route | `map-downstream` | `line-downstream` (3px) | Chevrons along the line |
| Other rivers | `map-river-context` | `line-context` (1px) | Dimmed with `opacity-context` |
| Catchment | `map-catchment-stroke`, `map-catchment-fill` | `line-catchment` (2px) | Dashed, diagonal hatch |
| Source | `map-source` | | Ringed circle |
| Destination | `map-outlet` | | Diamond |

Contours use `map-contour` at `line-hairline`, with every fifth in `map-contour-index`. Grid lines and references use `map-grid`. Keep both at hairline weight so they never compete with information.

### Type

Headings and large figures are set in Fraunces (`display-xl`, `display-lg`, `heading-1` to `heading-4`, `figure-lg`, `figure-md`). Interface and body text is Source Sans 3 (`body-lg`, `body`, `body-sm`, `label`, `caption`). Coordinates, distances and elevations are set in IBM Plex Mono (`coordinate`, `measure`) with tabular figures. Avoid uppercase labels, oversized marketing headlines and type effects.

### Space, shape and depth

Space comes from the `space-1` to `space-24` scale. Controls are `control-md` (44px) tall by default, which meets touch targets. The information panel is `panel-width` wide on desktop and becomes a bottom sheet on mobile, which peeks at `sheet-peek`.

Corners are small and squarer than a typical app: `radius-md` for controls, `radius-lg` for floating panels, `radius-xl` for sheets and dialogs. Float panels over the map with `shadow-float`. Elsewhere separate with `hairline` borders instead of shadow. The `contrast` theme replaces shadows with solid outlines.

Stack with the `z-` tokens: map, controls, panel, sheet, popover, dialog, toast.

### Motion

Use motion only to explain connectivity, such as a network revealing itself upstream or downstream. Durations are `--hw-dur-1` (120ms), `--hw-dur-2` (200ms) and `--hw-dur-3` (320ms) with `--hw-ease`. They drop to zero under `prefers-reduced-motion`, and every animated component has a static equivalent.

### Layout

Keep a map-first layout. Float a compact `SearchField`, `MapControls` and `RiverPanel` over the map and avoid a permanent sidebar. Start the panel with the river name, source, destination, length and catchment area, and tuck everything else into a `Disclosure`. Never require hover for essential functions.

## Motifs

Branching waterways are the primary motif (`RiverMotif`, `Loader`). Contour lines are the second (`Contours`), used faintly on introductions, cards and empty states. Both are procedural placeholders and can be replaced with real river and contour geometry once the pipeline exports it. Avoid wave icons, droplets and blue swooshes.

## Iconography

Icons are a small inline stroke set drawn on a 24px grid at 1.75px (`Icon`), in `currentColor`. They were drawn for this system because the brief supplies no icon set. Replace them if the team adopts one. Use `source`, `mouth` and `area` for the three core map ideas and don't reuse them decoratively.

## Logo

The brief supplies no logo. The wordmark is "Headwaters" set in Fraunces at display weight with the subtitle beneath (`Masthead`). Don't draw a mark from the river motif without a deliberate design decision.
