// ==============================
// FRUIT MERGE GAME ENGINE
// ==============================

const FRUITS = [
  { emoji: '🍒', radius: 16, score: 1,   name: 'Cherry' },
  { emoji: '🍓', radius: 22, score: 3,   name: 'Strawberry' },
  { emoji: '🍇', radius: 28, score: 6,   name: 'Grapes' },
  { emoji: '🍊', radius: 34, score: 10,  name: 'Orange' },
  { emoji: '🍎', radius: 42, score: 15,  name: 'Apple' },
  { emoji: '🍐', radius: 48, score: 21,  name: 'Pear' },
  { emoji: '🍑', radius: 54, score: 28,  name: 'Peach' },
  { emoji: '🍋', radius: 60, score: 36,  name: 'Lemon' },
  { emoji: '🍍', radius: 68, score: 45,  name: 'Pineapple' },
  { emoji: '🥭', radius: 76, score: 55,  name: 'Mango' },
  { emoji: '🍉', radius: 86, score: 100, name: 'Watermelon' },
  { emoji: '🍈', radius: 98, score: 500, name: 'Jackfruit' },
];

const WIN_SCORE = 100000;
// Mass scales with volume (r^3) — cherry=1, watermelon=~88
function getFruitMass(typeIndex) {
  const r = FRUITS[typeIndex].radius;
  return (r * r * r) / (FRUITS[0].radius * FRUITS[0].radius * FRUITS[0].radius);
}

const GRAVITY = 0.5;
const FRICTION = 0.55;       // strong floor friction — fruits stop sliding quickly
const WALL_BOUNCE = 0.05;    // walls are nearly dead — no lateral pinball bouncing
const FLOOR_BOUNCE = 0.04;   // floor is nearly dead — fruits thud and stay
const AIR_DAMP = 0.97;       // per-frame velocity damping — kills lingering movement
const WALL_THICKNESS = 8;
const DROP_DELAY = 600; // ms between drops
const COLLISION_ITERS = 3;   // solver iterations per frame for tighter stacking

class Vec2 {
  constructor(x, y) { this.x = x; this.y = y; }
  add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
  sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
  scale(s) { return new Vec2(this.x * s, this.y * s); }
  len() { return Math.sqrt(this.x * this.x + this.y * this.y); }
  norm() { const l = this.len(); return l > 0 ? this.scale(1 / l) : new Vec2(0, 0); }
  dot(v) { return this.x * v.x + this.y * v.y; }
}

