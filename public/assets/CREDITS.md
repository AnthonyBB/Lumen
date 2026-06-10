# Asset Credits

All asset packs below were created by **Kenney** (kenney.nl) and are released
under **Creative Commons CC0** (public domain — free for personal and
commercial use, no attribution required, though we credit them gladly).

| File | Pack | Source | License |
|------|------|--------|---------|
| `packs/tiny_town.png` | Tiny Town (tilemap_packed.png) | https://kenney.nl/assets/tiny-town | CC0 |
| `packs/tiny_dungeon.png` | Tiny Dungeon (tilemap_packed.png) | https://kenney.nl/assets/tiny-dungeon | CC0 |
| `packs/roguelike_rpg.png` | Roguelike/RPG Pack (roguelikeSheet_transparent.png) | https://kenney.nl/assets/roguelike-rpg-pack | CC0 |

## Sheet specs (for Phaser loading)

- `tiny_town.png` — 192×176, 16×16 tiles, 12 cols × 11 rows, no spacing → frame = row*12 + col
- `tiny_dungeon.png` — 192×176, 16×16 tiles, 12 cols × 11 rows, no spacing → frame = row*12 + col
- `roguelike_rpg.png` — 968×526, 16×16 tiles with **1px spacing**, 57 cols × 31 rows
  → load with `{ frameWidth: 16, frameHeight: 16, spacing: 1 }`, frame = row*57 + col

Downloaded 2026-06-09.
