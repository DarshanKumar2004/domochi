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
| `logo` | `public/assets/logo.png` | 512×512 | 1 | **Final** | Official domochi logo: ink-on-white comic ring plus a hollow wordmark, on a transparent background, so it needs a light background. Shown on the loading screen and on the trailer. Downscaled from the 1024 px original on domochitreats.com. Permission confirmed by Kumar on 2026-10-30. |
| `truck` | `public/assets/truck.png` | 900×620 | 1 | Placeholder (code) | domochi's white trailer (based on Kumar's photos): window on the left, OPEN sign, logo on the right side. Anchors are set in `TRUCK_SPEC`: window bottom centre (250, 390), OPEN sign (515, 200), logo centre (720, 250) at 260 px, @handle (720, 430). The logo, the hanging OPEN/CLOSED sign (a black oval that flips over; only its wires are in the art) and the handle are overlaid by `ui/Truck.ts`, so real truck art should leave those areas blank. A stabiliser jack stands under the back (right) corner. |
| `sign-aframe` | `public/assets/sign-aframe.png` | 220×320 | 1 | Placeholder (code) | Sidewalk A-frame poster ("DOMOCHI MOCHI DONUTS" plus donut photos) next to the trailer. Origin at the bottom centre. |
| `ethan` | `public/assets/ethan.png` | 880×260 sheet | 4 × (220×260) | Placeholder (code) | Ethan (owner), torso up, waving. Feet anchor at the bottom centre of each frame. |
| `customer-student` | `public/assets/customer-student.png` | 180×340 | 1 | Placeholder (code) | UL student: vermilion hoodie and backpack straps. Origin at the bottom centre. Picked by `sprite` in customers.json. |
| `customer-office` | `public/assets/customer-office.png` | 180×340 | 1 | Placeholder (code) | Office worker: blue shirt and tie. Origin at the bottom centre. Picked by `sprite` in customers.json. |
| `customer-parent` | `public/assets/customer-parent.png` | 180×340 | 1 | Placeholder (code) | Parent: purple top. Origin at the bottom centre. Picked by `sprite` in customers.json. |
| `customer-regular` | `public/assets/customer-regular.png` | 180×340 | 1 | Placeholder (code) | Regular: black domochi tee. Origin at the bottom centre. Picked by `sprite` in customers.json. |
| `donut-plain` | `public/assets/donut-plain.png` | 320×320 | 1 | Placeholder (code) | Plain pon de ring (8 balls), before glaze. |
| `fryer` | `public/assets/fryer.png` | 760×440 | 1 | Placeholder (code) | Fryer vat seen from the front-top. The oil surface (where donuts float) is the inner area at about (56, 56, 648, 328). Controls (dial, gauges) are separate UI, not part of this art. |
| `fry-grate` | `public/assets/fry-grate.png` | 690×360 | 1 | Placeholder (code) | Pressing grate laid over the oil; moves down while held. Mostly transparent between the bars. |
| `fry-dispenser` | `public/assets/fry-dispenser.png` | 215×175 | 1 | Placeholder (code) | Mochi donut depositor over the vat. Donuts drop from its nozzle at the bottom centre (100, 170). |
| `trash-bin` | `public/assets/trash-bin.png` | 160×160 | 1 | Placeholder (code) | Trash can at the Fry station: drag donuts here to throw them out; burnt donuts fly here on their own. |
| `mixing-bowl` | `public/assets/mixing-bowl.png` | 360×250 | 1 | Placeholder (code) | Dough station bowl, front-top view. The opening is an ellipse centred ≈ (180, 70), 340×90: the dough is drawn there in code. |
| `ingredient-bin` | `public/assets/ingredient-bin.png` | 160×200 | 1 | Placeholder (code) | Dough station ingredient canister (white; tinted and labelled per ingredient in code). |
| `sponge` | `public/assets/sponge.png` | 120×84 | 1 | Placeholder (code) | Wiping the glaze and toppings trays at closing (follows your finger). |
| `popup-booth` | `public/assets/popup-booth.png` | 900×620 | 1 | Placeholder (code) | Event days: a striped pop-up canopy with a blank banner (≈ 400×130 centred at (450, 150); the logo and event name go there in code) and a table. Anchors in `BOOTH_SPEC`. |
| `cloud` | `public/assets/scenery/cloud.png` | 240×110 | 1 | Placeholder (code) | Lobby sky: clouds that drift slowly across. |
| `oak-tree` | `public/assets/scenery/oak-tree.png` | 460×420 | 1 | Placeholder (code) | Lobby backdrop: a Louisiana live oak with Spanish moss (trunk base at the bottom centre). |
| `patio-table` | `public/assets/scenery/patio-table.png` | 300×290 | 1 | Placeholder (code) | Lobby waiting patio: a picnic table under a pink umbrella. |
| `planter` | `public/assets/scenery/planter.png` | 150×130 | 1 | Placeholder (code) | Lobby: a flower planter by the A-frame sign. |
| `icon-dough` | `public/assets/icons/dough.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `mascot` | `public/assets/mascot.png` | 220×210 | 1 | Placeholder (code) | "mochi", the tutorial guide: a strawberry-glazed pon de ring with a face. Bobs and squishes in code. |
| `pointer-hand` | `public/assets/pointer-hand.png` | 120×164 | 1 | Placeholder (code) | Tutorial pointing hand. Fingertip at the top centre (≈ 59, 8); the tutorial rotates it to point at things. |
| `donut-fry` | `public/assets/donut-fry.png` | 160×160 | 1 | Placeholder (code) | **Must be white or greyscale:** it's tinted at runtime from raw (pale) to golden to burnt by `fryColor()`. Plain pon de ring, no glaze. |
| `glaze-cup` | `public/assets/glaze-cup.png` | 150×160 | 1 | Placeholder (code) | Pouring cup for the Glaze station. **Draw it white/light grey:** it's tinted per glaze at runtime, which makes the coloured cups. Spout at the top left (about 6, 26); the stream falls from there. |
| `sugar-sifter` | `public/assets/sugar-sifter.png` | 160×140 | 1 | Placeholder (code) | Powdered-sugar sifter (beignet's dust). Not tinted. |
| `topping-jar` | `public/assets/topping-jar.png` | 160×220 | 1 | Placeholder (code) | Empty glass jar with a lid at the Toppings station; glass ≈ x 15–145, y 35–215, lid at the top. The topping inside is drawn over it in code, per topping, and it's held upside down to shake. |
| `donut-box` | `public/assets/donut-box.png` | 620×420 | 1 | Placeholder (code) | Closed box lid (plain kraft) that shuts over the open box at the Box station. The open box and its slots (3, 6 or 12) are drawn in code; the logo is placed on the lid in code. |
| `icon-lobby` | `public/assets/icons/lobby.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-fry` | `public/assets/icons/fry.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-glaze` | `public/assets/icons/glaze.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-toppings` | `public/assets/icons/toppings.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |
| `icon-box` | `public/assets/icons/box.png` | 96×96 | 1 | Placeholder (code) | Tab bar icon. |

## Web icons (not game textures)

Home-screen and browser-tab icons: the logo on cream, made by `npm run icons` (scripts/make-icons.mjs) from `public/assets/logo.png`. Re-run that whenever the logo changes.

| File | Size (px) | Purpose |
|---|---|---|
| `public/icons/icon-512.png` | 512×512 | Web app manifest (Android home screen, splash), share preview |
| `public/icons/icon-192.png` | 192×192 | Web app manifest |
| `public/icons/icon-180.png` | 180×180 | iPhone home screen (apple-touch-icon) |
| `public/icons/icon-32.png` | 32×32 | Browser tab |

## Animations

| Key | Texture | Frames | Rate | Purpose |
|---|---|---|---|---|
| `ethan-wave` | `ethan` | 0–3, yoyo, loop | 8 fps | Ethan waving on the loading screen, in the Lobby truck window, and in the tutorial. |
