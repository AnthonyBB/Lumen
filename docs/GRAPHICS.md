# CraftPix Graphics Assets — Structure Reference

Purchased CraftPix packs powering the game's art overhaul. **LICENSE: these
assets may be used in the game but NOT redistributed. The repo is public, so
`graphics/` (zips + extracted sources) and `public/assets/craftpix/` (game
copies) are git-ignored. Deployments must copy `public/assets/craftpix/` in
as a separate step.**

- Original zips + full extractions (PSD/AI/Aseprite sources): `graphics/`
- Game-ready copies served by Vite: `public/assets/craftpix/<pack>/`
  - `PNG/` — tileset atlases and prop images
  - `Tiled/` — Tiled editor files (`.tsx` tileset metadata, `.tmx` example
    maps). **The `.tsx` files are the authoritative source for tile size,
    columns, and spacing — read them before hardcoding frame indices.**

## Common pack anatomy (CraftPix top-down convention)

- **Tile size: 16×16**, no spacing (confirmed via `.tsx`: e.g. grassland
  `tilewidth="16" columns="37"`). Render at 4× (64 px cells) to match the
  existing WorldScene/BiomeScene stamping pipeline.
- Typical atlases per pack:
  - `ground_*.png` / `Snow.png` / etc. — base terrain fills + variants
  - `Water_coasts.png` — water with full shore-transition tiles
  - `water_detilazation*.png` — large anti-repetition water sheets
  - `Trees_rocks.png` / `Objects.png` — multi-tile scenery (trees span
    several tiles; check the pack's `.tmx` for intended assembly)
  - `details.png` / `spots*.png` — small overlay decals (flowers, pebbles)
- `PNG/Objects_separately/` (spelling varies: `Objects_separated`,
  `Objects_separetely`) — each prop as an individual PNG with alpha, often in
  multiple resolutions (winter has `/16 /32 /64 /128 /512` subfolders).
  **Prefer these over atlas-slicing for props** — no frame math needed.
- Buildings in `autumn_city` are individual PNGs per building
  (`PNG/buildings/building_N.png`, various sizes up to 767×751) — drop-in
  replacements for town buildings, no slicing required.
- Animated content (farm animals, fishing NPCs/boats/fish, tavern) ships as
  Aseprite sources in `graphics/` plus packed PNG strips under
  `PNG/Animation_packed/` where present — load as spritesheets after
  measuring frame size.

## Pack → game area mapping (proposal)

| Pack | Game area |
|---|---|
| `grassland` | Town/world base terrain + Grassland biome |
| `forest` | Deciduous Forest biome |
| `winter` | Snow biome |
| `desert` | Desert biome |
| `swamp` | Swamp biome |
| `seabed` | Ocean biome |
| `cursed_land` | hard-tier biome locations / future cursed zone |
| `rocky` | Pine Forest accents, mountain props, biome rocks |
| `autumn_city` | Town buildings + roads (richest building set) |
| `autumn_vector` | alt town look (vector style — may clash with pixel art) |
| `cave`, `glowing_cave`, `dungeon`, `undead` | future dungeon/interior zones |
| `farm`, `fishing_village`, `home`, `tavern` | town life: NPCs, animals, interiors |
| `flying_islands` | future special zone |

## Integration notes

- Load atlases with `this.load.spritesheet(key, url, { frameWidth: 16, frameHeight: 16 })`
  and verify columns against the matching `.tsx` before computing frames —
  wrong column counts scramble every frame (this bit us with earlier packs).
- Load `Objects_separately` props with `this.load.image` — simplest path.
- Visual verification rule (hard-learned): extract and LOOK at a tile before
  wiring its frame index into a scene.
