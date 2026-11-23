# Headwaters

Ki uta ki tai — from the mountains to the sea.

Project handoff and design brief

## 1. Vision

Headwaters is an interactive atlas of Aotearoa New Zealand’s rivers, streams, and catchments.

The idea is simple: click on any river and discover where its water comes from, where it goes, and how the surrounding landscape connects to it.

Think of it as Google Maps for rivers, with the character of a New Zealand topographic map and the curiosity of exploring a landscape on foot.

This is not a hydrological modelling platform. It is a geographic exploration tool intended for anyone interested in New Zealand’s waterways.

The experience should feel approachable to someone who has never encountered terms like river reach, flow accumulation, or stream order.

### Identity

Name: Headwaters

Subtitle: Ki uta ki tai — from the mountains to the sea.

The subtitle expresses the guiding idea behind the project: waterways connect mountains, forests, valleys, communities, and the coast.

The concept of ki uta ki tai is particularly appropriate because Headwaters is about exploring those connections, not simply identifying individual rivers.

Treat this as a guiding design principle, not just a tagline.

## 2. Core experience

A visitor opens a map of New Zealand.

They can search for a river by name or click directly on a waterway.

Selecting a river reveals its connections to the surrounding landscape.

The main interactions are:

### Find the source

Identify where a river begins.

Distinguish between:

- Named source: Where the waterway identified by a particular name begins.
- Furthest source: The most distant upstream point across the entire connected river network.

Measure distance along the waterway, not as the crow flies.

Where the data cannot establish a definitive source, explain the ambiguity.

### Follow the water

Trace the selected waterway downstream.

Identify:

- Where the named river ends.
- Where it joins another river.
- Its eventual destination, such as a harbour, lake, or the sea.
- The distance travelled along the river network.

The user should be able to follow the complete downstream route visually.

### Explore the tributaries

Show the entire upstream network feeding into a selected point.

Allow users to explore individual tributaries, junctions, and branches.

The map should make the network understandable without requiring specialist terminology.

### Reveal the catchment

Show the land that drains into a selected point on a waterway.

Display:

- Catchment boundary.
- Upstream waterways.
- Catchment area.
- Elevation range.
- The selected outlet.

Catchments must be associated with the selected point, not merely a river name.

### Explore the landscape

Provide a 3D terrain view.

Allow users to tilt, rotate, and explore the surrounding mountains and valleys.

Highlight the river network and catchment boundaries over the terrain.

Eventually, users should be able to follow a river from its headwaters to the sea in a continuous geographic journey.

## 3. Design philosophy

Headwaters should feel like a modern, interactive New Zealand atlas.

It should have a strong sense of place without resorting to generic tourism imagery or superficial cultural decoration.

Three influences should guide the visual design:

1. New Zealand topographic maps.
2. The natural geometry of river systems and landscapes.
3. A contemporary, restrained digital cartographic interface.

The map is the centre of the experience.

Everything else should support exploration.

### 3.1 Visual personality

The interface should feel:

- Curious rather than instructional.
- Geographic rather than technical.
- Warm rather than corporate.
- Thoughtful rather than decorative.
- Distinctly Aotearoa without being clichéd.

Avoid the visual conventions of enterprise GIS software.

Also avoid the opposite extreme: an overly playful outdoor adventure brand.

Headwaters should feel credible enough to be used as a geographic reference, but welcoming enough for a curious child or casual visitor.

### 3.2 Cartographic influences

Use New Zealand’s Topo50 mapping tradition as a starting point.

Potential visual references include:

- Contour lines.
- River and stream linework.
- Topographic relief.
- Catchment boundaries.
- Map grid references.
- Geographic coordinates.
- Elevation labels.
- Traditional map typography.
- Subtle paper and ink colours.

These should influence the design system rather than be copied literally.

For example, contour lines could appear as a restrained background motif in the site’s introduction or empty states.

River networks could form delicate branching illustrations.

A coordinate label could accompany a selected source or destination.

The application should feel designed around geographic information rather than decorated with unrelated graphics.

## 4. Visual motifs

Develop a small, consistent collection of visual motifs.

### 4.1 Branching waterways

River networks are naturally beautiful structures.

Their branching geometry should be the primary visual motif for Headwaters.

Possible uses:

- Logo exploration.
- Loading states.
- Empty states.
- Section transitions.
- Subtle background illustrations.
- Network visualisations.

Prefer actual river geometries where practical.

Avoid generic wave icons, water droplets, or abstract blue swooshes.

The interesting visual characteristic of rivers is their connected, branching structure.

### 4.2 Contour lines

Contour lines are another strong motif.