class Fruit {
  constructor(x, y, typeIndex) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.typeIndex = typeIndex;
    this.data = FRUITS[typeIndex];
    this.r = this.data.radius;
    this.mass = getFruitMass(typeIndex);
    this.invMass = 1 / this.mass;
    this.merging = false;
    this.id = Math.random().toString(36).slice(2);
    // Animation
    this.scale = 0.3;
    this.targetScale = 1.0;
    this.opacity = 0.5;
    this.wobble = 0;
    this.wobbleDir = 1;
    this.mergeFlash = 0;
    this.justMerged = false;
  }

  update(dt) {
    // Spawn animation
    if (this.scale < this.targetScale) {
      this.scale = Math.min(this.targetScale, this.scale + 0.08);
      this.opacity = Math.min(1, this.opacity + 0.08);
    }

    // Merge flash
    if (this.mergeFlash > 0) this.mergeFlash -= 0.05;

    // Wobble on high velocity
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (speed > 3) {
      this.wobble += 0.3 * this.wobbleDir;
      if (Math.abs(this.wobble) > 6) this.wobbleDir *= -1;
    } else {
      this.wobble *= 0.9;
    }
  }
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.fruits = [];
    this.score = 0;
    this.bestScore = parseInt(localStorage.getItem('fruitMergeBest') || '0');
    this.nextTypeIndex = this.randomDropType();
    this.queuedTypeIndex = this.randomDropType();
    this.dropX = 0;
    this.canDrop = true;
    this.lastDropTime = 0;
    this.gameOver = false;
    this.unlockedFruits = new Set([0, 1]);
    this.pendingMerges = [];
    this.particles = [];
    this.frameId = null;
    this.lastTime = 0;

    this.setupCanvas();
    this.bindEvents();
    this.updateUI();

    document.getElementById('best-display').textContent = this.bestScore;

    document.getElementById('start-btn').addEventListener('click', () => {
      document.getElementById('start-screen').classList.add('hidden');
      this.start();
    });
    document.getElementById('restart-btn').addEventListener('click', () => {
      document.getElementById('gameover-screen').classList.add('hidden');
      this.reset();
      this.start();
    });
    document.getElementById('win-restart-btn').addEventListener('click', () => {
      document.getElementById('win-screen').classList.add('hidden');
      this.reset();
      this.start();
    });
  }

  setupCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const resize = () => {
      // Use the wrapper's actual rendered size, not window dimensions
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w < 10 || h < 10) return; // guard against zero-size during init
      this.canvas.width = w;
      this.canvas.height = h;
      this.W = w;
      this.H = h;
      this.dropX = w / 2;
    };
    resize();
    // ResizeObserver fires on any layout change — orientation, keyboard, toolbar
    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);
    // Belt-and-suspenders for older browsers
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  }

  bindEvents() {
    const getX = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      return (x - rect.left) * (this.W / rect.width);
    };

    const move = (e) => {
      e.preventDefault();
      const x = getX(e);
      const vr = FRUITS[this.nextTypeIndex].radius * 0.92;
      const margin = vr + WALL_THICKNESS + 2;
      this.dropX = Math.max(margin, Math.min(this.W - margin, x));
    };

    const drop = (e) => {
      e.preventDefault();
      if (this.gameOver || !this.canDrop) return;
      const now = Date.now();
      if (now - this.lastDropTime < DROP_DELAY) return;
      this.dropFruit();
      this.lastDropTime = now;
    };

    this.canvas.addEventListener('mousemove', move);
    this.canvas.addEventListener('touchmove', move, { passive: false });
    this.canvas.addEventListener('click', drop);
    this.canvas.addEventListener('touchend', drop, { passive: false });
  }

  randomDropType() {
    // Only drop smaller fruits (first 5)
    const maxDrop = Math.min(4, this.fruits.length > 0
      ? Math.max(...this.fruits.map(f => f.typeIndex)) - 1
      : 4);
    const max = Math.max(0, Math.min(4, maxDrop));
    return Math.floor(Math.random() * (max + 1));
  }

  dropFruit() {
    if (!this.canDrop || this.gameOver) return;
    // Drop the current fruit
    const f = new Fruit(this.dropX, FRUITS[this.nextTypeIndex].radius + WALL_THICKNESS, this.nextTypeIndex);
    f.vy = 1;
    this.fruits.push(f);
    this.canDrop = false;

    // Immediately promote queued → current and show it in the preview
    this.nextTypeIndex = this.queuedTypeIndex;
    this.updateNextPreview();

    setTimeout(() => {
      // Pre-generate the next queued fruit ready for the following drop
      this.queuedTypeIndex = this.randomDropType();
      this.updateQueuedPreview();
      this.canDrop = true;
    }, DROP_DELAY);
  }

  updateNextPreview() {
    document.getElementById('next-preview').textContent = FRUITS[this.nextTypeIndex].emoji;
  }

  updateQueuedPreview() {
    const el = document.getElementById('queued-preview');
    if (el) el.textContent = FRUITS[this.queuedTypeIndex].emoji;
  }

  start() {
    this.gameOver = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.lastTime = performance.now();
    this.loop(this.lastTime);
  }

  reset() {
    this.fruits = [];
    this.particles = [];
    this.score = 0;
    this.unlockedFruits = new Set([0, 1]);
    this.nextTypeIndex = this.randomDropType();
    this.queuedTypeIndex = this.randomDropType();
    this.canDrop = true;
    this.lastDropTime = 0;
    this.gameOver = false;
    this.updateUI();
    this.updateNextPreview();
    this.updateQueuedPreview();
    this.updateEvolutionBar();
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 16, 3);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    if (!this.gameOver) {
      this.frameId = requestAnimationFrame((t) => this.loop(t));
    }
  }

  update(dt) {
    // Physics
    for (let f of this.fruits) {
      if (f.merging) continue;
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Wall collisions — use the actual visual half-size so emojis stay inside
      const vr = f.r * 0.92; // visual containment radius (slightly inside physics r)
      const left   = WALL_THICKNESS + vr;
      const right  = this.W - WALL_THICKNESS - vr;
      const bottom = this.H - WALL_THICKNESS - vr;

      // Per-frame air damping kills lingering velocity
      f.vx *= AIR_DAMP;
      f.vy *= AIR_DAMP;

      if (f.x < left)  { f.x = left;  f.vx =  Math.abs(f.vx) * WALL_BOUNCE; }
      if (f.x > right) { f.x = right; f.vx = -Math.abs(f.vx) * WALL_BOUNCE; }
      if (f.y > bottom) {
        f.y = bottom;
        f.vy = -Math.abs(f.vy) * FLOOR_BOUNCE;
        f.vx *= FRICTION;
        if (Math.abs(f.vy) < 0.3) f.vy = 0;
        if (Math.abs(f.vx) < 0.1) f.vx = 0;
      }

      f.update(dt);
    }

    // Fruit-fruit collisions & merge detection — run multiple iterations for tight stacking
    const toMerge = [];
    for (let _iter = 0; _iter < COLLISION_ITERS; _iter++) {
    for (let i = 0; i < this.fruits.length; i++) {
      for (let j = i + 1; j < this.fruits.length; j++) {
        const a = this.fruits[i];
        const b = this.fruits[j];
        if (a.merging || b.merging) continue;

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = a.r + b.r;

        if (dist < minDist) {
          if (_iter === 0 && a.typeIndex === b.typeIndex && !a.merging && !b.merging) {
            // Only detect merges on first iteration to avoid double-queuing
            toMerge.push([a.id, b.id]);
            a.merging = true;
            b.merging = true;
          } else if (!a.merging && !b.merging) {
            // Resolve overlap for ALL non-merging pairs (including same-type)
            if (dist < 0.001) continue;
            const overlap = (minDist - dist);
            const nx = dx / dist;
            const ny = dy / dist;

            const totalMass = a.mass + b.mass;
            const shareA = b.mass / totalMass;
            const shareB = a.mass / totalMass;

            a.x -= nx * overlap * shareA;
            a.y -= ny * overlap * shareA;
            b.x += nx * overlap * shareB;
            b.y += ny * overlap * shareB;

            // Mass-weighted velocity impulse
            const relVx = b.vx - a.vx;
            const relVy = b.vy - a.vy;
            const dot = relVx * nx + relVy * ny;

            if (dot < 0) {
              const restitution = 0.05;
              const impulseMag = (-(1 + restitution) * dot) / totalMass;
              a.vx -= impulseMag * b.mass * nx;
              a.vy -= impulseMag * b.mass * ny;
              b.vx += impulseMag * a.mass * nx;
              b.vy += impulseMag * a.mass * ny;

              // Moderate upward damp — still allows fruits to stack upward naturally
              const upwardDamp = 0.45;
              if (a.vy < 0) a.vy *= upwardDamp;
              if (b.vy < 0) b.vy *= upwardDamp;
            }
          }
        }
      }
    }
    } // end COLLISION_ITERS

    // Hard-clamp every fruit inside walls after all collision resolution
    for (let f of this.fruits) {
      if (f.merging) continue;
      const vr = f.r * 0.92;
      const left   = WALL_THICKNESS + vr;
      const right  = this.W - WALL_THICKNESS - vr;
      const bottom = this.H - WALL_THICKNESS - vr;
      if (f.x < left)  { f.x = left;   if (f.vx < 0) f.vx = 0; }
      if (f.x > right) { f.x = right;  if (f.vx > 0) f.vx = 0; }
      if (f.y > bottom){ f.y = bottom; if (f.vy > 0) f.vy = 0; }
    }

    // Process merges — look up by ID so array mutations don't cause stale index bugs
    const processedPairs = new Set();
    for (let [idA, idB] of toMerge) {
      const key = [idA, idB].sort().join('-');
      if (processedPairs.has(key)) continue;
      processedPairs.add(key);

      const a = this.fruits.find(f => f.id === idA);
      const b = this.fruits.find(f => f.id === idB);

      // Safety check — both must still exist and still be flagged for merging
      if (!a || !b || !a.merging || !b.merging) continue;

      const newType = a.typeIndex + 1;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;

      this.spawnParticles(mx, my, FRUITS[a.typeIndex].emoji);

      if (newType < FRUITS.length) {
        // Normal merge — create the next fruit
        const merged = new Fruit(mx, my, newType);
        merged.vy = -0.5;
        merged.vx = (a.vx + b.vx) * 0.3;
        merged.mergeFlash = 1;
        merged.justMerged = true;

        this.fruits.push(merged);
        this.unlockedFruits.add(newType);
        this.updateEvolutionBar();

        const points = FRUITS[newType].score;
        this.addScore(points);

        if (newType === FRUITS.length - 1) {
          this.showToast('🍈 JACKFRUIT! Legendary! +500');
        } else if (newType === FRUITS.length - 2) {
          this.showToast('🍉 WATERMELON! Amazing! +100');
        } else {
          this.showToast(`${FRUITS[newType].emoji} ${FRUITS[newType].name}! +${points}`);
        }
      } else {
        // Two jackfruits — just un-flag and give bonus, they stay in play
        a.merging = false;
        b.merging = false;
        a.mergeFlash = 1;
        b.mergeFlash = 1;
        this.addScore(1000);
        this.showToast('🍈🍈 Double Jackfruit! +1000 BONUS!');
      }
    }

    // Remove merging fruits
    this.fruits = this.fruits.filter(f => !f.merging);

    // Update particles
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15;
      p.life -= 0.03;
      p.scale = p.life;
      return p.life > 0;
    });

    // Game over check — fruit touching or above danger line
    const dangerY = FRUITS[0].radius * 2 + WALL_THICKNESS + 10;
    if (!this.gameOver && this.fruits.some(f => !f.justMerged && f.y - f.r <= dangerY && f.scale >= 1)) {
      if (!this._overTimer) {
        this._overTimer = setTimeout(() => {
          if (this.fruits.some(f => f.y - f.r <= dangerY && f.scale >= 1)) {
            this.triggerGameOver();
          }
          this._overTimer = null;
        }, 800);
      }
    } else {
      if (this._overTimer) {
        clearTimeout(this._overTimer);
        this._overTimer = null;
      }
    }

    // Clear justMerged flag
    for (let f of this.fruits) f.justMerged = false;
  }

  spawnParticles(x, y, emoji) {
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const speed = 2 + Math.random() * 3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        emoji,
        life: 1,
        scale: 1,
        size: 12 + Math.random() * 8,
      });
    }
  }

  render() {
    const ctx = this.ctx;
    const W = this.W, H = this.H;

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#16103a');
    bg.addColorStop(1, '#0d0820');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Walls
    ctx.fillStyle = 'rgba(108,60,200,0.5)';
    ctx.fillRect(0, 0, WALL_THICKNESS, H);
    ctx.fillRect(W - WALL_THICKNESS, 0, WALL_THICKNESS, H);
    ctx.fillRect(0, H - WALL_THICKNESS, W, WALL_THICKNESS);

    // Wall glow
    const wg = ctx.createLinearGradient(0, 0, WALL_THICKNESS * 2, 0);
    wg.addColorStop(0, 'rgba(140,80,255,0.3)');
    wg.addColorStop(1, 'rgba(140,80,255,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(WALL_THICKNESS, 0, WALL_THICKNESS * 2, H);
    const wg2 = ctx.createLinearGradient(W - WALL_THICKNESS * 3, 0, W - WALL_THICKNESS, 0);
    wg2.addColorStop(0, 'rgba(140,80,255,0)');
    wg2.addColorStop(1, 'rgba(140,80,255,0.3)');
    ctx.fillStyle = wg2;
    ctx.fillRect(W - WALL_THICKNESS * 3, 0, WALL_THICKNESS * 2, H);

    // Danger line
    const dangerY = FRUITS[0].radius * 2 + WALL_THICKNESS + 10;
    ctx.strokeStyle = 'rgba(255,80,80,0.25)';
    ctx.setLineDash([6, 8]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(WALL_THICKNESS, dangerY);
    ctx.lineTo(W - WALL_THICKNESS, dangerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Drop indicator
    if (this.canDrop && !this.gameOver) {
      const r = FRUITS[this.nextTypeIndex].radius;
      // Dotted line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.dropX, dangerY);
      ctx.lineTo(this.dropX, dangerY + 40);
      ctx.stroke();
      ctx.setLineDash([]);

      // Ghost fruit
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.font = `${r * 1.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(FRUITS[this.nextTypeIndex].emoji, this.dropX, dangerY + r + 5);
      ctx.restore();
    }

    // Fruits
    for (let f of this.fruits) {
      ctx.save();
      ctx.globalAlpha = f.opacity;
      ctx.translate(f.x, f.y);
      ctx.scale(f.scale, f.scale);

      // Merge flash
      if (f.mergeFlash > 0) {
        ctx.shadowColor = 'white';
        ctx.shadowBlur = 30 * f.mergeFlash;
      }

      // Wobble rotation
      ctx.rotate((f.wobble * Math.PI) / 180);

      // Shadow/glow
      ctx.shadowColor = this.getFruitColor(f.typeIndex);
      ctx.shadowBlur = 12;

      // Fruit emoji
      const size = f.r * 1.9;
      ctx.font = `${size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.data.emoji, 0, 0);

      ctx.restore();
    }

    // Particles
    for (let p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.life * 0.8;
      ctx.translate(p.x, p.y);
      ctx.scale(p.scale * 0.8, p.scale * 0.8);
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    }
  }

  getFruitColor(idx) {
    const colors = [
      '#ff4444', '#ff6b9d', '#9b59b6', '#ff8c00',
      '#e74c3c', '#a8d8a8', '#ffb347', '#f4d03f',
      '#f39c12', '#e67e22', '#2ecc71', '#c8a84b'
    ];
    return colors[idx] || '#ffffff';
  }

  addScore(points) {
    this.score += points;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      localStorage.setItem('fruitMergeBest', this.bestScore);
      document.getElementById('best-display').textContent = this.bestScore;
    }
    this.updateUI();
    if (!this.gameOver && this.score >= WIN_SCORE) {
      this.triggerWin();
    }
  }

  updateUI() {
    document.getElementById('score-display').textContent = this.score;
    document.getElementById('best-display').textContent = this.bestScore;
  }

  updateEvolutionBar() {
    for (let i = 0; i < FRUITS.length; i++) {
      const el = document.getElementById(`evo-${i}`);
      if (el) {
        if (this.unlockedFruits.has(i)) {
          el.classList.add('unlocked');
        }
      }
    }
  }

  showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  }

  triggerWin() {
    this.gameOver = true;
    if (this._overTimer) { clearTimeout(this._overTimer); this._overTimer = null; }
    document.getElementById('win-score').textContent = this.score.toLocaleString();
    document.getElementById('win-screen').classList.remove('hidden');
  }

  triggerGameOver() {
    this.gameOver = true;
    document.getElementById('final-score').textContent = this.score;

    const newBest = this.score >= this.bestScore && this.score > 0;
    document.getElementById('new-best-label').style.display = newBest ? 'block' : 'none';

    document.getElementById('gameover-screen').classList.remove('hidden');
  }
}

// Boot on DOM ready
window.addEventListener('DOMContentLoaded', () => {
  const game = new Game();
  window._game = game;
});

// Service Worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('SW registered'))
      .catch(err => console.log('SW error:', err));
  });
}
