# SleepWell Figma Starfield Breathing Design

- Editable design: https://www.figma.com/design/S4agSBFr2UhudE2BIUnp1k?node-id=64-2
- Prototype: https://www.figma.com/proto/S4agSBFr2UhudE2BIUnp1k?node-id=64-2&starting-point-node-id=64%3A2
- Animation: `assets/animation/sleepwell-starry-breath-4-7-8.gif`
- Canvas: 390 x 844 pixels.
- Intended rhythm: inhale for 4 seconds, hold for 7 seconds, exhale for 8 seconds.

The breathing page now uses two complete PNG frames exported from Figma,
`starfield-figma-a.png` and `starfield-figma-b.png`, with a 10-second CSS blend.
The former Stardust entry is named Starfield Sea, retaining the `stardust`
identifier for saved preferences. Existing prompts and the yellow breathing
control remain; the blue glow from the earlier GIF is no longer displayed.

The background uses actual window dimensions to contain the complete 390 x
844 composition without cropping or stretching, including after resize.
Different screen ratios may show dark margins. Background transitions run
independently of the breathing state machine. The GIF above is an earlier
preview, no longer referenced by the breathing page.

Validation: JavaScript syntax and Node tests. WeChat Skyline simulator and
physical-device playback still require visual verification.
