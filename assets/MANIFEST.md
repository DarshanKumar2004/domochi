# Asset Manifest

This is the source of truth for every art asset. Scenes only reference assets by key, through `src/assets/keys.ts`.

**To replace a placeholder with real art:**

1. Export a PNG with transparency at the size listed below. For sprite sheets, put the frames left to right.
2. Save it at the listed path under `public/`.
3. Add one line to `ASSET_FILES` in `src/assets/files.ts`. Set `boot: true` for anything the loading screen needs (the truck and Ethan).
4. Change the Status column below to **Final**.

Any key without a real file falls back to a placeholder drawn in code (`src/assets/placeholders.ts`). A unit test checks that every key in `keys.ts` is listed here.

## Textures

| Key | Path (planned) | Size (px) | Frames | Status | Purpose |
|---|---|---|---|---|---|
| `truck` | `public/assets/truck.png` | 900×620 | 1 | Placeholder (code) | Domochi food truck on the loading screen and in the Lobby. The window's bottom centre (450, 440) and sign centre (450, 45) are set in `TRUCK_SPEC`. |
| `ethan` | `public/assets/ethan.png` | 880×260 sheet | 4 × (220×260) | Placeholder (code) | Ethan (owner), torso up, waving. Feet anchor at the bottom centre of each frame. |
| `customer` | `public/assets/customer.png` | 180×340 | 1 | Placeholder (code) | Generic customer, origin at the bottom centre. |
| `donut-plain` | `public/assets/donut-plain.png` | 320×320 | 1 | Placeholder (code) | Plain pon de ring (8 balls), before glaze. |
| `fryer` | `public/assets/fryer.png` | 760×460 | 1 | Placeholder (code) | Fry station: oil vat, heat dial and oil gauge. |
| `glaze-bowl` | `public/assets/glaze-bowl.png` | 260×170 | 1 | Placeholder (code) | Bowl of glaze at the Glaze station. |
| `topping-jar` | `public/assets/topping-jar.png` | 160×220 | 1 | Placeholder (code) | Jar of toppings at the Toppings station. |
| `donut-box` | `public/assets/donut-box.png` | 620×420 | 1 | Placeholder (code) | Open box with 6 slots at the Box station. |
| `icon-lobby` | `public/assets/icons/lobby.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-fry` | `public/assets/icons/fry.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-glaze` | `public/assets/icons/glaze.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-toppings` | `public/assets/icons/toppings.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-box` | `public/assets/icons/box.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |

## Animations

| Key | Texture | Frames | Rate | Purpose |
|---|---|---|---|---|
| `ethan-wave` | `ethan` | 0–3, yoyo, loop | 8 fps | Ethan waving on the loading screen, in the Lobby truck window, and in the tutorial. |