Use them sparingly to suggest elevation and terrain.

Potential applications:

- Introductory backgrounds.
- Cards.
- Section dividers.
- Loading illustrations.
- Terrain-related controls.

Contour lines should remain understated.

Avoid making the interface resemble a busy topographic map when the user is trying to read information.

### 4.3 Source-to-sea journeys

The relationship between elevation and distance is central to Headwaters.

Explore visual treatments that communicate:

Mountain → stream → river → estuary → sea

An elevation profile could become a recurring interface element.

For example, a selected river might have a compact profile showing its descent from source to destination.

This is more meaningful than a decorative progress bar.

### 4.4 Geographic annotations

Borrow restrained annotation styles from traditional maps.

Examples:

- Small coordinate labels.
- Elevation markers.
- River kilometre distances.
- Source and outlet markers.
- Subtle leader lines.
- Catchment area labels.

These should feel like useful geographic information.

Do not add annotations solely for visual effect.

## 5. Colour and typography

### 5.1 Colour palette

Take inspiration from New Zealand’s landscape and traditional cartography.

Explore a palette built around:

**Water**

- Deep river blue.
- Muted blue-green.
- Clear, brighter blue for selected waterways.

**Land**

- Warm off-white.
- Stone.
- Muted tussock and olive.
- Soft forest green.

**Terrain**

- Gentle earthy browns.
- Warm greys.
- Subtle elevation shading.

**Highlights**

- A restrained contrasting accent for selected sources, destinations, and important interactions.

Avoid the default technology-dashboard combination of bright cyan, saturated green, and dark navy.

Also avoid making every element blue simply because the application is about water.

The map needs enough colour separation to distinguish selected waterways, surrounding rivers, catchments, and terrain.

**Accessibility**

Colour must not be the only way to distinguish map states.

Use line weight, opacity, patterns, labels, and interaction states where appropriate.

Ensure interface controls and text meet WCAG AA contrast requirements.

### 5.2 Typography

Typography should feel like a contemporary geographic publication.

Explore a pairing of:

- A characterful serif or humanist typeface for headings.
- A highly legible sans-serif for interface text.
- Optional restrained monospaced typography for coordinates and measurements.

The headings should feel editorial rather than corporate.

Body text should be straightforward and easy to read.

Avoid excessive uppercase labels, oversized marketing headlines, and unnecessary typography effects.

The typography should support both English and te reo Māori, including macrons.

Use fonts with reliable support for Māori orthography.

## 6. Language and editorial voice

Language is a central part of the Headwaters experience.

All user-facing prose must follow the humanize agent skill maintained in:

https://github.com/joshmcarthur/dotfiles/tree/master/agents/skills/humanize

### Mandatory writing workflow

Before generating or modifying user-facing prose:

1. Retrieve and read the humanize skill’s SKILL.md.
2. Read any supporting references required by the skill.
3. Apply its instructions to the content being written.
4. Review the finished copy against the skill before considering it complete.

If the skill is already installed locally, use that installation.

If it cannot be retrieved, report the issue rather than silently substituting a different humanization framework.

This is a project requirement, not an optional editing pass.

It applies to:

- Landing page copy.
- Introductory explanations.
- Navigation labels where appropriate.
- River descriptions.
- Map information panels.
- Empty states.
- Error messages.
- Loading messages.
- Help content.
- Onboarding.
- Accessibility descriptions.
- Automatically generated geographic narratives.
- Any other prose visible to visitors.

Maintain this requirement in the project’s AGENTS.md so it persists across coding sessions.

### 6.1 Voice

Headwaters should sound like a knowledgeable New Zealander showing someone around a landscape.

The writing should be:

- Clear.
- Curious.
- Conversational.
- Specific.
- Grounded in actual geography.
- Comfortable with uncertainty.

Avoid overly polished marketing language.

Avoid unnecessary enthusiasm, dramatic claims, and generic inspirational statements about nature.

Do not make the site sound like a government report, a tourism advertisement, or an AI-generated educational resource.

**Example: explaining a river**

Avoid:

“Discover the fascinating hydrological characteristics of this magnificent waterway and explore its intricate network of tributaries.”

Prefer:

“Follow the Hutt River back into the Tararua Range, or see the streams that join it on the way to Wellington Harbour.”

**Example: explaining a catchment**

Avoid:

“This interactive visualisation enables users to investigate the upstream contributing drainage basin.”

Prefer:

“Everything inside this boundary drains towards the point you’ve selected.”

**Example: uncertainty**

Avoid:

“The system has encountered an error determining the upstream terminal node.”

Prefer:

“We can’t trace this stream all the way to its source. There’s a gap in the mapped river network.”

