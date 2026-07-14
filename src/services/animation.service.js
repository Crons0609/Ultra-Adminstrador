/**
 * @file animation.service.js
 * @description Centralized animation manager for Ultra Administrador.
 *              Handles Lenis smooth scroll, GSAP layouts, Motion triggers, and Three.js backgrounds.
 */

import gsap from 'gsap';
import { animate } from 'motion';
import Lenis from 'lenis';
import * as THREE from 'three';

let lenisInstance = null;
let activeScene = null;
let activeRenderer = null;

export const AnimationService = {
  /**
   * Initialize Lenis global smooth scroll.
   * Runs requestAnimationFrame ticks to sync scroll physics.
   */
  initGlobalScroll() {
    if (lenisInstance) return lenisInstance;

    lenisInstance = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.0
    });

    function raf(time) {
      if (lenisInstance) {
        lenisInstance.raf(time);
        requestAnimationFrame(raf);
      }
    }
    requestAnimationFrame(raf);

    console.log('[AnimationService] 📜 Lenis smooth scrolling initialized.');
    return lenisInstance;
  },

  /**
   * Retrieve active Lenis scroll controller.
   */
  getLenis() {
    return lenisInstance;
  },

  /**
   * Animate layout transitions, card pop-ins and button hover interactions.
   * @param {HTMLElement} container - Root HTML wrapper of the view
   */
  animatePageEntrance(container) {
    if (!container) return;

    // 1. GSAP for Hero / Page Header entry
    const header = container.querySelector('.page-header');
    const titleGroup = container.querySelector('.page-title-group');
    const actions = container.querySelector('.page-actions');

    if (header || titleGroup || actions) {
      const elementsToAnimate = [];
      if (titleGroup) {
        elementsToAnimate.push(...titleGroup.children);
      } else if (header) {
        elementsToAnimate.push(header);
      }
      if (actions) {
        elementsToAnimate.push(actions);
      }

      gsap.fromTo(elementsToAnimate,
        { opacity: 0, y: -24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.08,
          ease: 'power3.out',
          clearProps: 'transform,opacity'
        }
      );
    }

    // 2. Framer Motion equivalent (Motion API) for Cards
    const cards = container.querySelectorAll('.card');
    if (cards.length > 0) {
      cards.forEach((card, index) => {
        // Set initial invisible state to prevent flickering
        card.style.opacity = '0';
        card.style.transform = 'scale(0.96) translateY(12px)';

        animate(
          card,
          { opacity: [0, 1], transform: ['scale(0.96) translateY(12px)', 'scale(1) translateY(0px)'] },
          {
            delay: 0.05 + index * 0.05,
            duration: 0.5,
            easing: [0.16, 1, 0.3, 1] // smooth cubic-bezier
          }
        );

        // Bind Framer Motion layout states (hover / tap scale)
        if (card.classList.contains('card-interactive') || card.classList.contains('hover-lift')) {
          card.addEventListener('mouseenter', () => {
            animate(card, { transform: 'translateY(-4px) scale(1.01)', boxShadow: 'var(--shadow-lg)' }, { duration: 0.2 });
          });
          card.addEventListener('mouseleave', () => {
            animate(card, { transform: 'translateY(0px) scale(1)', boxShadow: 'var(--shadow-sm)' }, { duration: 0.2 });
          });
          card.addEventListener('mousedown', () => {
            animate(card, { transform: 'translateY(-2px) scale(0.99)' }, { duration: 0.1 });
          });
          card.addEventListener('mouseup', () => {
            animate(card, { transform: 'translateY(-4px) scale(1.01)' }, { duration: 0.1 });
          });
        }
      });
    }

    // 3. Motion hover & tap controls for buttons
    const buttons = container.querySelectorAll('.btn');
    if (buttons.length > 0) {
      buttons.forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          animate(btn, { scale: 1.04 }, { duration: 0.2, easing: 'ease-out' });
        });
        btn.addEventListener('mouseleave', () => {
          animate(btn, { scale: 1 }, { duration: 0.2, easing: 'ease-out' });
        });
        btn.addEventListener('mousedown', () => {
          animate(btn, { scale: 0.94 }, { duration: 0.08 });
        });
        btn.addEventListener('mouseup', () => {
          animate(btn, { scale: 1.04 }, { duration: 0.08 });
        });
      });
    }
  },

  /**
   * Generate an interactive 3D WebGL background using Three.js.
   * Creates a particle field undulating like waves and reactive to cursor coordinate streams.
   * @param {HTMLElement} container - Canvas mounting wrapper div
   * @returns {Function} Clean-up callback to dispose WebGL elements
   */
  initThreeDBackground(container) {
    if (!container) return () => {};

    // 1. Scene & Renderer Cleanup
    if (activeRenderer) {
      activeRenderer.dispose();
      if (activeRenderer.domElement && activeRenderer.domElement.parentNode) {
        activeRenderer.domElement.parentNode.removeChild(activeRenderer.domElement);
      }
    }

    const scene = new THREE.Scene();
    activeScene = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 55;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.zIndex = '0';
    renderer.domElement.style.pointerEvents = 'none';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    activeRenderer = renderer;

    // 2. Generate Interactive Particles
    const particleCount = 650;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const initialPositions = [];

    for (let i = 0; i < particleCount * 3; i += 3) {
      const x = (Math.random() - 0.5) * 140;
      const y = (Math.random() - 0.5) * 140;
      const z = (Math.random() - 0.5) * 60;
      
      positions[i] = x;
      positions[i + 1] = y;
      positions[i + 2] = z;

      initialPositions.push({ x, y, z });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    // Particle Texture Gradient (Soft Light Sphere)
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 16;
    pCanvas.height = 16;
    const pCtx = pCanvas.getContext('2d');
    const pGradient = pCtx.createRadialGradient(8, 8, 0, 8, 8, 8);
    pGradient.addColorStop(0, 'rgba(139, 92, 246, 1)'); // Violet / purple accent
    pGradient.addColorStop(0.3, 'rgba(139, 92, 246, 0.8)');
    pGradient.addColorStop(1, 'rgba(139, 92, 246, 0)');
    pCtx.fillStyle = pGradient;
    pCtx.fillRect(0, 0, 16, 16);

    const texture = new THREE.CanvasTexture(pCanvas);
    const material = new THREE.PointsMaterial({
      size: 1.8,
      map: texture,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // 3. Mouse Interaction Listeners
    let mouseX = 0;
    let mouseY = 0;
    let targetMouseX = 0;
    let targetMouseY = 0;

    const onMouseMove = (event) => {
      targetMouseX = (event.clientX / window.innerWidth - 0.5) * 20;
      targetMouseY = (event.clientY / window.innerHeight - 0.5) * 20;
    };

    window.addEventListener('mousemove', onMouseMove);

    // 4. Tick Animation Loop
    const clock = new THREE.Clock();
    let frameId = null;

    const tick = () => {
      if (activeScene !== scene) return;

      const elapsedTime = clock.getElapsedTime();

      // Smooth mouse easing interpolation
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;

      const posArray = geometry.attributes.position.array;

      // Animate particle position coordinates with waves
      for (let i = 0; i < particleCount; i++) {
        const baseIdx = i * 3;
        const base = initialPositions[i];

        posArray[baseIdx + 1] = base.y + Math.sin(elapsedTime * 0.4 + base.x * 0.08) * 4;
        posArray[baseIdx + 2] = base.z + Math.cos(elapsedTime * 0.4 + base.y * 0.08) * 4;
      }
      
      geometry.attributes.position.needsUpdate = true;

      // Gentle interactive rotation
      particles.rotation.y = elapsedTime * 0.015 + mouseX * 0.005;
      particles.rotation.x = mouseY * 0.005;

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(tick);
    };

    tick();

    // 5. Window Resize Listener
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    // Return disposers
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
      
      renderer.dispose();
      material.dispose();
      geometry.dispose();
      texture.dispose();

      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      if (activeRenderer === renderer) {
        activeRenderer = null;
      }
      if (activeScene === scene) {
        activeScene = null;
      }
    };
  }
};
