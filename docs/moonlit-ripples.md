# Moonlit Ripples

The existing `mist` world is now named "月光涟漪". Keeping the ID preserves saved settings. Eight photographic frames include water ripples, moonlight changes and drifting mist in a 6.4-second loop.

The breathing page renders this scene behind its controls at full viewport size. Both the Canvas renderer and image fallback use cover sizing: proportions are preserved, with edge cropping instead of stretching or letterboxing. Other pages use the same component within their existing scene bounds.

Canvas blends adjacent frames. An independent image-layer timer plays while Canvas is unavailable or an image fails to load. Playback pauses while the page is hidden, resumes on return, and releases timers on component removal. Resizing rebuilds the Canvas.

## Verification

- Run `node --test tests/*.test.js` and `node --check components/world-visual/index.js`.
- Playback tests cover unavailable Canvas, loop rollover, hide/show, detach and resize.
- Frames have been checked for changes in moon, mist and water regions.
- WeChat Developer Tools and device rendering still require manual verification. Test several viewport sizes, selecting the world, waiting without touching, hiding/resuming, and entering a body scene.

The JPEGs in `assets/moonlit/` are the runtime animation frames. Figma exports and local diagnostic videos are not included in the application package.