These examples establish the intended tone. The actual humanize skill takes precedence.

### 6.2 Geographic terminology

Use plain English by default.

Introduce technical terms when they genuinely help.

For example:

**Catchment**

“The area of land where rain and streams eventually drain to the same place.”

**Tributary**

“A stream or river that flows into another river.”

**Headwaters**

“The streams and upper reaches where a river begins.”

Avoid replacing accurate geographic terminology with vague language.

Explain it naturally instead.

### 6.3 Te reo Māori and te ao Māori

Te reo Māori should be a natural part of Headwaters, not a decorative addition.

The project is grounded in Aotearoa, and its language should reflect that.

**Principles**

- Preserve macrons in Māori place names.
- Prefer authoritative geographic names.
- Support official dual names where appropriate.
- Avoid inventing translations.
- Avoid constructing new Māori phrases without appropriate review.
- Do not use Māori cultural concepts as superficial branding.
- Recognise the relationship between waterways, whenua, and communities.
- Treat Māori names as geographic information in their own right.

Use authoritative naming sources, particularly the New Zealand Geographic Board / Ngā Pou Taunaha o Aotearoa.

Where a waterway has both Māori and English names, consider displaying both.

For example:

Te Awa Kairangi / Hutt River

Use the official naming conventions applicable to the feature, rather than assuming every name should follow the same ordering.

**Ki uta ki tai**

The subtitle is:

Ki uta ki tai — from the mountains to the sea.

The concept should inform the experience itself.

Headwaters should reveal connections across a landscape rather than presenting rivers as isolated lines.

Any extended explanation of ki uta ki tai, particularly one discussing tikanga, mātauranga Māori, or relationships with mana whenua, should be researched and reviewed appropriately.

Do not imply endorsement by iwi or hapū without an actual relationship.

### 6.4 New Zealand English

Use New Zealand English throughout.

Examples:

- Colour, not color.
- Metres, not meters.
- Kilometres, not kilometers.
- Organise, not organize.
- Harbour, not harbor.

Use metric units.

Prefer familiar New Zealand geographic language.

Avoid Americanisms and imported outdoor-adventure terminology that feels out of place.

## 7. Interaction design

Headwaters should reward exploration.

The primary interaction is selecting something on the map and discovering where it connects.

### 7.1 Map-first interface

Avoid a large permanent sidebar that competes with the map.

Instead, consider:

- A compact floating search control.
- A small set of map controls.
- A contextual information panel.
- Expandable details when needed.

The user should always understand which river or catchment is selected.

### 7.2 Progressive discovery

Do not display every available measurement immediately.

Start with the most interesting information:

- River name.
- Source.
- Destination.
- Length.
- Catchment area.

Allow users to explore tributaries, elevation, and other details when they choose.

### 7.3 Network highlighting

Use distinct visual states for:

- Selected river.
- Upstream network.
- Downstream route.
- Main channel.
- Tributaries.
- Catchment boundary.

Consider subtle animations that reveal connectivity.

Animations should communicate information, not simply decorate the interface.

Respect reduced-motion preferences.

### 7.4 Mobile experience

The application should work well on mobile.

People may use Headwaters while walking, travelling, or looking at a landscape.

Consider:

- Bottom-sheet information panels.
- Touch-friendly map controls.
- Clear selection states.
- Minimal screen obstruction.
- Readable labels.
- Efficient data loading.

Do not require desktop hover interactions for essential functionality.

## 8. Data sources

Investigate three primary sources.

### 8.1 River Environment Classification (REC2)

REC2 is the preferred initial candidate for network topology.

It provides a connected river network with upstream/downstream relationships.

Reported attributes include:

- nzsegment: Segment identifier.
- nextdownid: Next downstream segment.

Verify the actual published schema.

Investigate:

- Authoritative downloads.
- Available versions.
- Licensing.
- River line geometry.
- Watershed polygons.
- Segment connectivity.
- Naming attributes.
- Network completeness.

Do not assume that REC2 provides every waterway shown on Topo50.

### 8.2 LINZ Topo50 waterways

Investigate:

- River centrelines.
- Stream centrelines.
- Drain centrelines.
- Canal centrelines.
- NZ River Name Lines (Pilot).

Topo50 may provide more detailed geographic linework.

Determine whether it should be:

1. The primary network.
2. A visual layer over REC2.
3. A supplementary source of geometry and names.

Do not assume that Topo50 lines have reliable flow direction.

### 8.3 Digital elevation models

Investigate suitable LINZ elevation datasets and existing terrain services.

Elevation is needed for:

