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
];

// Mass scales with area (r^2) so big fruits are much heavier than small ones
function getFruitMass(typeIndex) {
  const r = FRUITS[typeIndex].radius;
  return (r * r) / (FRUITS[0].radius * FRUITS[0].radius); // normalized so cherry = 1
}

const GRAVITY = 0.4;
const FRICTION = 0.85;
const BOUNCE = 0.25;
const WALL_THICKNESS = 8;
const DROP_DELAY = 600; // ms between drops

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
  }

  setupCanvas() {
    const wrap = document.getElementById('canvas-wrap');
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      this.canvas.width = w;
      this.canvas.height = h;
      this.W = w;
      this.H = h;
      this.dropX = w / 2;
    };
    resize();
    window.addEventListener('resize', () => { resize(); });
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
    const f = new Fruit(this.dropX, FRUITS[this.nextTypeIndex].radius + WALL_THICKNESS, this.nextTypeIndex);
    f.vy = 1;
    this.fruits.push(f);
    this.canDrop = false;

    setTimeout(() => {
      this.nextTypeIndex = this.randomDropType();
      this.updateNextPreview();
      this.canDrop = true;
    }, DROP_DELAY);
  }

  updateNextPreview() {
    document.getElementById('next-preview').textContent = FRUITS[this.nextTypeIndex].emoji;
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
    this.canDrop = true;
    this.lastDropTime = 0;
    this.gameOver = false;
    this.updateUI();
    this.updateNextPreview();
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

      if (f.x < left)  { f.x = left;  f.vx =  Math.abs(f.vx) * BOUNCE; }
      if (f.x > right) { f.x = right; f.vx = -Math.abs(f.vx) * BOUNCE; }
      if (f.y > bottom) {
        f.y = bottom;
        f.vy = -Math.abs(f.vy) * BOUNCE;
        f.vx *= FRICTION;
        if (Math.abs(f.vy) < 0.5) f.vy = 0;
      }

      f.update(dt);
    }

    // Fruit-fruit collisions & merge detection
    const toMerge = [];
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
          if (a.typeIndex === b.typeIndex && !a.merging && !b.merging) {
            // Merge!
            toMerge.push([i, j]);
            a.merging = true;
            b.merging = true;
          } else {
            // Resolve overlap — heavier fruit moves less
            if (dist < 0.001) continue;
            const overlap = (minDist - dist);
            const nx = dx / dist;
            const ny = dy / dist;

            const totalMass = a.mass + b.mass;
            const shareA = b.mass / totalMass; // small fruit gets pushed more
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
              const restitution = 0.25;
              const impulseMag = (-(1 + restitution) * dot) / totalMass;
              // Small fruit gets a big kick; large fruit barely moves
              a.vx -= impulseMag * b.mass * nx;
              a.vy -= impulseMag * b.mass * ny;
              b.vx += impulseMag * a.mass * nx;
              b.vy += impulseMag * a.mass * ny;
            }
          }
        }
      }
    }

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

    // Process merges (in reverse to not mess up indices)
    const processedPairs = new Set();
    for (let [i, j] of toMerge) {
      const key = `${Math.min(i,j)}-${Math.max(i,j)}`;
      if (processedPairs.has(key)) continue;
      processedPairs.add(key);

      const a = this.fruits[i];
      const b = this.fruits[j];
      const newType = a.typeIndex + 1;

      if (newType < FRUITS.length) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;

        // Spawn particles
        this.spawnParticles(mx, my, FRUITS[a.typeIndex].emoji);

        // Create merged fruit
        const merged = new Fruit(mx, my, newType);
        merged.vy = -2;
        merged.vx = (a.vx + b.vx) * 0.3;
        merged.mergeFlash = 1;
        merged.justMerged = true;

        this.fruits.push(merged);
        this.unlockedFruits.add(newType);
        this.updateEvolutionBar();

        const points = FRUITS[newType].score;
        this.addScore(points);
        this.showToast(`${FRUITS[newType].emoji} ${FRUITS[newType].name}! +${points}`);

        if (newType === FRUITS.length - 1) {
          this.showToast('🍉 WATERMELON! Amazing!');
        }
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

    // Game over check - any fruit above the danger line
    const dangerY = FRUITS[0].radius * 2 + WALL_THICKNESS + 10;
    if (!this.gameOver && this.fruits.some(f => !f.justMerged && f.y - f.r < dangerY && f.vy < 0.5 && f.scale >= 1)) {
      // Give a grace period
      if (!this._overTimer) {
        this._overTimer = setTimeout(() => {
          if (this.fruits.some(f => f.y - f.r < dangerY && f.vy < 0.5)) {
            this.triggerGameOver();
          }
          this._overTimer = null;
        }, 1500);
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
      '#f39c12', '#e67e22', '#2ecc71'
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
