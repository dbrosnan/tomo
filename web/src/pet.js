// PixiJS renderer for the creature: parametric face + particle effects + GSAP poses.
import { Application, Container, Graphics, BlurFilter } from 'pixi.js';
import { gsap } from 'gsap';

const EYE_GAP = 62;
const EYE_Y = -28;

export class PetRenderer {
  constructor() {
    this.app = new Application();
    this.emote = null;
    this.particles = [];
    this.poseTweens = [];
  }

  async mount(host) {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
    });
    host.appendChild(this.app.canvas);

    this.root = new Container();
    this.fx = new Container();
    this.creature = new Container();
    this.glow = new Graphics();
    this.glow.filters = [new BlurFilter({ strength: 24 })];
    this.body = new Graphics();
    this.face = new Graphics();
    this.creature.addChild(this.glow, this.body, this.face);
    this.root.addChild(this.fx, this.creature);
    this.app.stage.addChild(this.root);

    this.app.ticker.add((t) => this.tick(t.deltaMS));
    this.layout();
    window.addEventListener('resize', () => this.layout());

    // Perpetual idle breathing.
    gsap.to(this.creature.scale, { x: 1.04, y: 0.96, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.blinkLoop();
    return this;
  }

  layout() {
    this.root.x = this.app.screen.width / 2;
    this.root.y = this.app.screen.height / 2 + 20;
  }

  blinkLoop() {
    const delay = 2 + Math.random() * 3.5;
    gsap.delayedCall(delay, () => {
      this.blinking = true;
      gsap.delayedCall(0.14, () => { this.blinking = false; this.blinkLoop(); });
    });
  }

  setEmote(emote) {
    this.emote = emote;
    this.clearPose();
    this.startPose(emote.pose, emote.bounce ?? 1);
    if (emote.effect === 'burst') this.burst(emote.tint);
  }

  clearPose() {
    this.poseTweens.forEach((tw) => tw.kill());
    this.poseTweens = [];
    gsap.to(this.creature, { rotation: 0, y: 0, duration: 0.3 });
  }

  startPose(pose, vigor) {
    const add = (tw) => this.poseTweens.push(tw);
    if (pose === 'bounce') {
      add(gsap.to(this.creature, { y: -26 * vigor, duration: 0.32 / vigor, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    } else if (pose === 'wiggle') {
      add(gsap.to(this.creature, { rotation: 0.12, duration: 0.18, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    } else if (pose === 'sway') {
      add(gsap.to(this.creature, { rotation: 0.07, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    } else if (pose === 'float') {
      add(gsap.to(this.creature, { y: -18, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    } else if (pose === 'spin') {
      add(gsap.to(this.creature, { rotation: Math.PI * 2, duration: 1.4, repeat: -1, ease: 'power1.inOut' }));
    }
  }

  tick(dms) {
    if (!this.emote) return;
    this.drawBody();
    this.drawFace();
    this.runEffect(dms);
    this.updateParticles(dms);
  }

  drawBody() {
    const { tint, effect } = this.emote;
    const g = this.body;
    g.clear();
    const r = 120;
    const t = performance.now() / 1000;
    const wob = (i) => Math.sin(t * 1.7 + i * 2.1) * 5;
    // Soft blob: circle distorted with gentle sinusoidal wobble.
    g.moveTo(r + wob(0), 0);
    const STEPS = 40;
    for (let i = 1; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const rr = r + wob(i % 8);
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill({ color: tint });
    g.stroke({ color: 0xffffff, width: 3, alpha: 0.35 });
    // Belly highlight
    g.ellipse(0, 46, 62, 34).fill({ color: 0xffffff, alpha: 0.22 });

    this.glow.clear();
    this.glow.circle(0, 0, 132).fill({ color: tint, alpha: effect === 'glow' ? 0.85 : 0.4 });
  }

  drawFace() {
    const e = this.emote;
    const g = this.face;
    g.clear();
    const eyeStyle = this.blinking ? 'closed' : e.eyes;
    this.drawEye(g, -EYE_GAP / 2, EYE_Y, eyeStyle, -1);
    this.drawEye(g, EYE_GAP / 2, EYE_Y, eyeStyle, 1);
    this.drawBrows(g, e.brows);
    this.drawMouth(g, e.mouth);
    if (e.blush > 0.05) {
      g.ellipse(-EYE_GAP / 2 - 26, 6, 16, 9).fill({ color: 0xff7d9c, alpha: 0.45 * e.blush });
      g.ellipse(EYE_GAP / 2 + 26, 6, 16, 9).fill({ color: 0xff7d9c, alpha: 0.45 * e.blush });
    }
  }

  drawEye(g, x, y, style, side) {
    const INK = 0x2b2436;
    if (style === 'round' || style === 'wide' || style === 'teary') {
      const r = style === 'wide' ? 19 : 15;
      g.circle(x, y, r).fill({ color: INK });
      g.circle(x + r * 0.3, y - r * 0.35, r * 0.32).fill({ color: 0xffffff, alpha: 0.9 });
      if (style === 'teary') {
        const drop = 4 + Math.abs(Math.sin(performance.now() / 300)) * 8;
        g.ellipse(x + side * 10, y + 18 + drop, 5, 8).fill({ color: 0x8fd0ff, alpha: 0.9 });
      }
    } else if (style === 'arc') {
      g.moveTo(x - 14, y + 4).quadraticCurveTo(x, y - 16, x + 14, y + 4).stroke({ color: INK, width: 6, cap: 'round' });
    } else if (style === 'closed') {
      g.moveTo(x - 13, y).quadraticCurveTo(x, y + 10, x + 13, y).stroke({ color: INK, width: 5, cap: 'round' });
    } else if (style === 'line') {
      g.moveTo(x - 12, y).lineTo(x + 12, y).stroke({ color: INK, width: 6, cap: 'round' });
    } else if (style === 'star') {
      this.starPath(g, x, y, 5, 16, 7).fill({ color: 0xffb01f });
    } else if (style === 'heart') {
      this.heartPath(g, x, y, 15).fill({ color: 0xff4f78 });
    } else if (style === 'spiral') {
      let a = 0, rr = 2;
      g.moveTo(x, y);
      while (rr < 15) { a += 0.5; rr += 0.55; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.stroke({ color: INK, width: 3.5, cap: 'round' });
    } else if (style === 'angry') {
      g.circle(x, y + 2, 13).fill({ color: INK });
      g.moveTo(x - 16, y - 14).lineTo(x + 16, y - 6 * -side * 0 - 6).stroke({ color: INK, width: 6, cap: 'round' });
    }
  }

  drawBrows(g, lift) {
    if (Math.abs(lift) < 0.15) return;
    const INK = 0x2b2436;
    const y = EYE_Y - 26 - lift * 8;
    const tilt = lift < 0 ? 6 : -4;
    g.moveTo(-EYE_GAP / 2 - 12, y + tilt).lineTo(-EYE_GAP / 2 + 12, y - tilt).stroke({ color: INK, width: 5, cap: 'round' });
    g.moveTo(EYE_GAP / 2 - 12, y - tilt).lineTo(EYE_GAP / 2 + 12, y + tilt).stroke({ color: INK, width: 5, cap: 'round' });
  }

  drawMouth(g, style) {
    const INK = 0x2b2436;
    const y = 28;
    if (style === 'smile') {
      g.moveTo(-18, y).quadraticCurveTo(0, y + 16, 18, y).stroke({ color: INK, width: 5, cap: 'round' });
    } else if (style === 'grin') {
      g.moveTo(-22, y - 2).quadraticCurveTo(0, y + 26, 22, y - 2).closePath().fill({ color: INK });
      g.moveTo(-14, y + 12).quadraticCurveTo(0, y + 20, 14, y + 12).closePath().fill({ color: 0xff8fa3 });
    } else if (style === 'open') {
      g.ellipse(0, y + 8, 14, 17).fill({ color: INK });
      g.ellipse(0, y + 14, 8, 7).fill({ color: 0xff8fa3 });
    } else if (style === 'frown') {
      g.moveTo(-16, y + 10).quadraticCurveTo(0, y - 6, 16, y + 10).stroke({ color: INK, width: 5, cap: 'round' });
    } else if (style === 'wavy') {
      g.moveTo(-18, y + 4);
      for (let i = -18; i <= 18; i += 6) g.lineTo(i, y + 4 + (Math.abs(i / 6) % 2 === 0 ? 4 : -4));
      g.stroke({ color: INK, width: 4.5, cap: 'round' });
    } else if (style === 'cat') {
      g.moveTo(-16, y).quadraticCurveTo(-8, y + 10, 0, y).quadraticCurveTo(8, y + 10, 16, y).stroke({ color: INK, width: 5, cap: 'round' });
    } else if (style === 'oh') {
      g.circle(0, y + 6, 9).fill({ color: INK });
    } else if (style === 'flat') {
      g.moveTo(-12, y + 4).lineTo(12, y + 4).stroke({ color: INK, width: 5, cap: 'round' });
    } else if (style === 'pout') {
      g.moveTo(-12, y + 8).quadraticCurveTo(0, y + 2, 12, y + 8).stroke({ color: INK, width: 6, cap: 'round' });
    } else if (style === 'drool') {
      g.moveTo(-14, y).quadraticCurveTo(0, y + 12, 14, y).stroke({ color: INK, width: 5, cap: 'round' });
      const len = 8 + Math.abs(Math.sin(performance.now() / 400)) * 10;
      g.ellipse(10, y + 10 + len, 4, 7).fill({ color: 0x9adcff, alpha: 0.9 });
    }
  }

  starPath(g, cx, cy, points, outer, inner) {
    for (let i = 0; i < points * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    return g.closePath();
  }

  heartPath(g, cx, cy, s) {
    g.moveTo(cx, cy + s * 0.75);
    g.bezierCurveTo(cx - s * 1.5, cy - s * 0.4, cx - s * 0.6, cy - s * 1.3, cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.6, cy - s * 1.3, cx + s * 1.5, cy - s * 0.4, cx, cy + s * 0.75);
    return g.closePath();
  }

  // --- particle effects -------------------------------------------------
  runEffect(dms) {
    const e = this.emote;
    this.effectClock = (this.effectClock ?? 0) + dms;
    const interval = e.effect === 'sparkle' ? 140 : 320;
    if (e.effect === 'none' || e.effect === 'glow' || e.effect === 'burst') return;
    if (this.effectClock < interval) return;
    this.effectClock = 0;
    this.spawnParticle(e.effect, e.tint);
  }

  spawnParticle(kind, tint) {
    const g = new Graphics();
    const x = (Math.random() - 0.5) * 260;
    const y = 60 + Math.random() * 60;
    if (kind === 'hearts') this.heartPath(g, 0, 0, 8 + Math.random() * 6).fill({ color: 0xff5d86 });
    else if (kind === 'sparkle') this.starPath(g, 0, 0, 4, 7 + Math.random() * 6, 2.5).fill({ color: 0xfff1a8 });
    else if (kind === 'notes') this.notePath(g);
    else if (kind === 'bubbles') g.circle(0, 0, 5 + Math.random() * 9).stroke({ color: tint, width: 2, alpha: 0.9 });
    g.position.set(x, y);
    this.fx.addChild(g);
    this.particles.push({ g, vy: -(30 + Math.random() * 50) / 1000, vx: (Math.random() - 0.5) * 0.04, life: 2600 });
  }

  notePath(g) {
    g.ellipse(0, 8, 6, 4.5).fill({ color: 0x6b5bd6 });
    g.moveTo(5.5, 7).lineTo(5.5, -12).stroke({ color: 0x6b5bd6, width: 2.5, cap: 'round' });
    g.moveTo(5.5, -12).quadraticCurveTo(13, -10, 12, -3).stroke({ color: 0x6b5bd6, width: 2.5, cap: 'round' });
  }

  burst(tint) {
    for (let i = 0; i < 26; i++) {
      const g = new Graphics();
      this.starPath(g, 0, 0, 4, 6 + Math.random() * 8, 2.5).fill({ color: i % 2 ? 0xfff1a8 : tint });
      const a = (i / 26) * Math.PI * 2;
      const sp = 0.12 + Math.random() * 0.18;
      g.position.set(0, 0);
      this.fx.addChild(g);
      this.particles.push({ g, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1400 });
    }
  }

  updateParticles(dms) {
    this.particles = this.particles.filter((p) => {
      p.life -= dms;
      p.g.x += (p.vx ?? 0) * dms;
      p.g.y += p.vy * dms;
      p.g.alpha = Math.min(1, p.life / 900);
      if (p.life <= 0) { p.g.destroy(); return false; }
      return true;
    });
  }
}