- Source elevation.
- Destination elevation.
- Elevation profiles.
- Catchment elevation ranges.
- 3D terrain.
- Potential flow-direction validation.

Prefer an existing terrain tile service for the initial prototype.

Do not process nationwide LiDAR unnecessarily.

## 9. River graph and geographic model

Treat the river network as a directed graph.

Each segment should contain:

| Field | Purpose |
| --- | --- |
| Segment ID | Unique identifier |
| Geometry | River line |
| Downstream ID | Next downstream segment |
| Name | Waterway name |
| Length | Segment length |
| Upstream elevation | DEM-derived elevation |
| Downstream elevation | DEM-derived elevation |
| Watershed ID | Associated drainage area |
| Source | Dataset provenance |

The graph must support:

**Upstream traversal**

Return every segment draining into a selected segment.

**Downstream traversal**

Follow the network to its terminal destination.

**Longest upstream path**

Identify the most distant upstream source, measured along the connected river network.

**Named river extent**

Identify the extent of a named waterway where supported by the source data.

**Connected network**

Identify the complete river system containing a selected segment.

**Upstream catchment**

Identify the land draining into a selected point.

For a point within a segment, distinguish the full upstream catchment at the segment outlet from the catchment at the actual selected point. Investigate the accuracy achievable with REC2 watershed polygons and DEM-derived delineation.

**Edge cases**

Explicitly consider:

- Braided rivers.
- Lakes.
- Multiple outlets.
- Artificial channels.
- Disconnected segments.
- Unnamed tributaries.
- River renaming.
- Coastal streams.
- Ambiguous sources.
- Data gaps.

Do not silently invent connectivity.

## 10. Technical architecture

Prefer a small, maintainable architecture.

**Frontend**

Astro + TypeScript

Use Astro for the website and an interactive mapping component.

Avoid introducing a large frontend framework unless necessary.

**Mapping**

MapLibre GL JS

Investigate its suitability for:

- 2D mapping.
- Vector river layers.
- Catchment overlays.
- Terrain rendering.
- Geographic selection.
- Camera navigation.

Use MapLibre terrain before introducing Three.js.

**Data processing**

Investigate:

- Python.
- DuckDB Spatial.
- GeoParquet.
- PMTiles.
- FlatGeobuf.
- Precomputed graph structures.

Prefer reproducible ingestion and processing.

**Serving data**

Evaluate a static-first architecture.

The river network changes relatively infrequently.

Potentially:

1. Download source datasets.
2. Process them into a directed graph.
3. Precompute useful relationships.
4. Generate vector tiles and compact metadata.
5. Publish the results as static assets.
6. Run lightweight traversal queries in the browser where practical.

Compare this with a PostgreSQL/PostGIS backend.

Do not introduce PostGIS solely because the application involves geographic data.

Consider the cost of transferring large upstream networks to the browser and whether a small query service would be more appropriate.

## 11. Initial geographic prototype

Start with Te Awa Kairangi / Hutt River and its catchment.

This provides:

- Mountain headwaters.
- Numerous tributaries.
- Significant elevation variation.
- A recognisable named river.
- A coastal destination.
- Interesting terrain for 3D visualisation.

Use real geographic data.

The prototype must support:

1. Selecting a river segment.
2. Displaying its name.
3. Highlighting its upstream network.
4. Tracing its downstream route.
5. Finding its furthest upstream source.
6. Displaying its upstream catchment.
7. Showing network length and catchment area.
8. Switching to 3D terrain.

The prototype should also establish the visual identity of Headwaters.

Do not defer all design work until the geographic functionality is complete.

Develop the map styling, typography, colour palette, and basic information panel alongside the prototype.

## 12. Potential future features

These are not initial requirements.

**River journeys**

Animate a journey from a river’s source to the sea.

**Elevation profiles**

Show elevation against distance along a selected waterway.

Allow users to move between the profile and corresponding map locations.

**River comparisons**

Compare rivers by:

- Longest flow path.
- Catchment area.
- Total network length.
- Elevation drop.
- Tributary count.

**River network diagrams**

Display simplified branching diagrams of river systems.

**3D flythroughs**

Follow a river through the landscape using an animated camera.

**Geographic discovery**

Explore questions such as:

- Where does this stream begin?
- Which river has the longest journey to Wellington Harbour?
- What is the highest source in this catchment?
- Where does water from this valley eventually reach the sea?
- Which streams feed into this point?

## 13. Implementation phases

### Phase 1 — Data feasibility

Before implementation:

1. Locate authoritative REC2 downloads.
2. Verify versions and licences.
3. Inspect segment schemas.
4. Confirm upstream/downstream topology.
5. Inspect watershed polygons.
6. Investigate Topo50 waterways.
7. Identify suitable elevation data.
8. Evaluate river naming coverage.
9. Compare static and database-backed architectures.

