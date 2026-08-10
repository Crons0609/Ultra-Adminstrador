/**
 * @file vortex-engine.js
 * @description Lightweight 2D Canvas Vortex Engine for Ultra Administrador login sequence.
 *              Supports both Success (Indigo/Cyan/Violet) and Error/Rejection (Crimson/Red) vortex modes.
 */

export class VortexEngine {
  constructor(canvas, statusEl = null) {
    this.canvas = canvas;
    this.statusEl = statusEl;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.animFrameId = null;
    this.isRunning = false;
    this.particles = [];
    this.rings = [];
    this.mode = 'success';
  }

  initDimensions() {
    if (!this.canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
    }
  }

  createParticles(mode = 'success') {
    this.particles = [];
    const count = 60;
    const isError = mode === 'error';

    const successColors = ['#6366f1', '#06b6d4', '#818cf8', '#38bdf8', '#c084fc'];
    const errorColors   = ['#ef4444', '#f87171', '#dc2626', '#b91c1c', '#fca5a5'];
    const activeColors  = isError ? errorColors : successColors;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 300;
      const color = activeColors[Math.floor(Math.random() * activeColors.length)];

      this.particles.push({
        angle,
        dist,
        speed: (0.025 + Math.random() * 0.045) * (isError ? 1.3 : 1),
        radialSpeed: (2.0 + Math.random() * 4.0) * (isError ? 1.2 : 1),
        size: 1.2 + Math.random() * 2.6,
        color,
        alpha: 0.3 + Math.random() * 0.7
      });
    }

