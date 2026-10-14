const { WORLDS, BODY_PARTS } = require('../../utils/constants');
const { createFilaments, createFlyingSeed, updateFlyingSeed, activeDetachLimit } = require('../../utils/dandelion-particles');

function createFallbackFilaments(count) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index * 137.508) % 360;
    const length = 94 + ((index * 29) % 78);
    const opacity = 0.26 + ((index * 17) % 48) / 100;
    const layer = index % 5 === 0 ? 'rear' : index % 3 === 0 ? 'middle' : 'front';
    return { id: index, layer, style: `width:${length}rpx;opacity:${opacity};transform:rotate(${angle}deg);` };
  });
}

function createFallbackSeeds(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    style: `animation-delay:${(index * 0.34).toFixed(2)}s;`
  }));
}

function createPhotoSeeds() {
  return Array.from({ length: 60 }, (_, id) => ({
    id,
    layer: ['near', 'mid', 'far'][id % 3],
    preview: id < 8
  }));
}

Component({
  properties: {
    world: { type: String, value: 'dandelion' },
    phase: { type: String, value: 'idle' },
    cycles: { type: Number, value: 0 },
    targetCycles: { type: Number, value: 6 },
    bodyPart: { type: String, value: '' },
    compact: { type: Boolean, value: false },
    variant: { type: String, value: 'full' }
  },

  data: {
    worlds: WORLDS,
    particles: Array.from({ length: 18 }, (_, index) => ({
      id: index, x: 8 + ((index * 37) % 84), y: 7 + ((index * 53) % 82), delay: (index % 7) * 0.42, size: 3 + (index % 3) * 2
    })),
    ripples: [0, 1, 2],
    partPosition: { x: 50, y: 44 },
    useCanvas: false,
    moonlitCanvasReady: false,
    moonlitFrames: Array.from({ length: 8 }, (_, id) => ({
      id, src: `/assets/moonlit/lake-${id}.jpg`, opacity: id === 0 ? 1 : 0
    })),
    fallbackFilaments: createFallbackFilaments(72),
    fallbackSeeds: createFallbackSeeds(18),
    photoSeeds: createPhotoSeeds()
  },

  lifetimes: {
    ready() {
      // The reference design uses a photographic asset for the flower. Keep the
      // canvas renderer available for experimentation, but use the asset layer
      // in the shipped experience so the fine backlit filaments remain intact.
      this.setData({ useCanvas: false });
      this.moonlitMounted = true;
      if (this.data.world === 'mist') {
        this.startMoonlitFallback();
        this.initMoonlitCanvas();
      }
    },
    detached() {
      this.moonlitMounted = false;
      this.stopMoonlitCanvas();
      this.stopDandelionCanvas();
    }
  },

  pageLifetimes: {
    resize() {
      if (this.data.world !== 'mist') return;
      this.stopMoonlitCanvas();
      wx.nextTick(() => {
        this.startMoonlitFallback();
        this.initMoonlitCanvas();
      });
    },
    hide() {
      this.moonlitHidden = true;
      this.pauseMoonlitFallback();
      this.pauseMoonlitCanvas();
      this.pauseDandelionCanvas();
    },
    show() {
      this.moonlitHidden = false;
      this.phaseChangedAt = Date.now();
      this.lastFrameAt = Date.now();
      if (this.data.useCanvas && this.data.world === 'dandelion') this.startDandelionCanvas();
      if (this.data.world === 'mist') {
        this.startMoonlitFallback();
        if (this.moonlitCanvas) this.startMoonlitCanvas();
        else this.initMoonlitCanvas();
      }
    }
  },

  observers: {
    world(world) {
      if (world === 'mist') wx.nextTick(() => {
        if (!this.moonlitMounted) return;
        this.startMoonlitFallback();
        this.initMoonlitCanvas();
      });
      else this.stopMoonlitCanvas();
    },
    'phase, world, cycles, targetCycles'() {
      const phase = this.data.phase;
      this.phaseChangedAt = Date.now();
      if (phase === 'inhale') this.resetFlower();
      this.driveSkylineWorklet(phase);
      if (this.data.world === 'dandelion' && this.data.useCanvas) {
        wx.nextTick(() => {
          if (this.canvas && !this.frameRequest) this.startDandelionCanvas();
          if (!this.canvas) this.initDandelionCanvas();
        });
      } else {
        this.pauseDandelionCanvas();
      }
    },
    bodyPart(part) {
      const current = BODY_PARTS.find((item) => item.id === part);
      this.setData({ partPosition: current || { x: 50, y: 44 } });
    }
  },

  methods: {
    startMoonlitFallback() {
      if (!this.moonlitMounted || this.moonlitHidden || this.moonlitTimer != null || this.data.world !== 'mist' || this.data.moonlitCanvasReady) return;
      const started = Date.now();
      // Independent image playback also works when Canvas initialization fails.
      this.moonlitTimer = setInterval(() => {
        const position = ((Date.now() - started) % 6400) / 800;
        const current = Math.floor(position);
        const next = (current + 1) % 8;
        const blend = position - current;
        const frames = this.data.moonlitFrames.map((frame) => ({
          ...frame,
          opacity: frame.id === current ? (next < current ? 1 - blend : 1) : frame.id === next ? (next < current ? 1 : blend) : 0
        }));
        this.setData({ moonlitFrames: frames });
      }, 66);
    },

    pauseMoonlitFallback() {
      if (this.moonlitTimer != null) clearInterval(this.moonlitTimer);
      this.moonlitTimer = null;
    },

    initMoonlitCanvas() {
      if (!this.moonlitMounted || this.moonlitHidden || this.moonlitCanvas || this.moonlitInitializing) return;
      this.moonlitInitializing = true;
      this.createSelectorQuery().select('#moonlitCanvas').fields({ node: true, size: true }).exec((results) => {
        this.moonlitInitializing = false;
        const result = results && results[0];
        if (!this.moonlitMounted || !result || !result.node || !result.width || !result.height || this.data.world !== 'mist') return;
        const canvas = result.node;
        const dpr = Math.min(3, (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2) || 2);
        canvas.width = Math.round(result.width * dpr);
        canvas.height = Math.round(result.height * dpr);
        this.moonlitCanvas = canvas;
        this.moonlitSize = { width: result.width, height: result.height, dpr };
        this.moonlitImages = [];
        let loaded = 0;
        for (let index = 0; index < 8; index++) {
          const image = canvas.createImage();
          image.onload = () => {
            if (this.moonlitCanvas !== canvas) return;
            this.moonlitImages[index] = image;
            loaded++;
            if (loaded === 8) this.startMoonlitCanvas();
          };
          image.onerror = () => {
            if (this.moonlitCanvas !== canvas) return;
            this.stopMoonlitCanvas();
            this.startMoonlitFallback();
          };
          image.src = `/assets/moonlit/lake-${index}.jpg`;
        }
      });
    },

    startMoonlitCanvas() {
      if (this.moonlitHidden || !this.moonlitCanvas || this.moonlitRequest != null || this.moonlitImages.filter(Boolean).length !== 8) return;
      const canvas = this.moonlitCanvas;
      const ctx = canvas.getContext('2d');
      const { width, height, dpr } = this.moonlitSize;
      // Cover preserves the lake's proportions on every viewport without bars.
      const scale = Math.max(width / 390, height / 844);
      const drawWidth = 390 * scale;
      const drawHeight = 844 * scale;
      const x = (width - drawWidth) / 2;
      const y = (height - drawHeight) / 2;
      const started = Date.now();
      const draw = () => {
        if (this.moonlitCanvas !== canvas || this.data.world !== 'mist') return;
        const position = ((Date.now() - started) % 6400) / 800;
        const index = Math.floor(position);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = 1;
        ctx.drawImage(this.moonlitImages[index], x, y, drawWidth, drawHeight);
        ctx.globalAlpha = position - index;
        ctx.drawImage(this.moonlitImages[(index + 1) % 8], x, y, drawWidth, drawHeight);
        ctx.globalAlpha = 1;
        if (!this.data.moonlitCanvasReady) {
          this.setData({ moonlitCanvasReady: true });
          this.pauseMoonlitFallback();
        }
        this.moonlitRequest = canvas.requestAnimationFrame(draw);
      };
      this.moonlitRequest = canvas.requestAnimationFrame(draw);
    },

    pauseMoonlitCanvas() {
      if (this.moonlitCanvas && this.moonlitRequest != null) this.moonlitCanvas.cancelAnimationFrame(this.moonlitRequest);
      this.moonlitRequest = null;
    },

    stopMoonlitCanvas() {
      this.pauseMoonlitFallback();
      this.pauseMoonlitCanvas();
      this.moonlitCanvas = null;
      this.moonlitImages = [];
      if (this.moonlitMounted) this.setData({ moonlitCanvasReady: false });
    },

    initDandelionCanvas() {
      if (this.initializingCanvas) return;
      this.initializingCanvas = true;
      this.createSelectorQuery().select('#dandelionCanvas').fields({ node: true, size: true }).exec((results) => {
        this.initializingCanvas = false;
        const result = results && results[0];
        if (!result || !result.node || !result.width || !result.height) return;
        const canvas = result.node;
        let dpr = 2;
        try { dpr = (wx.getWindowInfo && wx.getWindowInfo().pixelRatio) || dpr; } catch (error) {}
        canvas.width = result.width * dpr;
        canvas.height = result.height * dpr;
        const context = canvas.getContext('2d');
        context.scale(dpr, dpr);
        this.canvas = canvas;
        this.context = context;
        this.canvasWidth = result.width;
        this.canvasHeight = result.height;
        this.qualityCount = 120;
        this.filaments = createFilaments(this.qualityCount);
        this.resetFlower();
        this.phaseChangedAt = Date.now();
        this.lastFrameAt = Date.now();
        this.setupSkylineWorklet();
        this.detectDeviceQuality();
        this.startDandelionCanvas();
      });
    },

    detectDeviceQuality() {
      if (!wx.getDeviceBenchmarkInfo) return;
      wx.getDeviceBenchmarkInfo({
        success: (result) => {
          if (result.benchmarkLevel > 0 && result.benchmarkLevel <= 10) {
            this.qualityCount = 60;
            this.filaments = createFilaments(60);
            this.resetFlower();
            this.frameInterval = 1000 / 30;
          }
        }
      });
    },

    setupSkylineWorklet() {
      if (this.renderer !== 'skyline' || !wx.worklet || !this.applyAnimatedStyle || this.workletScale) return;
      const scale = wx.worklet.shared(1);
      const rotation = wx.worklet.shared(0);
      const opacity = wx.worklet.shared(1);
      this.applyAnimatedStyle('#dandelionCanvas', () => {
        'worklet';
        return { transform: `scale(${scale.value}) rotate(${rotation.value}deg)`, opacity: opacity.value };
      });
      this.workletScale = scale;
      this.workletRotation = rotation;
      this.workletOpacity = opacity;
    },

    driveSkylineWorklet(phase) {
      if (!this.workletScale || !wx.worklet) return;
      const timing = wx.worklet.timing;
      const easing = wx.worklet.Easing.inOut(wx.worklet.Easing.sin);
      if (phase === 'inhale') {
        this.workletScale.value = timing(1.05, { duration: 4000, easing });
        this.workletRotation.value = timing(-0.8, { duration: 4000, easing });
        this.workletOpacity.value = timing(1, { duration: 1600, easing });
      } else if (phase === 'hold') {
        this.workletScale.value = timing(1.05, { duration: 7000, easing });
        this.workletRotation.value = timing(0.7, { duration: 7000, easing });
      } else if (phase === 'exhale' || phase === 'completed') {
        this.workletScale.value = timing(0.98, { duration: 8000, easing });
        this.workletRotation.value = timing(3.6, { duration: 8000, easing });
      } else {
        this.workletScale.value = timing(1, { duration: 600, easing });
        this.workletRotation.value = timing(0, { duration: 600, easing });
      }
    },

    resetFlower() {
      if (!this.filaments || !this.canvasWidth) return;
      const center = this.getFlowerGeometry();
      const ordered = this.filaments.slice().sort((a, b) => a.detachOrder - b.detachOrder);
      const finalCycle = this.data.targetCycles > 0 && this.data.cycles + 1 >= this.data.targetCycles;
      const limit = activeDetachLimit(ordered.length, finalCycle);
      this.detachIds = new Set(ordered.slice(0, limit).map((item) => item.id));
      this.detachThresholds = new Map();
      this.flyingSeeds = ordered.slice(0, limit).map((item, index) => {
        const threshold = 0.125 + (index / Math.max(1, limit - 1)) * 0.63;
        this.detachThresholds.set(item.id, threshold);
        return Object.assign(createFlyingSeed(item, center.x, center.y, center.radius), { delay: threshold });
      });
    },

    getFlowerGeometry() {
      const width = this.canvasWidth || 300;
      const height = this.canvasHeight || 400;
      return { x: width * 0.5, y: height * 0.43, radius: Math.min(width * 0.31, height * 0.23) };
    },

    startDandelionCanvas() {
      if (!this.canvas || !this.context || this.frameRequest) return;
      const draw = () => {
        this.frameRequest = null;
        if (!this.canvas || this.data.world !== 'dandelion') return;
        const now = Date.now();
        if (!this.frameInterval || now - this.lastPaintAt >= this.frameInterval) {
          this.drawDandelionFrame(now);
          this.lastPaintAt = now;
        }
        this.frameRequest = this.canvas.requestAnimationFrame(draw);
      };
      this.frameRequest = this.canvas.requestAnimationFrame(draw);
    },

    pauseDandelionCanvas() {
      if (this.canvas && this.frameRequest) this.canvas.cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    },

    stopDandelionCanvas() {
      this.pauseDandelionCanvas();
      if (this.clearAnimatedStyle) this.clearAnimatedStyle('#dandelionCanvas');
      this.canvas = null;
      this.context = null;
    },

    drawDandelionFrame(now) {
      const ctx = this.context;
      const width = this.canvasWidth;
      const height = this.canvasHeight;
      const phase = this.data.phase;
      const elapsed = Math.max(0, now - this.phaseChangedAt);
      const duration = phase === 'inhale' ? 4000 : phase === 'hold' ? 7000 : phase === 'exhale' ? 8000 : 1;
      const progress = Math.min(1, elapsed / duration);
      const delta = Math.min(0.034, Math.max(0.001, (now - this.lastFrameAt) / 1000));
      this.lastFrameAt = now;
      ctx.clearRect(0, 0, width, height);
      const geometry = this.getFlowerGeometry();
      const finalCycle = this.data.targetCycles > 0 && this.data.cycles + 1 >= this.data.targetCycles;
      const releaseProgress = phase === 'exhale' ? progress : phase === 'completed' ? 1 : 0;
      this.drawGlow(ctx, geometry, phase, progress);
      this.drawStem(ctx, geometry, phase, progress, now);
      this.drawFilaments(ctx, geometry, releaseProgress, finalCycle, 0, now);
      this.drawReceptacle(ctx, geometry, now);
      this.drawFilaments(ctx, geometry, releaseProgress, finalCycle, 1, now);
      this.drawFilaments(ctx, geometry, releaseProgress, finalCycle, 2, now);
      this.drawDust(ctx, geometry, now);
      if (phase === 'exhale' || phase === 'completed') {
        const particleProgress = phase === 'completed' ? 1 : progress;
        this.flyingSeeds = this.flyingSeeds.map((seed) => updateFlyingSeed(seed, delta, particleProgress, now / 1000));
      }
      this.flyingSeeds.forEach((seed) => {
        if ((phase === 'exhale' || phase === 'completed') && progress > seed.delay) this.drawSeed(ctx, seed.x, seed.y, seed.rotation, seed.scale, seed.opacity);
      });
    },

    drawGlow(ctx, geometry, phase, progress) {
      const strength = phase === 'inhale' ? 0.1 + progress * 0.11 : phase === 'hold' ? 0.2 : 0.11;
      const gradient = ctx.createRadialGradient(geometry.x, geometry.y, 8, geometry.x, geometry.y, geometry.radius * 1.45);
      gradient.addColorStop(0, `rgba(210, 165, 95, ${strength})`);
      gradient.addColorStop(0.55, `rgba(236, 220, 184, ${strength * 0.45})`);
      gradient.addColorStop(1, 'rgba(236, 220, 184, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(geometry.x, geometry.y, geometry.radius * 1.45, 0, Math.PI * 2);
      ctx.fill();
    },

    drawStem(ctx, geometry, phase, progress, now) {
      const bend = phase === 'exhale' ? progress * 14 : Math.sin(now / 3100) * 2.5;
      ctx.save();
      const stemGradient = ctx.createLinearGradient(geometry.x, geometry.y, geometry.x + bend, this.canvasHeight * 0.88);
      stemGradient.addColorStop(0, 'rgba(151, 130, 78, .72)');
      stemGradient.addColorStop(1, 'rgba(91, 88, 58, .38)');
      ctx.strokeStyle = stemGradient;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(geometry.x, geometry.y + 8);
      ctx.bezierCurveTo(geometry.x - 3, geometry.y + geometry.radius, geometry.x + bend * 0.35, this.canvasHeight * 0.72, geometry.x + bend, this.canvasHeight * 0.88);
      ctx.stroke();
      ctx.restore();
    },

    drawFilaments(ctx, geometry, releaseProgress, finalCycle, layer, now) {
      const detachedTotal = activeDetachLimit(this.filaments.length, finalCycle);
      this.filaments.forEach((filament) => {
        if (filament.layer !== layer) return;
        const selected = this.detachIds && this.detachIds.has(filament.id);
        const threshold = selected ? this.detachThresholds.get(filament.id) : 2;
        const detached = selected && releaseProgress > threshold;
        if (detached) return;
        const radial = geometry.radius * filament.radius * filament.length;
        const inhaleGather = this.data.phase === 'inhale' ? Math.min(1, (now - this.phaseChangedAt) / 4000) * 0.035 : 0;
        const angle = filament.angle - Math.sin(filament.angle) * inhaleGather;
        const breeze = Math.sin(now / 2400 + filament.seed) * (0.8 + layer * 0.35);
        const x = geometry.x + Math.cos(angle) * radial + breeze;
        const y = geometry.y + Math.sin(angle) * radial;
        const alpha = filament.brightness * (selected ? Math.max(0.12, 1 - releaseProgress * detachedTotal / Math.max(1, detachedTotal)) : 1);
        const layerAlpha = [0.28, 0.46, 0.68][layer];
        const warm = Math.round(222 + filament.warmth * 25);
        ctx.strokeStyle = `rgba(${warm + 7}, ${warm + 2}, ${warm - 15}, ${alpha * layerAlpha})`;
        ctx.lineWidth = filament.width * (0.78 + layer * 0.16);
        ctx.beginPath();
        ctx.moveTo(geometry.x, geometry.y);
        const normalX = -Math.sin(angle) * geometry.radius * filament.bend;
        const normalY = Math.cos(angle) * geometry.radius * filament.bend;
        ctx.quadraticCurveTo((geometry.x + x) / 2 + normalX, (geometry.y + y) / 2 + normalY, x, y);
        ctx.stroke();
        this.drawTuft(ctx, x, y, angle, filament.tuft, alpha * layerAlpha, (0.62 + filament.radius * 0.42) * filament.crownSpread);
      });
    },

    drawReceptacle(ctx, geometry, now) {
      const gradient = ctx.createRadialGradient(geometry.x - 3, geometry.y - 4, 2, geometry.x, geometry.y, 15);
      gradient.addColorStop(0, 'rgba(207, 167, 96, .9)');
      gradient.addColorStop(0.48, 'rgba(126, 87, 45, .94)');
      gradient.addColorStop(1, 'rgba(62, 45, 29, .88)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(geometry.x, geometry.y, 14, 0, Math.PI * 2);
      ctx.fill();
      for (let index = 0; index < 26; index += 1) {
        const angle = index * 2.39996;
        const radius = 3 + (index % 6) * 1.7;
        const x = geometry.x + Math.cos(angle) * radius;
        const y = geometry.y + Math.sin(angle) * radius * 0.72;
        ctx.fillStyle = index % 3 === 0 ? 'rgba(229,190,112,.52)' : 'rgba(78,53,31,.64)';
        ctx.beginPath();
        ctx.arc(x, y, 0.8 + (index % 2) * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    drawDust(ctx, geometry, now) {
      for (let index = 0; index < 9; index += 1) {
        const t = now / 5000 + index * 1.73;
        const x = geometry.x + Math.sin(t * 0.7) * geometry.radius * (0.8 + (index % 3) * 0.35);
        const y = geometry.y - geometry.radius * 0.7 + ((index * 47 + now / 90) % Math.max(1, geometry.radius * 1.7));
        ctx.fillStyle = `rgba(245,226,184,${0.035 + (index % 3) * 0.018})`;
        ctx.beginPath();
        ctx.arc(x, y, 0.65 + (index % 2) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    drawTuft(ctx, x, y, rotation, rayCount, alpha, scale) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.strokeStyle = `rgba(250, 244, 224, ${alpha * 0.72})`;
      ctx.lineWidth = 0.38;
      for (let index = 0; index < rayCount; index += 1) {
        const angle = (Math.PI * 2 * index) / rayCount;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const rayLength = (5.5 + (index % 3) * 1.2) * scale;
        ctx.lineTo(Math.cos(angle) * rayLength, Math.sin(angle) * rayLength);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255, 247, 220, ${alpha})`;
      ctx.beginPath();
      ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    drawSeed(ctx, x, y, rotation, scale, opacity) {
      if (opacity <= 0.02 || x > this.canvasWidth + 30 || y < -30) return;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.strokeStyle = `rgba(244, 237, 215, ${opacity})`;
      ctx.lineWidth = 0.65;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 14 * scale);
      ctx.stroke();
      this.drawTuft(ctx, 0, 0, 0, 10, opacity, scale);
      ctx.fillStyle = `rgba(190, 145, 75, ${opacity})`;
      ctx.beginPath();
      ctx.arc(0, 14 * scale, 1.3 * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
});
