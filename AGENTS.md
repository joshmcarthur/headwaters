# Headwaters

Interactive atlas of Aotearoa New Zealand’s and Australia’s rivers. Subtitle: Ki uta ki tai — from the mountains to the sea.

Scope: Aotearoa New Zealand and Australia. Visual identity comes from `design/Headwaters/`.

Architecture: Astro + MapLibre, per-country PMTiles and compact binary graphs, no PostGIS, no React, no Three.js. Do not ship nationwide GeoJSON. New Zealand network is NIWA REC2 v5 (CC BY-NC 4.0). Do not use it commercially. Australia network is Bureau of Meteorology Geofabric Surface Hydrology Network V3.3 (CC BY 4.0).

## User-facing prose

Before generating or modifying any visitor-facing copy:

1. Read the humanize skill: `https://github.com/joshmcarthur/dotfiles/tree/master/agents/skills/humanize` (or the local clone at `~/.agents/skills/humanize/SKILL.md` if present).
2. Read any `references/` files the skill requires for that pass.
3. Apply the skill to the copy.
4. Review the result against the skill before considering the copy done.

If the skill cannot be retrieved, stop and report that. Do not substitute another humanization framework.

This applies to landing copy, navigation labels, river descriptions, map panels, empty states, errors, loading messages, help, onboarding, accessibility descriptions, generated geographic narratives, and any other prose a visitor sees.

Use New Zealand English (colour, metres, kilometres, organise, harbour). Preserve macrons in te reo Māori. Prefer New Zealand Gazetteer names. Do not invent cultural explanations or geographic facts.