    // Concentric shockwave energy rings
    if (isError) {
      this.rings = [
        { radius: 25, maxRadius: Math.max(this.width, this.height) * 0.7, speed: 15, alpha: 0.9, width: 2.5, color: '#f87171' },
        { radius: 12, maxRadius: Math.max(this.width, this.height) * 0.6, speed: 11, alpha: 0.8, width: 2.0, color: '#ef4444' },
        { radius: 6,  maxRadius: Math.max(this.width, this.height) * 0.5, speed: 8,  alpha: 0.6, width: 1.5, color: '#b91c1c' }
      ];
    } else {
      this.rings = [
        { radius: 20, maxRadius: Math.max(this.width, this.height) * 0.7, speed: 12, alpha: 0.9, width: 2.0, color: '#38bdf8' },
        { radius: 10, maxRadius: Math.max(this.width, this.height) * 0.6, speed: 9,  alpha: 0.7, width: 1.5, color: '#818cf8' },
        { radius: 5,  maxRadius: Math.max(this.width, this.height) * 0.5, speed: 6,  alpha: 0.5, width: 1.0, color: '#c084fc' }
      ];
    }
  }

  /**
   * Start the login result vortex transition.
   * @param {Object} options
   * @param {'success'|'error'} options.mode - 'success' for valid login, 'error' for invalid credentials
   * @param {number} options.durationMs - Duration in milliseconds (default 1800ms)
   * @param {Function} options.onComplete - Callback when transition finishes
   */
  startTransition({ mode = 'success', durationMs = 1800, onComplete = null } = {}) {
    if (!this.canvas || !this.ctx) {
      if (onComplete) onComplete();
      return;
    }

    this.mode = mode;
    const isError = mode === 'error';

    // Check prefers-reduced-motion
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (onComplete) onComplete();
      return;
    }

    this.stop();
    this.initDimensions();
    this.createParticles(mode);

    this.isRunning = true;
    this.canvas.style.opacity = '1';
    if (this.statusEl) {
      this.statusEl.style.opacity = '1';
      this.statusEl.style.color = isError ? '#f87171' : '#f1f5f9';
      this.statusEl.style.textShadow = isError 
        ? '0 0 25px rgba(239, 68, 68, 0.9)' 
        : '0 0 25px rgba(99, 102, 241, 0.9)';
    }

    const startTime = performance.now();
    const cx = this.width / 2;
    const cy = this.height / 2;

    const render = (now) => {
      if (!this.isRunning) return;

      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / durationMs);

      // Easing functions
      const easeInQuad = progress * progress;
      const easeOutCubic = 1 - Math.pow(1 - progress, 3);

      // Status text overlay
      if (this.statusEl) {
        if (isError) {
          if (progress < 0.4) {
            this.statusEl.innerHTML = `<span class="animate-spin" style="display:inline-block">🚫</span> Validando Acceso...`;
          } else {
            this.statusEl.innerHTML = `⚠️ ACCESO RECHAZADO`;
          }
        } else {
          if (progress < 0.4) {
            this.statusEl.innerHTML = `<span class="animate-spin" style="display:inline-block">⚡</span> Autenticación Exitosa...`;
          } else {
            this.statusEl.innerHTML = `✨ ACCESO AUTORIZADO`;
          }
        }
      }

      // Clear Canvas with trail fade effect
      this.ctx.fillStyle = isError ? 'rgba(15, 6, 8, 0.3)' : 'rgba(7, 9, 14, 0.25)';
      this.ctx.fillRect(0, 0, this.width, this.height);

      // 1. Central glowing core
      const coreRadius = 40 + easeOutCubic * 150;
      const gradient = this.ctx.createRadialGradient(cx, cy, 0, cx, cy, coreRadius);
      
      if (isError) {
        gradient.addColorStop(0, `rgba(239, 68, 68, ${0.55 * (1 - progress * 0.4)})`);
        gradient.addColorStop(0.5, `rgba(185, 28, 28, ${0.3 * (1 - progress * 0.4)})`);
        gradient.addColorStop(1, 'rgba(15, 6, 8, 0)');
      } else {
        gradient.addColorStop(0, `rgba(99, 102, 241, ${0.45 * (1 - progress * 0.4)})`);
        gradient.addColorStop(0.5, `rgba(6, 182, 212, ${0.25 * (1 - progress * 0.4)})`);
        gradient.addColorStop(1, 'rgba(7, 9, 14, 0)');
      }
      
      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // 2. Rotating tech iris crosshairs & arcs
      const irisAngle = elapsed * (isError ? 0.005 : 0.0035);
      this.ctx.save();
      this.ctx.translate(cx, cy);
      this.ctx.rotate(irisAngle);
      
      const arcRadius = 60 + easeOutCubic * 130;
      this.ctx.strokeStyle = isError ? `rgba(248, 113, 113, ${0.5 * (1 - progress * 0.5)})` : `rgba(56, 189, 248, ${0.5 * (1 - progress * 0.5)})`;
      this.ctx.lineWidth = isError ? 2 : 1.5;
      
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, arcRadius, a, a + Math.PI / 4);
        this.ctx.stroke();
      }
      this.ctx.restore();

      // 3. Concentric expanding shockwave rings
      this.rings.forEach((ring) => {
        ring.radius += ring.speed * (1 + easeInQuad * 2.2);
        const ringProgress = ring.radius / ring.maxRadius;
        const currentAlpha = Math.max(0, ring.alpha * (1 - ringProgress));

        if (currentAlpha > 0.01) {
          this.ctx.strokeStyle = ring.color;
          this.ctx.globalAlpha = currentAlpha * (1 - progress * 0.4);
          this.ctx.lineWidth = ring.width;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, ring.radius, 0, Math.PI * 2);
          this.ctx.stroke();
        }
      });
      this.ctx.globalAlpha = 1;

      // 4. Logarithmic spiral orbital particles
      this.particles.forEach((p) => {
        p.angle += p.speed * (1 + easeInQuad * 3);
        p.dist += p.radialSpeed * (1 + easeInQuad * 3.5);
        
        const px = cx + Math.cos(p.angle) * p.dist;
        const py = cy + Math.sin(p.angle) * p.dist;

        // Draw particle tail / streak
        const tailX = cx + Math.cos(p.angle - 0.15) * (p.dist - 10);
        const tailY = cy + Math.sin(p.angle - 0.15) * (p.dist - 10);

        this.ctx.strokeStyle = p.color;
        this.ctx.globalAlpha = p.alpha * (1 - progress * 0.6);
        this.ctx.lineWidth = p.size;
        this.ctx.beginPath();
        this.ctx.moveTo(tailX, tailY);
        this.ctx.lineTo(px, py);
        this.ctx.stroke();
      });
      this.ctx.globalAlpha = 1;

      if (progress < 1) {
        this.animFrameId = requestAnimationFrame(render);
      } else {
        this.stop();
        if (onComplete) onComplete();
      }
    };

    this.animFrameId = requestAnimationFrame(render);
  }

  stop() {
    this.isRunning = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.canvas) {
      this.canvas.style.opacity = '0';
    }
    if (this.statusEl) {
      this.statusEl.style.opacity = '0';
    }
  }
}
