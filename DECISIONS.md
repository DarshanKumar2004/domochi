# Decisions

Small decisions made during development. Large design changes are asked about first.

## Phase 0 (2026-10-30)

- ~~Phaser pinned to 3.90.0.~~ Superseded the same day (see below).
- **Upgraded to Phaser 4.2.1.** Kumar confirmed that "Phaser 3" in the plan was only a guess at the newest version. The policy now is to use the newest versions. The scaffold needed no code changes: type check, unit tests and the smoke test all pass, and the screenshot matches. CLAUDE.md was updated to say Phaser 4.
- **TypeScript 7, Vite 8, Vitest 5, Playwright 1.64.** These were the latest versions at setup time. Type checking and tests pass on them.
- **Hand-written scaffold** instead of `npm create vite`, so the layout matches the structure in CLAUDE.md without template leftovers.
- **Vite `base: './'`.** Relative asset paths work on GitHub Pages subpaths and inside Capacitor.
- **`window.__game`** is exposed so Playwright can check which scene is active.
- **Playwright runs as a Pixel 7** (mobile Chromium, touch enabled), because mobile web is the main target.
- **Ring geometry is in `src/stations/donutGeometry.ts`.** The pon de ring layout (8 balls, first at 12 o'clock, clockwise) is pure and unit-tested, and later stations will reuse it for glaze and topping hit regions.

## Phase 1 (2026-10-30)

- **Station switching uses sleep/wake.** `HudScene` puts the station you leave to sleep and wakes (or first starts) the one you tap, so each station keeps its state. A sleeping scene doesn't run `update()`, so in Phase 3 the fry simulation will advance in a `systems/` service, not inside `FryScene`. That way donuts keep cooking while you're at another station.
- **Tab bar is its own scene (`HudScene`), always on top.** Popups (Order, Serve, Settings) call `beginOverlay()`, which moves them above the tab bar and blocks taps underneath. *Bug found by screenshot review:* without this, a popup opened after a tab switch drew *under* the tab bar, because Phaser keeps a launched scene in its original slot in the scene list. The Playwright flow now asserts that each popup is the top scene.
- **Tabs: Lobby, Fry, Glaze, Toppings, Box.** Order and Serve aren't tabs. Order is a popup opened by tapping the front customer, and Serve is the result card after "Close lid & serve" (CLAUDE.md: "Serve … cuts back to the Lobby").
- **The save is loaded before Phaser starts** (`main.ts`). `SaveService` keeps the save in memory so reads are synchronous, and writes go through an *async* `SaveStorage` interface, so Capacitor Preferences (which is async) can replace localStorage in Phase 8 without touching scenes. A corrupt or partly-invalid save falls back to defaults field by field, and if localStorage is blocked the game still runs from memory.
- **Placeholder art is generated at load time under the real asset keys.** Real PNGs listed in `src/assets/files.ts` load first, and placeholders only fill keys that are still missing. Replacing art is a file drop plus one line. Anchor points that real art must match (the truck window and sign) live in `TRUCK_SPEC`.
- **A unit test checks that every key in `keys.ts` appears in `assets/MANIFEST.md`,** so the manifest can't fall out of date. It reads the file with Vite's `?raw` import rather than adding `@types/node`.
- **The loading screen shows for at least 1.2 s,** so the truck and Ethan are seen even when loading is instant. This is UI pacing, so it's a constant in `PreloadScene` rather than in `balance.json`.
- **Reset progress needs two taps** ("Tap again to reset") and uses a soft red. Replay tutorial and reset both stop every main-game scene, then start the tutorial.
- **Tutorial is a placeholder:** three lines from Ethan from `tutorial.json`, plus Skip. The guided tutorial is Phase 7.
- ~~Open question, letterboxing~~: resolved below.

## Responsive layout (2026-10-30)

Kumar chose **option B** (fill the screen, no bars) and asked for **landscape on PC, portrait in phone browsers, and landscape by default in the app with a vertical option**. CLAUDE.md's Display section was updated.

- **The orientation follows the window's shape** (width greater than height means landscape) rather than the device type. That covers PC, phone portrait, phone landscape, tablets and resized desktop windows with one rule. A square window counts as portrait.
- **The game size grows to the screen's shape** around a 1920×1080 or 1080×1920 safe area. Longer than 16:9 extends the long side, and squarer than 16:9 extends the short side. **Capped at 2.4:1:** super-ultrawide monitors get slim side bars, so the game doesn't stretch absurdly wide.
- **The short side is always 1080 logical px,** so hit targets (min 120) are the same physical size in both orientations, and the existing portrait numbers stayed valid.
- **Scenes lay out through `onLayout()`,** which runs on create and on every resize, including for sleeping stations. A rotation keeps all state: a station mid-fry stays mid-fry.
- **Tab bar:** 200 px tall in portrait and 160 in landscape. Tabs are capped at 300 px wide and centred, so they don't stretch across a wide monitor.
- **Popup dimmers and tap areas are a fixed 4000×4000 px,** bigger than any possible game, so they never need resizing.
- **Tweens no longer animate x/y** (they would fight the layout). The Lobby's 'Tap me!' pulses in scale, and the Fry donut wobbles in angle.
- **Playwright runs 3 projects:** Pixel 7 portrait, Pixel 7 landscape, and desktop at 1440×900 (mouse, no touch). A rotation test flips the phone mid-game and checks that state is kept and everything is still tappable. `tapGame` also fails if a target is off screen. The full-flow test timeout is 90 s because projects run in parallel.

## Real domochi branding (2026-10-30)

Kumar asked for the real branding and flavours from https://www.domochitreats.com.

- **Source:** the site is a Square Online store. Its pages render in the browser, so the menu came from Square's public store API: `https://cdn5.editmysite.com/app/store/api/v28/editor/users/154290604/sites/187969059733018017/products`. Re-run that to refresh `menu.json` when the shop changes flavours.
- **`menu.json` now has the real menu:** strawberry, cookies & cream, chocolate hazelnut, fruity cereal, cookie butter and beignet, all $4. Boxes: the trio (3, $11), the flight (6, $20) and the domochi box (12, $30). Names, descriptions and prices are copied exactly.
- **Game-design guesses layered on top** (not from the shop, easy to change in the JSON):
  - "sweet glaze" for fruity cereal, because the site only says "sweet glaze".
  - **Beignet is a "dust" style**: powdered sugar shaken on at the Glaze station, a third style beside dip and drizzle. Its mechanic is decided in Phase 4.
  - Every real flavour is a full dip, so "drizzle" is unused for now but still supported.
  - **Unlock order:** day 1 strawberry plus cookies & cream (so the Toppings station is used from day 1), then chocolate hazelnut, fruity cereal, cookie butter and beignet on days 2 to 5. This is a balance placeholder, to be tuned in Phase 6.
- **`validateMenu()`** (`src/systems/menu.ts`) checks ids, references, colours and unlock days, and a unit test runs it on the real `menu.json`. A typo in a future menu edit fails the tests instead of breaking the game.
- **`brand.json`** holds the name, tagline, founder, city, website and Instagram. Address and hours were left out because they change, and stale hours in a game would be bad marketing.
- **Palette:** ink `#1f1a17` and cream `#fffaf0` from the site, with strawberry-glaze pink `#f4a6c0` as the accent. Ethan wears black with a cream outline, echoing the logo's ink outlines and keeping him visible on dark backgrounds.
- **Text:** the loading screen shows "domochi" plus the tagline, the truck sign is lowercase, and Ethan's tutorial lines use the shop's own "what's a mochi donut?" copy.
- **Not done yet, waiting on Kumar:** the official logo PNG is not in the repo (see open questions in chat). The setting is still a truck, but the real business is a walk-up window at the shop plus pop-ups.

## Rotation bug fix (2026-10-30)

**Bug (found by Kumar on a real phone):** after rotating to landscape and back to portrait, the game showed as a smaller box inside the screen.

- **Cause:** `watchWindowSize` only acted when the computed *game size changed*. Rotating back to portrait gives the same game size as before, so nothing told Phaser to re-fit the canvas, and it kept the display size it had mid-rotation. Window sizes read inside rotation events can also be stale, so one event wasn't trustworthy either.
- **Fix:**
  - `watchContainerSize` measures the `#game` container rather than `window.innerWidth`.
  - It re-checks 100, 300 and 700 ms after the last event and listens to `ResizeObserver` and `visualViewport` as well.
  - It always calls `scale.refresh()`.
  - `#game` is now `position: fixed` with overflow clipped, so a briefly oversized canvas can't widen the page and trigger mobile zoom-to-fit.
- **Tests (`tests/e2e/layout.spec.ts`):** the canvas fills the screen on load, after rapid back-and-forth rotations, and after being forced oversized. The rotation flow in `smoke.spec.ts` also asserts the canvas fills the screen. I checked that the oversized test **fails on the old code** with the canvas stuck at 3× the screen.

## Trailer, logo and drizzles (2026-10-30)

Kumar shared photos of the real trailer and A-frame sign, confirmed the setting is the trailer, confirmed we may use the official logo, and confirmed the lowercase name "domochi".

- **Logo** is in `public/assets/logo.png`, a 512 px downscale (125 KB, down from 619 KB) for phone load times. It loads in Boot because the loading screen needs it. A code-drawn fallback ring is used if the file ever fails to load.
- **The loading screen is now cream,** like the trailer. The logo is ink on transparent with a *hollow* wordmark, which would disappear on our dark background. The logo replaces the text title, and the layout puts the logo on the left and the trailer on the right in landscape, stacked in portrait.
- **The placeholder truck now matches the photos:** a white trailer with bold ink outlines, as in the logo's comic style. It has the window on the left with Ethan and a menu board, the OPEN sign, the logo and @handle on the right, and tandem white-rim wheels. The old roof sign is gone because the real trailer doesn't have one.
- **New A-frame sign** in the Lobby next to the trailer. The ground is light concrete, like the photos, and the truck's wheels now sit on the ground line.
- **Drizzles, from the A-frame photo:** strawberry and cookie butter have white icing stripes over the base glaze, and cookie butter has a cookie on top. The menu model is now *base glaze* (dip or dust) plus an *optional drizzle* plus toppings, and the validator enforces those styles. So the Glaze station (Phase 4) will be dip or dust, then drizzle when the ticket asks for it.
- **The deliveries idea** (coffee-shop batch orders, delivery apps) is recorded in CLAUDE.md under Future ideas, with a note to get partner permission before using real names.

## Phase 2: order loop (2026-10-30)

- **`GameSession` (`src/systems/GameSession.ts`) is the single source of truth for a day.** It holds customers (in line, ordering, waiting, served), tickets (open, boxed, served), the *active* ticket and the box *in hand*. It's pure TypeScript driven by `tick(dtMs)`, with no wall clock and injected randomness, and is unit-tested end to end. Scenes only render from it and call its actions, and they redraw on its `changed` event.
- **The clock runs in `HudScene.update`,** the one scene that is always awake during play. Customers keep arriving while you're at a station. Each tick is capped at 250 ms, so a hitch doesn't skip time.
- **Seeded randomness (`systems/rng.ts`, mulberry32).** `?seed=123` in the URL makes a day reproducible, for tests and bug reports.
- **Ticket rail at the top (Papa's style)** shows Day N with served/total, the open tickets and Settings. Settings moved from the Lobby to the rail, so it's reachable from every station. The content area now sits between the rail and the tab bar, and all layouts were retuned.
- **Serving flow:** tap the front customer, who says their order. The ticket is written, and "Got it!" sends them to the waiting area with a number tag. Tap a rail ticket to make it active. Box → "Close lid & serve" picks the order up and returns to the Lobby with a "hand box #N to its customer" banner, and you tap the right customer. The wrong customer says their own "not mine, I'm #2" line; a customer whose order isn't boxed yet gets a hint. This is how CLAUDE.md's "hand the box to the matching customer" works.
- **Customers never storm off** (friendly brand). `patienceSec` stays in the data for the wait-time score in Phase 6.
- **Orders:** the size is the day's range from `balance.json` narrowed by the customer type's preference. Flavours are only those unlocked that day, weighted toward the type's favourites (×`favoriteWeight`). The order is packed in the smallest real box that fits (trio, flight, domochi box), and spoken naturally ("a strawberry and two cookies & cream").
- **Four customer types** in `customers.json`, each with its own sprite key, favourites, size range, patience and dialogue tiers (great/good/okay/bad; Phase 6 picks the tier). The types are a UL student in vermilion, an office worker, a parent, and a regular in the domochi tee. A validator checks sprites against `keys.ts`, favourites against the menu, and the `{order}`/`{ticket}` placeholders.
- **Performance: donut icons are cached textures.** Phaser Graphics re-draw every shape every frame, so tickets full of Graphics donuts would cost hundreds of shapes per frame. Each flavour's icon is now drawn once into a `donut-icon:<flavor>` texture and reused as an image. These are runtime cache textures, not art, so they're not in `keys.ts`. I checked for leaks: object, tween and texture counts stay flat over time.
- **Playwright is capped at 3 workers.** Headless Chromium renders WebGL on the CPU, so with this machine's 16 threads Playwright defaulted to 8 parallel browsers. They starved each other and long flows timed out. One at a time, everything passed, which confirmed it was load rather than a bug.
- **Not saved yet:** a day in progress isn't saved, so a reload starts the day fresh. Day progress and save/load are Phase 6.

## Phase 3: Fry station (2026-10-30)

- **The simulation is `src/stations/fry.ts` (`Fryer`).** It's pure, frame-rate independent (oil heats with an exponential lag, so 30 fps and 144 fps match) and allocation-free per tick. 17 unit tests cover it, plus session tests.
- **The model:**
  - Each donut has two sides. The *underside* cooks in the oil at a rate set by temperature (0 at 250°F, 1× at 350°F, capped at 1.8×).
  - The floating *top* cooks at 5% of that, or 60% while you **hold the grate**. **Flip** swaps the sides.
  - So there are two valid techniques: flip once (classic), or hold the grate (faster, but you have to keep a finger on it).
  - Dropping donuts cools the oil by 5°F each, and topping up mixes in room-temperature oil.
  - Oil soaks up 4% per donut. Below 35% the batch fries unevenly, using a fixed per-slot spread so it's reproducible.
  - All numbers are in `balance.json` → `fry`, and `validateBalance` checks they make sense.
- **Scoring:**
  - **Doneness (60%):** each side is perfect within ±0.1 of golden, falling to 0 at ±0.6.
  - **Time in the ideal 340–360°F range (25%)** and **evenness between donuts (15%)**.
  - *Design fix found by a unit test:* temperature and evenness are now **multiplied by doneness**. Before, a fully burnt batch fried at a perfect temperature still scored 40/100. Now burnt scores ~0, and a perfect fry still scores 100.
- **The fryer lives in the `GameSession`,** ticked by the session clock, so oil heats and donuts keep cooking or burning while you're at another station (Papa's style). Leaving the station releases the grate. A batch belongs to the ticket it was dropped for, even if you select a different ticket mid-fry. Results are stored on `ticket.results.fry`, shown as "fried" on the rail ticket and as the real score on the result card.
- **Rendering:** a white `donut-fry` texture is tinted every frame by `fryColor()` (raw → golden → burnt) for the side facing up. Two meters show underside and top against the golden band. The dial is draggable (±135°, snapping to 5°F) with the ideal arc marked, alongside a thermometer, an oil gauge, and context hints ("oil is cool: turn up the heat"). Text only updates when its value changes.
- **Fry-station header goes over the control panel in landscape** (`StationScene.headerPosition` can be overridden), so it doesn't overlap the vat.
- **Bug fixed: Button press effect.** It used to scale the whole button to 0.96 and back to 1, which wiped out any layout scale, such as the landscape Settings button. It now scales the button's contents.
- **Tests can pause the real-time clock** (`__setClockPaused`) and drive time with `advance()`. Without it, slow software-rendered screenshots let real time pass and the donuts genuinely burned in the test.
- **New `HoldButton`** for press-and-hold controls. It releases on pointer-up anywhere, on sliding off, or when disabled.

## Fry station tuning and prep batches (2026-10-30, Kumar's feedback)

- **Slower and more forgiving:** `secondsPerSide` went from 6 to **9**. The floating top now cooks at **15%** (was 5%), so it visibly creeps along instead of looking stalled. Flip and grate are still much faster. With a textbook flip, the second side needs about 15% less time, because the top already pre-cooked.
- **Drop and pull animations:** a dough depositor (`fry-dispenser`) sits on the vat's corner. On Drop, each ring plops out of the nozzle in turn with a bounce and an oil-splash ring, and the depositor squishes as each one drops. On Pull, donuts lift out: order donuts rise and fade, while prep donuts fly onto the rack. Animation offsets are tweened on plain objects and layered onto the per-frame slot positions, so the allocation-free render loop stays as it was.
- **Prep batches (frying without an order):** if there's no unfried active ticket, Drop fries a **prep batch** of `prepBatchSize` (3). Pulled prep donuts go to a **cooling rack** (capacity `rackCapacity`, 12; any excess is thrown away). Each racked donut keeps its own score, taken from its two sides plus its batch's temperature and evenness. A ticket can **use rack** donuts (oldest first) instead of frying fresh, and its fry score is the average of the donuts it took. The button label says what Drop will do: "Drop #2" or "Prep 3".
- **Bug avoided:** I first named the animation-offset array `anims`, which would have overwritten Phaser's own `scene.anims` animation manager and broken Ethan's wave. TypeScript caught the clash and it's now `donutAnims`. The same kind of clash happened earlier with `TabBar.setActive`, `TabBar.active` and `HoldButton.w`, so watch for Phaser base-class names.

## Fry station v2: one donut at a time (2026-10-30, Kumar's feedback)

- **The vat has 6 slots, and donuts go in one at a time.** Each **Drop** plops one ring into the first free slot. Every donut cooks, scores and burns independently (`FryDonut` in `stations/fry.ts`; batches are gone).
- **Per-donut controls:**
  - **Tap a donut to flip it** (with a quick squash animation).
  - **Drag it onto the rack** to take it out, or **drag it into the trash can** to throw it away and fry a fresh one.
  - **Pull all** and **Hold grate** buttons stay.
  - Phaser's `dragDistanceThreshold` (16 px) separates a tap from a drag.
- **Every fried donut goes to the cooling rack. Orders take theirs from the rack** ("use rack"), so frying is a production line and you can fry ahead. An order's fry score comes from its donuts: average doneness and time-in-range, plus evenness across the set. Each rack donut also has its own score.
- **Burnt donuts take themselves out:** once either side reaches `burntAt` (1.75), the donut is thrown out automatically with a smoke puff and a "burnt!" flash, via a session `burnt` event. Trashed and burnt donuts are counted (`session.trashed`) for the Phase 6 day summary.
- **Low oil runs hot (the knob drifts):** the oil settles at `dial + oilDriftF × (1 − oil level)` (60°F at empty). As donuts soak up oil, the same dial setting gets hotter, so you have to turn it back down. Adding oil reverses this. A hint explains it ("less oil runs hotter: dial it back down").
- **Each donut gets a small two-bar meter (underside / top)** in place of the old shared meters, turning gold when a side is in the golden band.

## Loading screen and customer pacing (2026-10-30)

- **No loading bar when there's nothing to load.** Only the logo is loaded, and that happens in Boot. If `ASSET_FILES` gains non-boot files later, the bar comes back automatically, with a short 0.6 s minimum so it doesn't flash.
- **Customer pacing** (Kumar: "customer 3 only comes after you served customer 1"): `maxActiveByDay` caps how many customers are in line or waiting at once (2 on day 1, up to 4). After each serve, the next arrival is pushed at least `afterServeSec` (2–7 s, random) later. The spawn check now counts customers with plain loops instead of `filter`, because it runs every frame while someone is due.

## Phase 4: Glaze station (2026-10-30)

- **The logic is `src/stations/glaze.ts`,** pure with 16 unit tests plus session tests. Coordinates are normalised to the donut square (centre 0,0, edges ±1), using the same ring geometry as the art (`ringRadius` 0.65, which matches `donut-fry`).
- **Steps per order (`glazeSteps`):** each donut gets its **base coat** (a *dip* glaze painted over the ring, or a *dust* for beignet's powdered sugar), then a **drizzle** if the flavour has one. Strawberry and cookie butter get the white icing, from the A-frame photo. The menu data drives all of it.
- **Painting follows CLAUDE.md:** pick a glaze bowl, then drag your finger. A `PaintMask` grid (48×48) tracks coverage incrementally as each stroke stamps discs. Dip and dust use wide brushes; drizzle uses a thin one along three dashed guide stripes.
- **Scoring per layer:** `min(coverage / goodCoverage, 1) × (1 − min(spill / spillZeroAt, 1))`, × 0.3 for the wrong glaze. The order's glaze score is the average of its layers.
  - **Spill is measured against the target's size, not against total paint.** The first version measured spill as a share of what you'd painted, so scrubbing the whole board still scored about 42%. Measured runs: careful 0.04, sloppy 0.27, scrub-everything 0.75. With `spillZeroAt` 0.6 that gives about 93, 55 and 0.
  - The drizzle brush went from 0.05 to 0.07, because tracing the guides perfectly only covered 61% of the stripes at 0.05.
  - The drizzle's allowed area includes the donut's hole, since icing stripes cross it. Painting off the stripes or off the donut counts as spill.
- **The job lives in the session (`GlazeJob` per ticket)** and keeps every stroke, so leaving mid-donut and coming back redraws exactly what you painted. Switching glaze after painting wipes that layer (no mixing). The ticket needs fried donuts first; the station offers **grab from rack**.
- **Rendering:**
  - Strokes are drawn onto a 420 px `CanvasTexture`, which is uploaded at most once per frame however many pointer events arrive.
  - Dust is drawn as deterministic speckles, so redraws match.
  - Ball outlines and a little gloss are drawn over the paint, so a glazed donut still reads as eight mochi bubbles. Without them, full coverage looked like a flat bagel.
  - The base donut is tinted with that donut's actual fry colour.
- **Rail and result card:** the rail shows "glazed", and the result card shows the glaze score.
- **Test speed:** `drawPath` looks up the canvas once per path, not once per point. Per-point lookups made a careful three-circle paint take over two minutes in software rendering.

## Kitchen production line, glaze cups, ticket view (2026-10-30)

Kumar's feedback after Phase 4, all in one batch.

- **The kitchen is now a production line, not ticket-bound.** Fry → rack (max 6) → glaze → glazed shelf (max 6) → box. Nothing needs a customer first, so you can make donuts ahead of time. "Use rack" and the per-ticket glaze jobs are gone. The superseded parts of the Phase 4 entry above (`GlazeJob` per ticket, "grab from rack", wipe-on-switch) no longer apply.
- **Close lid & serve hands the box over automatically.** `serveActiveTicket()` packs, for each donut on the selected ticket, the best-matching donut on the glazed shelf (by `glazeScoreFor`). It scores fry and glaze from the donuts it packed, scales by found/needed if the shelf was short, and serves the waiting customer. **This auto-pack is temporary.** Phase 5 replaces it with dragging donuts into box slots.
- **Fry station:**
  - The **gold band** is back on each donut's meter, at `1 ± perfectWithin`. Pull when both bars sit in it.
  - The **dial's green arc follows oil drift.** It shows `idealRange − drift`, so when low oil runs hot, the green spot moves to where the dial now needs to be. It is redrawn only when the rounded drift changes.
  - **Single rack donuts can be trashed** by dragging a rack mini to the trash.
  - **The trash can drop target is more generous**: a radius of at least 150 px around the can. It is tested with real CDP touch events, not just the mouse.
  - Rack capacity is 6. The "use rack" button is gone (its text was also too tight to its edges).
- **Glaze station:**
  - The **rack donuts sit on a tray.** Tap one to put it on the board, or drag one to the trash.
  - **Your finger is the glaze cup** (Freezeria-style). The cup follows your finger and tilts while pouring; the sugar sifter wobbles instead. **Drops fall under gravity** and land `fallMs` (140 ms) later, which is when the paint is applied. Drops use a fixed-size ring buffer, so nothing is allocated per frame.
  - **Each glaze has its own cup colour,** and the more detailed glazes have **speckles** (`menu.json` `glazes[].speckles`): cookie bits in cookies & cream, strawberry seeds and pink flecks in strawberry, and so on. Speckles are deterministic, so redraws match.
  - **One base coat, then one optional drizzle.** The base coat comes first; switching back to a layer you started resumes it.
  - **Done** moves the donut to the glazed shelf. **Redo throws the donut away** (Kumar: "redo means I am trashing it"), so you take the next one from the tray. **Shelf donuts can be trashed one at a time.**
- **Ticket view:** double-tap a ticket on the rail (within 500 ms) to open a big ticket that shows each flavour's recipe (glaze + drizzle + toppings) and the box.
  - **It closes only on a fresh tap.** The finger that opened it is still down, and lifting it used to close the view instantly.
  - **The rail no longer rebuilds when you select a ticket**; it just redraws the frames. Rebuilt tap targets only become tappable a frame later, which swallowed the second tap of a double-tap.
- **Phaser 4 was not actually being served until now.** Vite's dependency cache (`node_modules/.vite`) still held Phaser 3.90 from before the upgrade, because the dev server had been running since then. The fix was to stop the server, delete the cache and restart. If a library upgrade seems to have no effect, clear that folder.

## Phase 5: Toppings and Box stations, whole-rack trash, equal pour thickness (2026-10-30)

- **Emptying the whole rack** (Kumar asked for either gesture, so both work). On the Fry station you can **drag the rack itself** (grab the tray or its label, not a donut on it) into the trash, or **double-tap the trash can**. The rack-full hint mentions the double-tap. The double-tap is timed with `performance.now()` at the tap, like the ticket rail, not the scene clock (which only moves once a frame). The browser test sends both taps back to back, because under load each awaited touch event took about 200 ms and stretched the "double" tap past the 500 ms window.
- **Every cup pours the same thickness** (Kumar: the white icing looked thinner). The drizzle brush now equals the dip brush (0.16), and drizzle drops are the same size as glaze drops. Only the sugar shaker, which dusts rather than pours, keeps fine grains. To make a thick drizzle playable:
  - **Drizzle over the hole isn't spill** (`allowedDrizzle`), because icing poured across the hole falls through, like the real thing.
  - The ideal drizzle range moved to 25–65% of the ring. Measured with the thick stream, 3–4 stripes kept on the donut score about 95–100%, and 6–7 stripes (smothered) score about 0–10%.
- **Toppings station** (logic: `stations/toppings.ts`, 11 unit tests):
  - A shelf donut goes on the board. Pick a jar, then **press and drag over the donut to shake**: the jar is held upside down above your finger, and pieces fall and land after `fallMs`. The **cookie butter cookie is a single piece**: one per tap. Done puts the donut back on the shelf; Redo trashes it, the same as glazing.
  - Pieces are scored **per wanted topping**: amount (menu `amount`; too much reaches 0 at max × 2.5) × evenness over the 8 balls (sprinkles only) × (1 − share that fell off / 0.5). Each unwanted topping halves the score. A flavour with no toppings wants none, so those donuts can skip the station.
  - Pieces that land in the hole or off the edge **fall off**: they're animated tumbling away, counted as mess and never drawn on the donut.
  - **New menu fields (game-only):** `style` (sprinkle or piece), `shape` (crumb, loop or biscuit), `size` and `amount` for each topping. The real flavour data is unchanged.
  - **Shaking is frame-rate independent:** a slow frame releases the pieces it owes, up to 4, so slower phones get the same amount.
- **Box station** (logic: `stations/box.ts`, 8 unit tests):
  - Tap a shelf donut to drop it into the next free slot, or drag it onto a specific slot. Tap a boxed donut to take it back out, or drag it to another slot (they swap).
  - The box has the order's box size (trio 3, flight 6, domochi box 12). The **ordered slots are numbered** in the ticket's order (flavours grouped top to bottom); slots past the order are dimmed.
  - **Close lid & serve** needs at least one donut. A kraft lid with the logo flips down, then the box goes to the customer.
  - **Box score:** an ordered slot holding its flavour = 1, that flavour in the wrong slot = 0.5, an empty slot or unknown donut = 0, and each extra donut −25%. A donut's flavour is **identified by its recipe**: base glaze, drizzle and the exact set of toppings.
  - **Quality scores:** each ordered flavour is paired with a boxed donut (a right-slot donut first, then the best by glaze + toppings) to score fry, glaze and toppings, so a misplaced donut costs box points but not quality points too. This replaces the interim auto-pack.
  - The box lives in the session, so you can switch tabs mid-pack. If you select an order with a smaller box, donuts past its end move into free slots (or back to the shelf).
- **One shelf for finished donuts,** shared by Glaze, Toppings and Box. The donut on the toppings board keeps its shelf spot.
- **Shared donut drawing (`ui/donutArt.ts`):** fried ring, glaze layers, toppings and the shelf/box icons are drawn by one module for every station. An icon is redrawn only when its donut changes.
  - **Icons of gone donuts are deleted 3 s later, not at once.** Deleting immediately crashed a trash animation that was still drawing that icon (`sourceSize` of null), which the browser tests caught. Trash animations now also copy the image *before* the donut is trashed, since the shelf slot may show the next donut right after.
- **Placeholder art:** `topping-jar` is now an empty glass jar; each topping's contents are drawn inside it in code. `donut-box` is now the closed lid (plain kraft, logo added in code), because the open box is drawn in code to fit 3, 6 or 12 slots. MANIFEST updated.
- **Result card:** shows real Toppings and Box scores. The weighted order score and tips are still Phase 6.

## Trays, guides, golden cues, no topping cap (2026-10-30)

Kumar's feedback after Phase 5.

- **A steel tray under the board** at the Glaze and Toppings stations (`drawTray`). Portrait boards shrank from 520 to 440 px so the tray fits between the rack/shelf and the instructions.
- **Misses stay on the tray, not on the donut** (Kumar: "the glaze that is off the donut stays drawn on instead of it staying in the tray").
  - Glaze is now **clipped to the 8 balls** everywhere: on the board, in shelf and box icons, and in redraws.
  - Glaze that misses, and topping pieces that land off the ring, are drawn on a **tray "mess" canvas** under the donut (`drawOnTray`, which wipes the part under the ring). The mess stays when the donut leaves, and **fades by about half each time a new donut goes on**, so it never piles up.
  - Toppings that miss used to tumble away and vanish; now they sit on the tray.
- **Guides:**
  - **Glaze:** two dashed loops round the ring for a base coat (about one stream-width apart, so two passes cover the balls), and three dashed stripes for a drizzle, the pattern that scores well with the thick stream. Each shows while its cup is selected, and hides once that layer is done well enough (good coverage, or the drizzle's minimum).
  - **Toppings:** a dashed loop for sprinkles (until the minimum amount is on), and a target on the top ball for the cookie.
- **Golden cues at the fryer:**
  - When the side in the oil turns golden, the donut **hops with a puff of steam**: time to flip, once per side.
  - While it's **ready to pull** (the side in the oil golden and the top at least golden), it keeps **steaming**. "Both sides exactly golden" was too strict: the top keeps cooking a little while it floats, so it can drift just past the band before the second side gets there, and "both golden" might never happen at once.
  - Steam uses a pool of 24 circles.
- **No practical limit on toppings** (Kumar: they stopped after a limit). `maxPieces` went from 160 to 1500, only as a safety cap; too much is already penalised by the amount score. I found no cap on glaze.
- **The pouring/shaking finger is read directly every frame** (`pointer.isDown`, `x`, `y`) instead of through move and up events. If the finger strayed onto the ticket rail or tab bar, those scenes got its events, so the cup or jar froze and could stay stuck pouring. This is the likely cause of "the glaze stops too".
- **Drag or tap:** rack donuts can be dragged onto the glaze board as well as tapped, and the same for shelf donuts onto the toppings board.
- **Tests:** guides and steam are checked with a new `isVisibleNamed` helper, because Graphics objects have no bounds for `findNamed`. The golden cues get their own fry test at a steady temperature: the main fry test turns the dial up, so its donuts overshoot golden.

## Phase 6: scoring, tips, reactions, days; flavours from the shop's photos; slower oil (2026-10-30)

- **The oil heats more slowly** (Kumar): `heatLagPerSec` went from 0.35 to 0.2. The oil closes 20% of the gap to the dial per second, instead of 35%: about 8 s from 300°F to 340°F, and 12 s to settle in range.
- **Flavours match the shop's product photos.** The photos come from the Square store API (`thumbnail` on each product, re-fetchable like the menu); I looked at all six.
  - **Strawberry:** salmon-pink glaze with dark seeds, and white stripes over the top-right half.
  - **Chocolate hazelnut:** glossy caramel-brown glaze, and **it has the white drizzle too** (the photo shows it, so the menu now does). Same half as strawberry.
  - **Cookie butter:** light tan glaze, stripes over the left half, and **the Biscoff-style cookie is big**, across the top of the ring (size 0.7, about 60% of the donut's width, as in the photo).
  - **Cookies & cream:** plain white glaze; the crumbs are only the topping. Fruity cereal: white glaze with **flat cereal flakes** (new `flake` shape), not rings.
  - Beignet already matched (all powdered sugar).
- **Drizzle patterns are data** (`flavors[].drizzlePattern`: stripes in donut coordinates, a game-only field).
  - A drizzle on a patterned flavour is scored **like a coat over its stripes**: coverage of the stripes / `patternGoodCoverage` (0.7) × (1 − paint off them / `patternSpillZeroAt` (1.5)).
  - Measured: following the stripes scores 100; a slightly sloppy follow still scores 100; generic stripes across score 36; the wrong half scores 5; smothering scores 0.
  - The glaze station draws **that flavour's stripes as the guide**, picked from the base glaze on the board (strawberry glaze shows strawberry's stripes, and so on). The readout says "drizzle: N% of the stripes".
  - The cookie guide is a dashed outline of the cookie across the top of the ring.
- **Order score** (`systems/score.ts`, all numbers in `balance.json` `scoring`):
  - Weighted average: fry 30%, glaze 25%, toppings 25%, box 10%, wait 10% (CLAUDE.md).
  - **Wait is a soft curve per customer:** full marks until 60% of their `patienceSec`, then easing (cosine) to 0 at 3× their patience. That's about 1 min of grace and 5 min to zero for a 100 s customer.
  - **Reaction tiers:** great ≥ 90, good ≥ 70, okay ≥ 45, otherwise bad. The customer's thank-you line comes from that tier in `customers.json`.
  - **Tip** = $0.75 × donuts × curve(score). The curve is [score, multiplier] points with straight lines between: 0→0, 40→0.2, 70→0.7, 90→1, 100→1.25.
- **Sales:** a full box sells at the box price (trio $11, flight $20, domochi box $30), otherwise $4 per donut. These are the real shop prices.
- **Result card:** each station's score, the wait score (with seconds), the order score with a word ("amazing!", "nice work", "not bad", "needs work"), the tip and the sale.
- **End of day:** after the last customer's card, the **day summary** opens:
  - customers served, average and best order, reactions, donuts thrown away, sales and tips;
  - today's take and the running total;
  - **what unlocks tomorrow** (flavours by `unlockDay`).
  - **Start day N+1** banks the money and saves (`day`, `money`, plus new `served` and `bestOrder` stats), then restarts the main scenes on a fresh session. Reloading continues on the saved day.
- **The ticket rail** shows Day, served/total and money (banked plus today's sales and tips).
- **Kumar's ideas for later** (opening/closing tasks with a Dough station, and event invites for pop-up booth days) are recorded under Future ideas in CLAUDE.md.

## Phase 7: tutorial, sound, loading screen, web build (2026-10-30)

- **The tutorial coaches over the real game,** instead of being a separate screen. On first launch (and from Settings → Replay tutorial) the day starts as a **scripted training day**: one customer, who orders a cookies & cream (`tutorial.json` `order`), because it goes through every station.
  - Ethan's bubble says what to do, and a **pointing hand and a pink ring** show where. The hand finds things by the same object names the tests use.
  - Each step moves on only when you've done it.
  - **Steps are worked out from the game's state every frame,** not ticked off: where the order is (ticket → in the oil → flipped → rack → glazing → shelf → toppings → box → served), which cup or jar is picked, and how much glaze or how many crumbs are on.
    - **It can't get stuck.** If the donut burns, it's back to "drop a donut". If you're at the wrong station, Ethan points at the right tab first.
  - The panel sits away from the target: at the top if the target is low, and vice versa.
  - **Skip tutorial** is always there. Finishing or skipping saves `tutorialDone` and opens the real day.
  - **The training customer doesn't count:** there's no day summary for it, and day 1 starts fresh.
  - The lines are data (`tutorial.json`), in Ethan's voice and the brand's lowercase.
  - New placeholder texture: `pointer-hand`.
- **Sound is synthesised in code** (`systems/AudioService.ts`, Web Audio), so there are no audio files and nothing to license.
  - **Effects:** tap, plop + sizzle (drop), flip, ding (golden), pour, shake, trash, burn, lid, cha-ching (tip), a chime when a customer walks up, and a fanfare for the day summary.
  - **Music:** a soft lo-fi loop (Cmaj7–Am7–Fmaj7–G7 with a pentatonic melody) at 5% volume.
  - **Unlocking:** browsers only allow sound after a tap, so "Tap to start" unlocks it.
  - **Pausing:** everything pauses when the page is hidden.
  - **Settings:** gains **Sound** and **Music** switches, which are saved.
  - **Tests:** unit-tested with a fake AudioContext.
- **Loading screen polish:** the logo pops in and bobs; a dozen donuts (every flavour) drift up behind everything; "best with sound on"; and a footer with the handle and website.
- **Web build and Netlify:**
  - **`netlify.toml`:** builds with `npm run build` on Node 24 and publishes `dist/`.
  - **Caching:** Vite's hashed bundle goes in `build/`, cached forever. Everything else, including the art in `assets/`, is re-checked each visit, so an art drop shows up straight away.
  - **Paths:** the build uses relative paths (`base: './'`), so it also works under a path like `/games` or inside Capacitor later.
  - **Size:** one bundle of about 400 KB gzipped, mostly Phaser. The chunk-size warning was raised rather than splitting it.
  - **Page tags:** description and share tags (og/twitter), a favicon, an iPhone home-screen icon, and a **web app manifest**, so "Add to Home Screen" gives a proper icon and full-screen play.
  - **Icons:** made by `npm run icons` from the logo on cream (see MANIFEST.md).
  - **Production check:** I tested the production build (`vite preview`) in Chromium on phone and desktop sizes: no errors, and the tutorial starts over the lobby.
- **The site address:** Netlify's free `*.netlify.app` address for now. A custom subdomain (for example `games.domochitreats.com`) can be added later in Netlify plus one DNS record, with no code changes.

## GitHub Pages instead of Netlify; pick the box; gift donuts (2026-10-30)

- **Hosting moved to GitHub Pages.** On the free plan, Netlify injected its own script into every page (`/.netlify/scripts/hud?variant=public`), which drew a Netlify panel over the station tab bar. There was no setting to turn it off, and hiding it with code would be fragile and likely against Netlify's terms.
  - At Kumar's request, the Netlify site was **deleted**, along with `netlify.toml`.
  - **`.github/workflows/pages.yml`** now runs on every push to `main`: typecheck, unit tests, build, then publish `dist/` to Pages. The repo (`DarshanKumar2004/domochi`) was already public.
  - **One-time setup:** repo Settings → Pages → Source: "GitHub Actions".
  - The address is `https://darshankumar2004.github.io/domochi/`. The relative build paths (`base: './'`) work under that `/domochi/` path unchanged.
  - Pages can't set cache headers; the hashed bundle in `build/` is still safe to cache by name.
- **You pick the box at the Box station** (Kumar: "1, 3, or 6").
  - **The box row:** a row of buttons sits above the box (**1 single · 3 trio · 6 flight**). The dozen only appears for orders bigger than 6. The ticket still shows the box the customer would like.
  - **The single:** a new "single" box (one donut at the shop's single price, $4) was added to `menu.json`, as a game addition, so 1-donut orders get a single by default.
  - **Box too small:** if the chosen box can't hold the order, the instruction turns red and says so, and missing donuts score 0 as before.
  - **Box too big:** the spare slots show a **+**, for gifts.
- **Gift donuts** (Kumar: "when you give them an extra donut or a few they like you more and leave more tip").
  - **What counts:** a real menu flavour boxed beyond the order is a **gift**, not a mistake. A donut that isn't any flavour still costs box points.
  - **The effect:** gifts don't change the order score, but the customer's reaction goes **up one level**, they say a gift line (`customers.json` `giftLines`), and they tip **$0.75 more per gift** (up to 3).
  - **Where it shows:** the result card shows the gift part of the tip, and the day summary counts donuts gifted.
  - **The trade-off:** the sale price doesn't change, so a gift costs you a donut's worth of work for goodwill and tips.
  - **Tuning:** the numbers are in `balance.json` `scoring.gift`.
- **Fix:** the result card's tip line had lost its "$" signs. My edit script ran the text through a JavaScript `replace`, where `$$` in the replacement means a single `$`. Future scripted edits should avoid `$` in replacement strings, or use a function.

## The full day: dough, morning pickups, closing clean-up, pop-up events; fry indicators; mochi the guide (2026-10-31)

Kumar's ideas from the earlier sessions ("opening and closing tasks", "deliveries", "event invites"), plus fry and tutorial feedback.

- **A day has phases** (`GameSession.phase`; on for real days through `dayFlow`, off for the tutorial and most tests):
  - **prep:** the window shows CLOSED and no walk-ups come. Make dough, and work on any morning pickups. **Open the window** in the Lobby when ready; if there's no dough yet it asks twice.
  - **open:** walk-ups arrive as before.
  - **closing:** after the last order goes out, the Lobby shows a clean-up checklist (wipe the glaze tray, wipe the toppings tray, filter the oil) and **Close up**, or **Close anyway**.
  - **closed:** the day summary. A tidy close earns a **$2 tidy bonus**, shown on the summary.
- **Dough station (new tab; logic in `stations/dough.ts`):**
  - **Making a batch:** tap the ingredient canisters to scoop the recipe into the bowl (3 rice flour, 1 tapioca starch, 1 sugar, 2 milk, 1 egg, which is game design, all in `balance.json` `dough`). Then **stir** by dragging round the bowl until it's smooth (5 turns; the lumps fade and a swirl turns), and tip it **into the tub**.
  - **The tub:** a batch is 12 donuts, and the tub holds 24. Each donut dropped in the fryer uses one, and **Drop is off without dough**, with a hint pointing to the Dough station. You make a second batch whenever you run low.
  - **Quality:** scoops off the recipe lower the batch's quality, and a donut's fry score is × (1 − 0.3 × (1 − quality)). The tub keeps a mixed quality when batches are added.
- **Clean-up:**
  - **Trays:** glaze and topping pieces that miss the donut add to the tray's **mess**, which fades like the art. With no donut on the board, press and drag to **scrub the tray with a sponge** (`ui/TrayWiper.ts`). It wipes the art and the count together, faster the messier the tray is, and clears it completely once it's clean.
  - **Oil:** every donut fried dirties the oil a little, and the vat visibly darkens. When the vat is empty and the oil is dirty, **Filter oil** replaces Pull all.
- **Morning pickups** (`balance.json` `deliveries`, by day: none on day 1, then 1–2 orders of 4–6):
  - **Who orders:** new `customers.json` types with `"delivery": true`, the **campus coffee shop** and the **delivery app**. The names are generic on purpose, since a real café needs to OK being named.
  - **When:** their tickets are on the rail from the start of the day, tagged **to go**, and the big ticket says "pickup".
  - **The deadline:** the Lobby lists them with a courier countdown (their patience: 6 and 5 minutes).
  - **No crowding:** they never stand in line and don't take up a walk-up spot.
  - **Serving:** the same as any order ("Order #n picked up!"). The summary counts them.
- **Event invites and pop-up days** (`data/events.json`):
  - **The invite:** after a served walk-up, there's a chance of an invite: 30% for a great reaction, 15% good, 4% okay, plus 10% if you gave a gift. It's at most one a day, and never on a pop-up day.
  - **The card:** an **invite card** quotes them ("we're tailgating before the game tomorrow…").
  - **Saying yes:** it books **tomorrow** as a pop-up day (saved as `event: { id, day }`).
  - **The pop-up day:** the Lobby shows a striped **pop-up booth** with the logo and event name instead of the trailer. It has more customers (×1.5–2), arriving faster, tips ×1.2–2, and no morning pickups. The summary says "what a pop-up at …!".
  - **The events:** a birthday party, a campus tailgate, an office party, a farmers market, a wedding reception. They're generic; a real event or venue needs their OK.
- **Fry feedback (Kumar):**
  - **The grate:** with it held down, **both sides fry at the same rate** (`topFactorGrate` went from 0.6 to 1).
  - **Bar colours:** each side's bar is **red (raw) → orange (nearly) → green (perfect) → dark red (overdone)**. The target band is green too.
  - **Labels:** the bars are labelled **bottom** and **top**.
  - **Two tones:** each donut shows its **underside as a rim of its own colour** below it, so a flip visibly swaps the cooked and uncooked sides.
- **Tutorial (Kumar: "it covers up some vital clicking places… maybe instead of Ethan it's a mochi donut"):**
  - **The guide:** it's now **mochi**, a strawberry-glazed pon de ring with a face (new placeholder `mascot`), who bobs and squishes. It introduces itself and credits Ethan as domochi's founder.
  - **Smaller:** the bubble is smaller (36 px text).
  - **Out of the way:** the panel picks **top or bottom, whichever doesn't cover the target and the hand beside it**. If both would, it takes whichever covers less.
- **New placeholder art:** `mascot`, `mixing-bowl`, `ingredient-bin`, `sponge`, `popup-booth` (anchors in `BOOTH_SPEC`) and `icon-dough`. MANIFEST updated.
- **Tests:**
  - **Unit:** dough, phases, the tub, clean-up, pickups, invites and pop-up days (`dayflow.test.ts`).
  - **Browser:** `dayflow.spec.ts` makes dough by hand, opens the window, closes up after scrubbing both trays and filtering the oil, and checks the pickups, the invite card and the booth.
  - **Older specs:** they use `openDay()`, which makes dough through the real API and opens the window.

## Two-donut glaze tray, re-glazing, thin icing, dough yield, locked items, dough in the tutorial, new lobby (2026-10-31)

Kumar's next batch of feedback.

- **The tutorial teaches the Dough station.** The training day now tracks dough (`trackDough`), so after you take the order, mochi points at each ingredient canister in turn (the next one still short of the recipe), then the bowl to stir, then Into the tub, and only then at the fryer.
- **Dough yield follows the ingredients.**
  - A recipe makes **8 donuts** (was 12). The ingredient you have least of, relative to the recipe, sets the yield: just milk makes 0, and a double recipe makes 16.
  - Quality compares against the recipe's *proportions* at that size, so a clean double batch is perfect.
  - The readout shows "makes N donuts", "needs: egg", or "too much for the tub!". **Into the tub** is off if it would make nothing or doesn't fit.
- **Thin icing again** (Kumar preferred it after all): the drizzle brush is back to 0.045, and the drops are thin.
  - The flavour stripe patterns are redrawn as **11 thin parallel stripes** over the right half for strawberry and chocolate hazelnut, and over the left half for cookie butter. That's closer to the photos.
  - The guides draw them all, and following them still scores 100%.
- **The white glazes are now distinct:**
  - **white icing** is pure white with a soft shadow edge, so it reads as piped;
  - **cookies & cream glaze** is off-white with light grey crumb flecks;
  - **sweet glaze** (fruity cereal) is a warm vanilla cream.
- **Two donuts on the glaze tray at once** (`balance.json` `glaze.boards`).
  - The session holds `glazeBoards` (the old `glazeWork` is the first one). A drop lands on whichever donut is nearest. **Done** sends every glazed donut to the shelf. **Redo** trashes the one you last placed or poured on, which gets a pink ring when there are two.
  - Each spot has its own paint, spill art and guides, and the sponge wipes them all.
- **Re-glazing:** tap or drag a donut on the glazed shelf back onto the tray to add more. It keeps its layers and any toppings (`GameSession.reglaze`, and `GlazeWork`'s `from`).
- **Locked items show as dotted outlines** with "day N": glaze cups (chocolate hazelnut day 2, sweet day 3, cookie butter day 4, powdered sugar day 5) and toppings jars (fruity cereal day 3, cookie butter cookie day 4).
- **Fry header:** in portrait, the dough dispenser moved to the vat's right corner, and the subtitle is shorter ("rack 0/6 · 1 frying · dough 15"), so nothing covers it.
- **Box station:** with no order selected, an empty trio stays on the counter (dimmed) instead of the space going blank.
- **A new lobby** (`ui/LobbyScenery.ts`):
  - **The sky follows the day:** peach sunrise during prep, blue while open, purple-orange sunset at closing. The sun moves with it.
  - **Backdrop:** drifting clouds, and **live oaks with Spanish moss** on each side.
  - **String lights:** bistro lights draped across the top, glowing warmer at sunrise and sunset.
  - **The lot:** a grass verge and sidewalk, the concrete lot with parking lines and oil spots, and a shadow under the trailer.
  - **The patio:** waiting customers stand on a **wooden patio with a picnic table and a pink umbrella**, with a chalkboard "waiting patio" sign.
  - **Planter:** flowers in a planter by the A-frame.
  - **Art:** all placeholder art under the new keys `cloud`, `oak-tree`, `patio-table` and `planter` (MANIFEST updated).

## The business side: a 5-minute day, supplies, the store, pay by quality, waste; small fixes (2026-10-31)

Kumar's "almost ready for launch" batch.

- **Days run on a clock.** With the full day, the window is open for `day.lengthSec` (300 s). Walk-ups keep coming until then.
  - When time's up, the sign flips to CLOSED, anyone still in line goes home, and the orders already taken still get made.
  - If you can't finish them (out of dough, say), **Send them home** sends them off unpaid.
  - Closing starts once everyone's done. Days never run out: there's no last day. The rail shows the time left, in pink for the last 30 s.
  - `customersPerDay` now only applies without the full day (unit tests).
- **Supplies are counted** (`balance.json` `supplies`, saved as `save.stock`):
  - Each **scoop** uses an ingredient. Each order served uses its **box**; out of that size, it goes in a **napkin** for half the box score. Each **+ oil** uses a jug.
  - A new game starts with `supplies.start`. The tutorial and unit tests don't count supplies.
  - The stations show what's left: under each canister, on each box size, and on the oil button.
- **The supply store** (StoreScene) comes after the day summary.
  - It sells packs of everything, with prices that swing up to ±25% from day to day. The swing is deterministic per day and item (`priceOn`), with ▲/▼ marks.
  - It also sells **glaze guides**, bought once (`save.guides`): the base coat loops, plus each flavour's drizzle stripes. The guides no longer come free. The tutorial (and any day that doesn't count supplies) still shows them all.
  - Spending comes out of banked cash.
- **Paid by quality** (`balance.json` `payment`):
  - great/good pay full price;
  - okay pays 85%;
  - bad pays half and leaves no tip;
  - below 20 they don't pay at all and take up to $2 back out of today's tip jar.
  - The serve card says which.
- **Waste and profit in the day summary.** "Wasted" counts donuts thrown away, plus everything made and unsold at closing: rack, shelf, trays, box, fryer, and the dough left in the tub or bowl. Dough doesn't keep overnight. It's valued at the dough's ingredient cost per donut.
  - The summary shows the waste, the other supplies used, and **profit = sales + tips + clean-up bonus − supplies used**.
  - **Why profit and not cash:** supplies are paid for at the store. Taking the waste off the cash as well would charge for it twice. So the cash banked is sales + tips + bonus, and the waste shows up in the profit.
- **Ethan's friends** (`customers.json` `friends`). While the window's open, every `friendCheckSec` there's a `friendChance` that a friend drops off a pack of whatever you're lowest on (below one pack), at most `friendsPerDay`.
  - They walk up with a crate and say a line, and a note appears under the rail. The names are generic.
- **End-of-day cleaning** stays as built: wipe both trays and filter the oil, with the tidy bonus.
- **Glazing:**
  - Any glaze can go over another; the one on top counts (`topLayers`). A drizzle counts only if it's above the top base coat.
  - Pouring on an empty tray spot splatters it.
  - Tap the selected cup again to put it down; with no cup in hand, a finger on the tray wipes it.
- **Small fixes:**
  - Music picks up again on the next tap if the phone paused the audio. Phaser's own (unused) audio context is off.
  - The invite card is taller, with room around its buttons.
  - The tutorial bubble's tail points sideways at mochi, not down at the tab bar.
  - The trailer's OPEN/CLOSED sign flips over when it changes. A stabiliser jack now stands under the trailer's right end.
  - The rail's text no longer runs under the tickets.

## mochi's journal, regulars, weather, share your donut; glaze and friend fixes (2026-10-31)

- **mochi's journal** (Kumar loved the idea; `JournalScene`, `systems/journal.ts`, `data/journal.json`). Tap mochi on the lot (the badge says "new sticker!") to open a notebook with two tabs:
  - **pages:** one per finished day (weather, event, served, best order, profit), mochi's note picked by how the day went, a polaroid doodle of the day's best donut, and the stickers earned that day.
  - **stickers:** 20 to collect, 4 of them secret (shown as "?" until earned). Tap one to see how to earn it.
  - **How it works:** the sticker checks live in `StickerTracker` (by id); the names, descriptions, colours and glyphs are in the data. Earned stickers are saved straight away and announced with a note under the rail. The tutorial day doesn't count.
  - **Save size:** the doodles are 160 px PNG data URLs. Only the last 60 pages keep theirs; older pages keep their words.
- **Regulars** (`customers.json` `regulars`, `balance.json` `regulars`):
  - **Who:** Jade (2 strawberry), Mr. Thibodeaux (3 cookies & cream), Ms. Vo (2 chocolate hazelnut + strawberry) and Remy (fruity cereal + beignet). The names are made up.
  - **When they come:** about 1 walk-up in 4, each at most once a day, and only once their whole usual is on the menu.
  - **Friendship** (0–5, saved) goes up with a good or great order and down with a bad one. The serve card shows hearts.
  - **"The usual":** from 3, they skip ordering. They say "the usual!" and the order goes straight on the rail. Regulars wear name tags in the lot.
- **Weather** (`balance.json` `weather`). Each day gets the same weather every time you play it, and day 1 is always sunny.
  - **Rainy:** fewer walk-ups, 2 extra delivery orders, more patience and +20% tips. Grey sky and falling rain.
  - **Hot:** the oil heats 1.6× faster, less patience, +10% tips. A big sun.
  - **Cloudy:** a little quieter and more patient.
  - The morning checklist says what to expect.
- **Share your donut** (`ui/share.ts`). On the serve card, **Share** makes a 1080×1350 picture of the best donut in the box, with the logo, the score, @domochi.treats and domochitreats.com.
  - Phones that can share pictures get their share sheet; anything else downloads the PNG.
  - There's no QR code, because that would need a library (ask first). The Android app will want Capacitor's Share plugin (Phase 8, ask first).
- **Fixes:**
  - **Glaze on an empty tray spot:** it now splatters the tray across the whole spot. The mess canvas was cutting out the ring shape as if a donut sat there.
  - **No cup in hand, touching a donut:** says "pick a cup first!" instead of starting the sponge, which looked like some unknown topping. Wiping only starts on the bare tray, with a "scrubbing the tray clean" note.
  - **Ethan's friends** wait at the window with their message until you tap them, then wave off. At a station, their note stays until tapped.
- **For another day** (Kumar): high-score coupon codes, and seasonal menus that match the real shop.

## A month of play: supplies for every flavour, a scrollable store, saving mid-day, a home screen (2026-11-01)

- **New flavours need their glaze and toppings** (Kumar chose this). Each glaze and topping is a supply: a serving is used each time it goes on a donut.
  - Cups and jars show the servings left. At 0 they're dimmed and say "out of …! buy more at the store".
  - Day-1 flavours start stocked. Later ones come into the store on their flavour's unlock day.
- **Slower unlocks**, so the menu lasts a month: chocolate hazelnut day 4, fruity cereal day 8, cookie butter day 12, beignet day 16.
- **The store scrolls** (drag, or the mouse wheel), in sections: dough & oil, boxes, glazes & toppings, guides.
  - Items not in yet are greyed out with "day N".
  - mochi's tip names what's short: a day's needs first, then anything under one pack.
- **The day is saved as you go** (`GameSession.snapshot/restore`, `save.inProgress`):
  - When: every 5 s, when the page hides, and on Settings → Home.
  - What: the clock, customers and orders, money earned, supplies, the dough tub and friendships.
  - Lost: donuts mid-kitchen can't be saved, so they count as thrown away.
- **Close early** (two taps), any time while open.
- **Friend drop-offs and invites start on day 3.** They're also rarer: friends 20% a minute, invites 8% after a great order.
- **Pickups come from stand-in coffee shops** (Kumar: familiar-sounding but not real): Campus Brews and Alley Cat Coffee.
- **Home screen** (the first screen; Settings → Home screen goes back to it):
  - **About us** links to domochitreats.com and says the places in the game are made up.
  - **Suggest a flavor** and **Let Ethan know** are small HTML forms over the game, since the canvas can't do text boxes.
  - **Sending:** notes are kept on the device and sent as one daily report at the end of each day (and at start-up). The endpoint is `brand.json` `feedbackEndpoint`, which is empty (TODO-BRAND). Kumar picks the service (Formspree, EmailJS or a small function) and Ethan's address; until then, notes wait.
- **Fixes:**
  - Pointers stuck after leaving the page are released.
  - The audio is rebuilt if the phone closed it.
  - The toppings sponge only comes out with no jar in hand.
  - Scrubbing has its own sound.
  - Close early sits above the tab bar on short phones.
- **Two donuts on the toppings tray** (`balance.json` `toppings.boards`), like the glaze tray.
  - Each spot has its own art, mess and guides, and pieces land on the spot under them.
  - Press on a donut to work on it; a pink ring marks the active one when there are two.
  - **Redo** trashes the active donut. **Done** sends every donut on the tray to the shelf.
- **A sponge to pick up:** a messy tray shows a sponge on its corner ("tap to clean"). Picking it up puts down your cup or jar; then scrub. Cleaning the tray, or picking a cup or jar, puts it back.
- **Pop-up days are downtown:** a brick storefront (the made-up "Gator & Co.") with an awning and shop windows behind the booth, instead of the oaks.

## Free rein: specials, streaks, patience hearts, day stars, daily goals (2026-11-01)

Kumar gave full creative say ("have fun!"). Everything here is data-tuned in `balance.json`.

- **Special of the day** (`special`). One flavour on today's menu, the same each time you play that day.
  - It sells for +$0.50, and customers favour it like one of their favourites.
  - It's chalked on a board hanging on the trailer, and named on the morning checklist.
  - Sticker: "chalkboard hit" for selling 5 in a day.
- **Hot streak** (`streak`). Each good or great order in a row after the first adds +10% to tips, up to +50%. An okay or bad order ends the run.
  - A note under the rail cheers at ×2, ×3, ×6 and so on, and the summary shows the best streak.
  - Sticker: "on a roll" at 5.
- **Patience hearts.** Waiting customers' tags show ♥♥♥, emptying as their wait score falls; the tag turns red at 0. It updates every second.
- **Day stars.** The summary opens with 1–3 stars, popping in one by one: 2 for an average of 65+, 3 for 85+ with 5 or more served. They're stamped on the journal page.
- **Daily goals** (`goals`, from day 2). One small challenge a day, with targets that grow with the day: serve N, N great reactions, sell N specials, $N in tips, or close up spotless.
  - It's on the morning checklist, and a note cheers when you meet it.
  - It pays $3, banked with the day; the summary row says done or missed.
- **Layout:**
  - The summary card is taller and spaced so the extra rows don't crowd it.
  - The portrait morning checklist moved down so it clears mochi's journal button.

## Kumar's month-long pacing, gated closing, mochi's shopping plan, email relay, decorations, crew, coupons (2026-11-01)

- **Pacing** (Kumar: "this slow/fast, not strict"):
  - **New flavours:** chocolate hazelnut day 3, fruity cereal day 17, cookie butter day 38, beignet day 62. Each flavour's glaze and toppings are sold from that day.
  - **Features:** daily goals from day 5, the special of the day from day 10, Ethan's friends from day 20, event invites from day 30, decorations from day 45, coupons from day 50 (off; see below), hiring a crew from day 75.
  - **Signposts:** the day summary's "what's new" line says what's coming next, e.g. "next up on day 3: chocolate hazelnut!".
- **Close early only when out of baking materials.** That means the tub is empty, nothing is in the bowl, and an ingredient is at 0. Then mochi's note in the lobby says what ran out and to restock. This stops skipping days without playing them.
- **mochi's shopping plan** (`shopNeeds` / `shoppingPlan` in `systems/supplies.ts`):
  - **Musts:** dough for 3 batches, trio and single boxes, oil.
  - **Shoulds:** glazes and toppings for today's menu, flight boxes.
  - **Nice-to-haves:** anything else running low.
  - It's filled from the cash you have, musts first. A little mochi sits on each pick (pink = must, gold = should, grey = nice) with how many packs to buy, or "need!" when you can't afford it. The tip line says what to get first and what's short when money's tight. "low!" on a tile now means mochi wants more of it.
- **Email** (Kumar chose Resend). The key must not be in the public repo or site, and Resend also blocks calls straight from a browser.
  - So `relay/` is a ~60-line Cloudflare Worker that holds the key and the recipient as Worker secrets. It accepts reports only from the game's own pages and emails them.
  - **Tested locally:** a real report reached Kumar's inbox. Other sites get a 403, and empty reports get a 400.
  - **To go live:** Kumar deploys it (`relay/README.md`, about 5 minutes) and puts the Worker URL in `brand.json` `feedbackEndpoint`.
- **Decorations** (`balance.decor`, from day 45). Each is bought once, shows on the lot, and gives a small perk:
  - **Flower boxes and a second picnic table:** a little more patience.
  - **Pink string lights and a neon "mochi donuts" sign:** a little more in tips.
  - **A mochi mural on the deck:** a few more walk-ups.
- **Your crew** (`balance.staff`, `systems/staff.ts`, from day 75: Mai, then Theo at 90 and Rosa at 110):
  - **What they earn:** while you're away, cap × (1 − ½^(hours / 6)), where each hire adds to the cap. It levels off rather than growing in a straight line, and anything under half an hour counts for nothing.
  - **When you come back:** "while you were away, Mai sold $X" (tap to close), and the money is banked.
- **Coupons for the real truck** (`brand.json` `coupons`, `systems/coupons.ts`): from day 50, a three-star day earns a code (DMC-<day>-<4 letters>, steady per day and phone). It shows on the summary and the journal page.
  - **Built but OFF** until Ethan agrees on the offer, the daily cap, and how staff check a code (TODO-BRAND).
- **Crew renamed, and the player joins** (Kumar, 2026-11-01): Geo (day 75), then Bruce (day 90), and the last place is the player's (day 110, free).
  - mochi asks "hey, what's your name? would you like to join the team? Ethan would love to have you!" in an HTML card over the game. The name is saved as `playerName`, and the "while you were away" note names everyone ("Geo, Bruce and Kim sold $X").
- **Coupons switched ON** (Kumar, 2026-11-01). On a three-star day from day 50, the summary shows the code and a green banner: "screenshot this and bring it to the domochi trailer to redeem your reward!" The journal page keeps the code too.
  - **Still TODO-BRAND:** Ethan decides the reward and any daily cap. There's no server check, so staff go by the screenshot (the code has the day in it).
- **Feedback relay is live** (Kumar deployed it on 2026-11-01): `https://domochi-feedback.kumardarshan425.workers.dev`, now set as `brand.json` `feedbackEndpoint`.
  - **Tested live:** a real note reached Kumar's inbox, another site's request got a 403, and the preflight from the GitHub Pages site is allowed.
  - **Only the built game sends** (`import.meta.env.PROD`). The dev server and the Playwright runs keep notes queued, so tests never email anyone.
  - **Switching to Ethan:** `npx wrangler secret put FEEDBACK_TO`. Resend first needs domochitreats.com verified before it will deliver to anyone other than the account owner.
- **Notes are emailed the moment the player taps Send** (Kumar, 2026-11-01), not at the end of the day. If a send fails (offline, say), the note stays queued and is retried at the end of the day and at start-up. Sends run one at a time, and only the notes that went out are cleared, so two quick notes are never lost or sent twice.
  - **Later idea (Kumar):** once lots of people play, switch to one end-of-day email with everyone's notes. That digest would have to be collected on the relay's side, for example in Cloudflare KV with a daily cron trigger.
- **Batch from Kumar's notes (2026-11-01):**
  - **A smaller start:** the beignet (the powdered sugar one) is the only flavour on day 1. Then strawberry (day 3), cookies & cream (17), chocolate hazelnut (30), fruity cereal (45) and cookie butter (62). Each glaze and topping supply unlocks with the first flavour that uses it, and a new game is stocked for the beignet only. The Toppings station isn't used until cookies & cream arrives, which Kumar said is fine. The tutorial still walks through every station with a cookies & cream order, so toppings are taught up front.
  - **No unlock days shown:** locked store tiles say "coming soon", and the summary says "coming soon: strawberry!" instead of the day number.
  - **Weather is easier to see:** an icon next to the day on the ticket rail (☀️ ☁️ 🌧️ 🔥), a note at the start of each morning, stronger skies for cloudy and hot days, and set weather for days 2, 4 and 6 (`weather.fixedDays`), so every kind turns up in the first week. Before this, rain didn't come until day 19.
  - **A friend's store run** (`balance.supplies.errand`, `errandFor` in `systems/supplies.ts`, `ErrandScene`). After about 4 s out of baking materials (morning or open hours), one of Ethan's friends swings by, at most once a day, from day 1, so nobody gets stuck for good.
    - **If you can pay:** they offer to fetch dough for 2 batches. You pay the store's price plus a fee (25%, at least $3), or say no thanks.
    - **If you can't:** they bring one batch's worth, free.
    - **The money:** what you paid comes off the day's cash. The fee alone counts against profit, because the supplies count once they're used, the same as store purchases.
  - **Ethan redrawn** in the logo's comic style: ink outlines, hair and ears, brows, eyes with a shine, rosy cheeks, an open smile, the ring on his pink cap and on his apron pocket, and a waving hand with fingers. His real look is still TODO-BRAND.
  - **Landscape lot:** the wide middle, between the A-frame and the patio, now has two smaller oaks, a hedge, a street lamp and a bench along the verge. It's hidden in portrait and on downtown pop-up days.
  - **The tutorial keeps every cup and jar out,** since it teaches with a cookies & cream order and that flavour is now locked on day 1. Locked cups and jars elsewhere say "soon" instead of an unlock day.
- **Phase 8, the Android app** (2026-11-01). Ethan OK'd launching the app, and Kumar is publishing it on his personal Google Play account.
  - **Libraries** (Kumar approved "whatever you need"): Capacitor 8 core, CLI and Android, plus the plugins app (back button), status-bar (full screen), screen-orientation, share and filesystem (the share sheet needs a file), and preferences (saves). `@capacitor/assets` is a dev tool that makes the icons; its npm audit warnings are dev-only.
  - **App id:** `com.domochitreats.game`. It's permanent on Play.
  - **Saves:** in the app they go to Capacitor Preferences. The first launch moves over any save found in the web view's localStorage (`PreferencesStorage`).
  - **Screen:** the app starts in landscape (manifest `sensorLandscape`). Settings in the app gets a third switch, Landscape → Portrait → Auto-rotate (`settings.orientation`).
  - **Back button:** closes an HTML card, then Settings, a ticket or the journal, then goes from a station back to the Lobby. Otherwise the app goes to the background (`scenes/back.ts`).
  - **Feedback relay:** now lists `https://localhost` (the app's origin) in `relay/wrangler.toml`. Kumar redeploys it with `npx wrangler deploy`, since a production deploy from here was blocked.
  - **For the store:** `public/privacy.html` (contact is domochi's Instagram and site, not a personal email); `store/` has the listing text, the feature graphic, the 512 icon and screenshots (`npm run store-art`); `ANDROID.md` has Kumar's steps (Android Studio, the upload key, building the AAB, Play Console, the 12-tester / 14-day closed test, data safety answers).
  - **Signing:** release builds use `android/keystore.properties` (git-ignored), with the `.jks` kept outside the repo.
  - **Fixed along the way:** the "today's special" chalkboard drew with holes in it (Phaser 4 draws a tilted text with a background wrongly), so it's no longer tilted. In portrait, the pickups list could slide under the tab bar; it now stops above it.
- **Kumar's notes from playing the Android build (2026-11-01):**
  - **The beignet skips the Glaze station** (Kumar chose this). Its powdered sugar is a topping (`topping-powdered-sugar`, shaken on like the cookie crumbs). Flavours may now have no `glaze`.
    - Plain donuts go from the rack straight onto the toppings tray (`startToppingsFromRack`). When something on the menu takes no glaze, the Toppings station's row shows rack donuts after the shelf ones (named `toppings-rack-N`).
    - Its glaze score is perfect bare and poor if glazed anyway.
    - On days 1–2 the Glaze station says "no glazes on the menu yet!".
    - Old saves carry their glaze-powdered-sugar stock over to the topping.
  - **Flip it either way up:** "landscape" and "portrait" now follow the sensor, so a phone on a charger can turn 180°. That needed the game's own tiny Android plugin (`OrientationPlugin.java`: SENSOR_LANDSCAPE / SENSOR_PORTRAIT / FULL_USER), because `@capacitor/screen-orientation` locks one fixed way. That library was removed.
  - **Louder:** music 0.05 → 0.2, effects 0.5 → 0.85, through a limiter so it doesn't crackle. The bass is a triangle now, since a phone speaker can't play the low sine.
  - **Trays left dirty stay dirty, and grow mold** (`TrayState`, `save.trays`, `GameSession.traysForTomorrow`, `cleanup.moldNoPayDays: 2`).
    - Overnight mold: donuts made on the tray taste "funky", which means no tip and a bad reaction.
    - Two or more dirty days: those customers don't pay at all.
    - Scrubbing clean clears the mold. The trays show the old mess and fuzzy mold, and mochi warns about it in the morning.
  - **Locked cups and jars** are dotted cup and jar shapes with no name (no spoilers).
  - **Pop-up forms:** buttons have the game's raised look and room underneath. Short landscape screens get a compact form.
  - **Rounded labels:** "Tap me!", customer tags, "journal" and "waiting patio" are pills (`ui/Pill.ts`). Tags shrink on the patio.
  - **Tutorial:**
    - It now teaches **+ oil** (it starts a little low) and **holding the grate** before the first flip.
    - mochi's panel picks the least-covering of six spots (top or bottom × left, middle or right in landscape), avoiding the target and each station's controls (`KEEP_CLEAR`).
    - "skip tutorial" sits inside the bubble's corner.
  - **The sponge is always out** at the Glaze and Toppings stations, so you can scrub any time. It's faded when the tray is already clean.
  - **The dough bowl needs washing too.**
    - Every batch tipped into the tub dirties it. Scrubbing round the empty bowl `cleanup.bowlWashTurns` (3) times washes it, with a sponge instead of the spoon.
    - It's on the closing checklist, and needed for a tidy close.
    - Left dirty overnight, it grows mold and no dough can be mixed until it's washed (`TrayState.bowl`, `mold.bowl`).
  - **Box choice as piles of boxes** (`ui/BoxPile.ts`): a single bag, then the trio, flight and domochi boxes, wider for bigger boxes and stacked up to three high to show stock, with the name and count under each. Tap a pile to use it; the chosen pile is ringed in pink.
  - **Same-size trays:** the Toppings tray now uses the Glaze tray's exact size and spacing.
  - **Choppiness on the emulator:** measured through the web view's debugger, every station holds about 60 fps idle and about 55 fps while pouring, with a few slow frames. The game keeps up, so the choppy feel is most likely the emulator's input and display path. Check again on a real phone.
- **Kumar's next round from the emulator (2026-11-01):**
  - **Powdered sugar pours thickly again.** Toppings can set `stream` (pieces per shake). Sugar has 5 finer grains per shake and a bigger ideal amount (160–420), and off-donut grains count as 1/5 of a mess each.
  - **Dough station sponge** sits on the bowl's rim: bright with "scrub to wash" when it's dirty, faded otherwise.
  - **Volume sliders** for music and sound in Settings (0–100%, half by default; 0 is off). Halfway is double the old music level (`MUSIC_MAX 0.8`, `SFX_MAX 1.7`, through the limiter). Saved as `settings.musicVolume` / `soundVolume`.
  - **Supply store restyled:**
    - Each section has a colour, shown as a band on its tiles and a pill behind its title.
    - Each tile has a picture: the tinted bin, the glaze cup in its colour, the jar, the box and so on, with the name and count beside it.
    - Items not in yet are mystery tiles: "coming soon", a "?", and a "locked" button. No names (no spoilers).
  - **Buttons everywhere** have a darker lip and a soft shadow, so they look pressable.
  - **Ticket donuts** size themselves to fit the ticket (the 4th one was hanging off the bottom in landscape).
  - **mochi's journal moved to the top bar**, beside Settings, with a "new!" badge, so it's there from every station. It's no longer on the lot.
  - **Share is on the day summary too** (the day's best donut), as well as on each order's card.
  - **The landscape patio sits a bit higher,** and its label never goes under the tab bar.
  - **Rounded pop-ups:** the HUD notes, the morning and closing checklist, the pickups list, "that's everyone", the station flash messages and the sponge labels all get a rounded plate (`ui/roundBg.ts`, which follows the text each frame).
  - **Couriers for pickup orders:**
    - A little while after a pickup is ordered and the window's open, the courier's car drives in and parks: two spots in landscape, one in portrait (the next courier waits for it).
    - The driver walks to the patio and waits with a "#N pickup" tag. Once the order's handed over, they walk back and drive off.
    - The car is drawn in code (`courier-car`), tinted per courier.
  - **Fixes (Kumar):** shaking across onto the second toppings donut without lifting now makes it the active one, so its count, guide ring and Done follow. An unglazed donut on the glazing tray (out of glaze, say) can always come off: **Done** puts it back on the rack (`returnToRack`).
- **Retention and in-store features (2026-11-01, Kumar asked for research and "what keeps people playing and coming to the real stand").** The launch plan report is at https://claude.ai/artifact/E65ccJbme4rqMoUXqASrbn.
  - **mochi's daily gift** (`systems/daily.ts`, `balance.daily`, `save.daily`): on the first open each day, cash of $2, 3, 4, 5, 6, 8 then $15 for days in a row (a 7-day cycle). Missing a day just restarts the count. A full week earns the "a whole week" sticker. Research: daily streak and engagement bonuses are the top reason US mobile players return.
  - **The trailer's secret word** (`systems/trailerCode.ts`, `balance.trailerCode`, `save.trailerWeeks`):
    - Each week (Monday to Sunday) has a word picked from the date (a fixed donut-themed list, a hash of the week number, never the same two weeks running). Last week's word works too.
    - Typing it on the home screen ("Secret word") pays $10 once a week. Stickers: "been to the trailer" for the first visit, "trailer regular" after 4 weeks.
    - Ethan's calendar: `npm run trailer-words` writes `trailer-words.html` (git-ignored). The words can be worked out from the public code, so the rewards stay in-game.
  - **Release bundle checked:** `bundleRelease` builds (6.3 MB). Only the signing key is missing.
  - **News from the trailer** (`public/news.json`, `systems/news.ts`, `brand.newsUrl`): the home screen reads `news.json` from the game's website at start-up (4 s timeout; offline means no banner) and shows a pink "📍 …" banner, for example where the trailer is this week. Edit the file and push; the app and the web game pick it up next time they open, with no store update. `until` hides it after a date.
  - **The weekly challenge** (`systems/weekly.ts`, `balance.weekly`, `save.weekly`): one goal per real calendar week (the secret word's Monday-to-Sunday weeks). It's one of: serve N of a flavour you have, N great reactions, N day stars, or N spotless closes. Each finished day adds to it, completing it pays $25, and a new week brings a new one. It shows on the morning checklist and the day summary. Research: Papa's-style time-limited goals and multi-day streaks bring players back across the week.
  - **The real shop's featured flavour** (`news.json` `featured`): a menu id such as `strawberry`. While it's in date, it becomes the in-game special of the day for anyone who has that flavour (the special still starts on day 10). The game follows what's happening at the real trailer, with no update needed.
- **Fixes (Kumar, 2026-11-02):**
  - **Volume sliders** jumped to 100%. Inside the scaled Settings card the finger position was worked out wrong, so it's now measured on screen from the slider's own bounds; `settings.spec.ts` tests it.
  - **Home and Settings buttons** are smaller, with more room between them.
  - **Powdered sugar** is a snowy coat again: a soft round `dust` grain (semi-transparent puffs), 11 per shake, spread wider (2.6× scatter), with an ideal amount of 380–1100 grains (`maxPieces` 3200).
  - **One "Let Ethan know" button** on the home screen (Kumar). The form has a choice at the top, "a note for Ethan" or "a flavor idea", and the prompt and placeholder follow it. The home screen now has three buttons: About us, Let Ethan know, Secret word.
  - **Couriers come in the morning** (Kumar): they arrive a few seconds into morning prep and wait at the patio until their order's ready. In landscape, the morning "Open the window" button moved up a little and the cars down, so the parked cars aren't hidden behind it.
- **Security pass and Ethan's daily email (2026-11-02, Kumar asked for "a full cyber security patch" and a daily email for Ethan).**
  - **Review:**
    - Nothing players type is ever put into the page as HTML (the join-team name is escaped; news.json text is drawn as game text).
    - No known vulnerabilities in the libraries that ship (`npm audit --omit=dev`).
    - The upload key and its password file are outside git (`*.jks`, `android/keystore.properties`); the key's backups are outside the repo.
    - The secret words can be worked out from the public code, so their rewards stay in-game.
  - **Relay hardening** (the one internet-facing piece). The Origin check stops other websites but not scripts, so:
    - Reports over 16 KB are refused.
    - Each sender (by IP) gets 10 a day, and the relay takes at most 300 a day (counted in Workers KV).
    - The dev server's origin was removed from the allowed list.
    - Tested locally: 10 accepted then 429, 413 for a big report, 403 for another origin.
  - **Ethan's daily email** (`relay/digest.js`, the Worker's `scheduled` run at 14:00 UTC, KV store `NOTES`):
    - Notes are kept, and one email a day goes out only when there's something to tell him: the day's notes (flavour ideas first), the full list of secret words once, then this week's and next week's word every Monday.
    - `DIGEST_TO` is where it goes; `INSTANT_TO` optionally still sends each note at once (Kumar, while testing).
    - Resend needs domochitreats.com verified before it will email Ethan.
  - **Content-Security-Policy** on the built game (website and app, `vite.config.ts`): only its own code, and network calls only to the relay and the game site. Checked: the built game runs with it and nothing is blocked.
  - **Quality of life:** the day pauses while Settings, the journal, an invite or a friend's errand card is open. The home screen's "Secret word" button shows a "new word!" badge until this week's word is found.
