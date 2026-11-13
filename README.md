# Tether — studio site with a 3D chain

A concept landing page for a fictional web studio. A chrome chain runs through every section and slides along its path as you scroll; the light changes per section (white, red, cyan), so the same chrome reads black on the light hero, white on the dark studio part and cyan over the work and contact sections. The hero holds a sphere of keycaps around a chrome star that opens into a ring; the work cards and the badge in the contact section are real 3D objects pinned to their HTML frames.

## Run

Serve the folder (ES modules do not load from `file://`):

```bash
python3 -m http.server 8000
```

Then go to http://localhost:8000.

## Files

- `index.html` — markup and copy
- `css/style.css` — layout, theme variables (light/dark text, red/cyan accent), phone rules
- `js/scene.js` — the 3D layer: chain along a Catmull-Rom path, hero sphere and star, cards, badge
- `js/app.js` — smooth scroll, background and light keyframes, intro, text reveal, accordion, marquee

## How the chain works

1. One link is a tube swept along a stadium (two straight sides, two half circles), so it reads as a real chain link rather than a stretched torus (`linkGeometry()` in `js/scene.js`). Contact shading is baked into vertex colours where neighbouring links touch.
2. All links live in one `InstancedMesh` (one draw call).
3. The path is a `CatmullRomCurve3` through points placed in page coordinates across every section (`waypoints()` in `js/scene.js`). It is rebuilt on resize.
4. Link *i* sits at `t = (i / N + offset) % 1`, is placed with the arc-length table and aligned to the tangent; every second link is turned 90°, and the pitch is just under the inner length so the ends hook into each other like a taut chain.
5. Scroll moves `offset`, so the chain slides through the page. `PULL` sets how far it travels per scrolled pixel.
6. Chrome is `metalness 1, roughness 0.3` with a soft procedural roughness/bump map and a `RoomEnvironment` map; the colour comes from the material tint and three lights whose colour is keyed to scroll (`KEYS` in `js/app.js`).
7. The key light casts shadows: links shade each other, objects shade their cards, and a shadow-only plane at page depth catches the chain's shadow on the page.

The page renders a frame only when something moves: during the intro, while the hero is on screen, while scrolling, or while a card tilts. Pixel ratio is capped at 1.5 (1.25 on touch devices).

## Editing

- Copy and card titles: `index.html`.
- Section colours and light: `KEYS` in `js/app.js` (background, chain tint, key/fill/rim light, env intensity per section and fraction).
- Chain route: `waypoints()` in `js/scene.js`; link proportions and spacing: `LINK`; shadow strength: the `ShadowMaterial` opacity in `createScene()`.
- Card compositions: `data-scene` (`star`, `pendant`, `keys`, `chain`, `cluster`, `ring`) and `data-tone` (`red`, `dark`, `white`, `navy`) on each frame.
- Contact email: the `mailto:` links in `index.html` (`hello@tether.studio` is a placeholder).

## Libraries

three.js 0.170 (ES modules via import map) and Lenis 1.3.4 from jsDelivr; Montserrat and JetBrains Mono from Google Fonts.

Tether is a fictional brand, and this page is a design concept.