Deliverable: A technical feasibility assessment with verified sources, schemas, limitations, and recommendations.

### Phase 2 — Design exploration

Develop a compact visual direction for Headwaters.

Include:

- Colour palette.
- Typography.
- River network motif.
- Contour-line motif.
- Map styling.
- Source and destination markers.
- Catchment styling.
- Information panel design.
- Mobile layout.

Produce a small number of coherent design concepts rather than a large collection of unrelated options.

Prefer actual geographic data in visual examples.

All proposed interface copy must follow the humanize skill.

Deliverable: A design direction and initial component specifications.

### Phase 3 — Data pipeline

Build a reproducible pipeline that:

1. Imports the selected datasets.
2. Extracts the prototype catchment.
3. Validates network topology.
4. Calculates segment lengths.
5. Identifies upstream and downstream relationships.
6. Associates watershed polygons.
7. Generates web-friendly geographic assets.

### Phase 4 — Interactive prototype

Build the Astro + MapLibre application.

Implement:

- River selection.
- Source identification.
- Downstream tracing.
- Upstream highlighting.
- Catchment visualisation.
- Basic river statistics.

Apply the selected design direction.

### Phase 5 — Terrain

Add:

- 3D terrain.
- Elevation sampling.
- River overlays.
- Source and destination elevation.
- Optional elevation profiles.

### Phase 6 — National feasibility

Evaluate:

- National dataset sizes.
- Processing time.
- Graph storage.
- Tile generation.
- Hosting.
- Search performance.
- Data updates.
- Licensing and attribution.

Avoid premature optimisation during the prototype.

## 14. Acceptance criteria

The prototype is successful when:

**Geographic functionality**

- A visitor can select a real river.
- The upstream network is correctly identified.
- The downstream route is correctly identified.
- The furthest upstream source is calculated using network distance.
- The catchment is displayed with its accuracy and limitations understood.
- Data gaps and ambiguous connections are handled explicitly.

**Experience**

- The map is the primary interface.
- A non-specialist can understand the core features.
- The application works on desktop and mobile.
- River networks and catchments are visually distinguishable.
- The design feels connected to Aotearoa’s landscapes and cartographic traditions.

**Language**

- All site prose follows the specified humanize skill.
- New Zealand English is used consistently.
- Māori place names preserve macrons.
- Official geographic naming is respected.
- Te reo Māori is used thoughtfully and accurately.
- Unverified cultural explanations are not presented as authoritative.

**Engineering**

- Data processing is reproducible.
- Source datasets and licences are documented.
- The architecture avoids unnecessary infrastructure.
- Geographic calculations are tested.
- The project can reasonably grow to national coverage.

## 15. Instructions for the coding agent

You are working on Headwaters, an interactive atlas of Aotearoa New Zealand’s rivers.

The project’s subtitle is:

Ki uta ki tai — from the mountains to the sea.

Your priorities are:

1. Geographic accuracy.
2. An approachable, map-first experience.
3. A distinctive visual identity rooted in New Zealand cartography and landscapes.
4. Clear, natural language.
5. Simple, maintainable architecture.
6. Reproducible data processing.

### Mandatory requirements

Read the humanize skill before writing any user-facing copy:

https://github.com/joshmcarthur/dotfiles/tree/master/agents/skills/humanize

Apply its instructions to all site prose.

Add this requirement to the project’s AGENTS.md.

Use New Zealand English and respect te reo Māori orthography.

Do not invent cultural explanations or geographic facts.

Do not turn Headwaters into a specialist hydrological dashboard.

Do not introduce infrastructure that the prototype does not need.

### Working approach

Begin in planning mode.

Research the actual datasets before choosing the final architecture.

Distinguish verified capabilities from assumptions.

Present the key architectural decisions and their tradeoffs.

Develop a coherent design direction alongside the technical plan.

Do not immediately scaffold a full application.

### First deliverables

Produce:

1. Dataset feasibility assessment

Identify verified REC2, Topo50, and elevation sources.

Explain how they can support river tracing and catchment exploration.

2. Architecture recommendation

Recommend a processing pipeline, geographic data format, and serving architecture.

Prefer static/precomputed approaches where practical.

3. Design direction

Propose a cohesive visual identity for Headwaters, including typography, colours, cartographic motifs, map styling, and interaction patterns.

4. Implementation plan

Describe how to build and validate the Hutt River prototype, with clear milestones and acceptance criteria.

Stop after presenting these deliverables for review.

Do not proceed to implementation until the plan has been accepted.
