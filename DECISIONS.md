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
