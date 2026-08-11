/**
 * Ultra Administrador — Landing Page JS
 * Scroll reveals, animated counter, 3D tilt, nav scroll, marquee clone, mobile nav, Firebase config loader
 */

/* ── CONFIGURATION & RTDB LOADER ─────────────────────────────── */
let landingConfig = {
  heroTitle: 'El sistema que transforma tu negocio por completo',
  heroSubtitle: 'Más de 41 módulos integrados para gestionar tu empresa desde un solo lugar. Finanzas, inventario, punto de venta, RRHH, WhatsApp, Telegram y mucho más. Diseñado para crecer contigo.',
  heroCtaText: 'Solicitar Demo Gratis',
  heroModulesLimit: 41,
  compShopifyModules: '~15 (con apps)',
  compTreintaModules: '~12',
  whatsappNumber: '50500000000',
  whatsappCtaText: 'Solicitar Demo por WhatsApp',
  whatsappMessage: '¡Hola! Me interesa conocer más sobre Ultra Administrador 🚀',
  pricingDisclaimer: 'Sin compromisos · Demo 100% gratuita · Respuesta en menos de 1 hora'
};

async function loadLandingConfig() {
  const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const prodUrl = 'https://super-administrador-df803-default-rtdb.firebaseio.com/global/landing_config.json';
  
  if (isLocal) {
    try {
      const res = await fetch('http://localhost:9000/global/landing_config.json');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          landingConfig = { ...landingConfig, ...data };
          applyConfig();
          return;
        }
      }
    } catch (_) {
      // Fallback to production database if emulator is not running
    }
  }

  try {
    const res = await fetch(prodUrl);
    if (res.ok) {
      const data = await res.json();
      if (data) {
        landingConfig = { ...landingConfig, ...data };
      }
    }
  } catch (err) {
    console.warn('[LandingConfig] Failed to fetch config from RTDB:', err.message);
  }

  applyConfig();
}

function applyConfig() {
  // 1. Hero Title
  const titleEl = document.getElementById('hero-title');
  if (titleEl && landingConfig.heroTitle) {
    titleEl.innerHTML = landingConfig.heroTitle;
  }

  // 2. Hero Subtitle
  const subtitleEl = document.getElementById('hero-subtitle');
  if (subtitleEl && landingConfig.heroSubtitle) {
    let sub = landingConfig.heroSubtitle;
    // Dynamically replace modules limit in subtitle if present
    if (sub.includes('41') && landingConfig.heroModulesLimit !== 41) {
      sub = sub.replace('41', `<strong>${landingConfig.heroModulesLimit}</strong>`);
    }
    subtitleEl.innerHTML = sub;
  }

  // 3. Hero CTA Button Text
  const heroDemoBtn = document.getElementById('hero-demo-btn');
  if (heroDemoBtn && landingConfig.heroCtaText) {
    heroDemoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M8 6l6 6-6 6"/></svg> ${landingConfig.heroCtaText}`;
  }

  // 4. Hero Modules Stat Limit
  const modulesStat = document.getElementById('hero-modules-stat');
  if (modulesStat && landingConfig.heroModulesLimit) {
    modulesStat.dataset.count = landingConfig.heroModulesLimit;
    
    // Also update comparison row modules val
    const ultraModulesVal = document.getElementById('ultra-modules-val');
    if (ultraModulesVal) {
      ultraModulesVal.textContent = `${landingConfig.heroModulesLimit}+ módulos`;
    }
  }

  // 5. Comparison Values
  const shopifyModules = document.getElementById('shopify-modules-val');
  if (shopifyModules && landingConfig.compShopifyModules) {
    shopifyModules.textContent = landingConfig.compShopifyModules;
  }
  const treintaModules = document.getElementById('treinta-modules-val');
  if (treintaModules && landingConfig.compTreintaModules) {
    treintaModules.textContent = landingConfig.compTreintaModules;
  }

  // 6. Bottom WhatsApp CTA Button Text
  const ctaWhatsappBtn = document.getElementById('cta-whatsapp-btn');
  if (ctaWhatsappBtn && landingConfig.whatsappCtaText) {
    ctaWhatsappBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> ${landingConfig.whatsappCtaText}`;
  }

  // 7. Pricing Disclaimer
  const pricingDisclaimerEl = document.getElementById('pricing-disclaimer');
  if (pricingDisclaimerEl && landingConfig.pricingDisclaimer) {
    pricingDisclaimerEl.textContent = landingConfig.pricingDisclaimer;
  }
}

/* ── INIT ─────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initScrollReveal();
  await loadLandingConfig(); // Load config before initializing counters
  initCounters();
  initModuleTilt();
  initMobileNav();
  duplicateMarquee();
});

/* ── NAV SCROLL EFFECT ───────────────────────────────────────── */
function initNav() {
  const nav = document.getElementById('nav');
  const handler = () => {
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
  };
  window.addEventListener('scroll', handler, { passive: true });
  handler();
}

/* ── MOBILE NAV ──────────────────────────────────────────────── */
function initMobileNav() {
  const hamburger = document.getElementById('nav-hamburger');
  const navLinks  = document.getElementById('nav-links');
  if (!hamburger || !navLinks) return;
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => navLinks.classList.remove('open'));
  });
}

/* ── SCROLL REVEAL ───────────────────────────────────────────── */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!window.IntersectionObserver) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => obs.observe(el));
}

/* ── ANIMATED COUNTERS ───────────────────────────────────────── */
function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  if (!window.IntersectionObserver) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      obs.unobserve(e.target);
      animateCounter(e.target);
    });
  }, { threshold: 0.5 });

  counters.forEach(el => obs.observe(el));
}

function animateCounter(el) {
  const target   = parseFloat(el.dataset.count);
  const suffix   = el.dataset.suffix || '';
  const prefix   = el.dataset.prefix || '';
  const duration = 1800;
  const start    = performance.now();

  function easeOutExpo(t) {
    return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
  }

  function frame(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const value = target * easeOutExpo(progress);

    const display = Number.isInteger(target)
      ? Math.floor(value)
      : value.toFixed(1);

    el.textContent = prefix + display + suffix;

    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = prefix + target + suffix;
  }

  requestAnimationFrame(frame);
}

/* ── MODULE CARD 3D TILT ─────────────────────────────────────── */
function initModuleTilt() {
  const cards = document.querySelectorAll('.module-card, .industry-card');
  cards.forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width  - 0.5;
      const y = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transform = `perspective(600px) rotateY(${x * 8}deg) rotateX(${-y * 8}deg) translateY(-4px)`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
}

/* ── MARQUEE CLONE ───────────────────────────────────────────── */
function duplicateMarquee() {
  const track = document.querySelector('.marquee-track');
  if (!track) return;
  const clone = track.innerHTML;
  track.innerHTML += clone;
}

/* ── SMOOTH SCROLL FOR ANCHOR LINKS ─────────────────────────── */
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

/* ── WHATSAPP DATA ATTRIBUTE CLICK HANDLER ───────────────────── */
document.querySelectorAll('[data-whatsapp]').forEach(el => {
  el.addEventListener('click', () => {
    const num = landingConfig.whatsappNumber || '50500000000';
    const msg = encodeURIComponent(landingConfig.whatsappMessage || '¡Hola! Me interesa conocer más sobre Ultra Administrador 🚀');
    window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
  });
});
