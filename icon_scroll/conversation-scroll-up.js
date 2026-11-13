/**
 * MEDIATED conversation icon — scroll-driven, "stay on your side" version
 * -----------------------------------------------------------------------
 * Same one-message-at-a-time idea as conversation-scroll.js, but a message
 * keeps its side (and its colours) for its whole life. Each step the upper
 * message lifts away and fades, the lower message moves straight up, and a
 * new message pops in below on the opposite side. Sides therefore alternate
 * like a real back-and-forth conversation: left, right, left, right...
 *
 * Usage:   <mediated-conversation-up></mediated-conversation-up>
 * Attributes and events are the same as <mediated-conversation>
 * (themes, step-height, size, color / "convo-step").
 */
import { BUBBLE_TOP, BUBBLE_BOTTOM, THEMES, VIOLET, CORAL, bubbleMarkup, messagesOf } from './conversation-scroll.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const phase = (t, [a, b]) => clamp((t - a) / (b - a));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
const easeOutBack = (t, s = 1.15) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

const DURATION = 1100, DURATION_REDUCED = 300;
const EXIT = [0, 0.45], MOVE = [0.1, 0.7], ENTER = [0.45, 0.95];
const EXIT_LIFT = 14, ENTER_RISE = 6, ENTER_SCALE = 0.55;

// Vertical distance between the upper and lower slot.
const D = BUBBLE_BOTTOM.center[1] - BUBBLE_TOP.center[1];
// Even messages live on the left (original top bubble), odd on the right.
const GEOM = [BUBBLE_TOP, BUBBLE_BOTTOM];
// y offset of a message's bubble at the upper (k=0) … lower (k=1) slot.
const slotY = (side, k) => (side === 0 ? D * k : -D * (1 - k));

export function stepPose(t) {
  const e = easeInOutCubic(phase(t, EXIT));
  const m = easeInOutCubic(phase(t, MOVE));
  const p = phase(t, ENTER);
  return {
    out: { lift: -EXIT_LIFT * e, opacity: 1 - e },
    mid: { k: 1 - m },
    inn: {
      scale: ENTER_SCALE + (1 - ENTER_SCALE) * easeOutBack(p),
      rise: ENTER_RISE * (1 - easeOutQuart(p)),
      opacity: easeOutCubic(clamp(p / 0.6)),
    },
  };
}

if (typeof window !== 'undefined' && !customElements.get('mediated-conversation-up')) {
  class MediatedConversationUp extends HTMLElement {
    connectedCallback() {
      const ids = (this.getAttribute('themes') || '').split(',').map((s) => s.trim()).filter(Boolean);
      this.themes = ids.length ? ids.map((id) => THEMES.find((t) => t.id === id)).filter(Boolean) : THEMES;
      this.msgs = messagesOf(this.themes);
      this.steps = this.msgs.length - 2;
      const stepH = this.getAttribute('step-height') || '40vh';
      const size = this.getAttribute('size') || '180px';
      this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

      this.attachShadow({ mode: 'open' }).innerHTML = `
        <style>
          :host { display:block; position:relative; height: calc(${stepH} * ${this.steps} + 100vh); }
          .stage { position:sticky; top:0; height:100vh; display:flex; flex-direction:column;
                   align-items:center; justify-content:center; gap:24px; }
          svg { width:${size}; height:auto; overflow:visible; display:block; }
          [data-msg] { will-change: transform, opacity; }
        </style>
        <div class="stage">
          <svg viewBox="0 0 99 118" role="img"
               aria-label="Conversation icon cycling through Penn MEDIATED research themes">
            <g class="msgs"></g>
          </svg>
          <slot></slot>
        </div>`;

      const root = this.shadowRoot.querySelector('.msgs');
      const css = getComputedStyle(this);
      const mono = this.getAttribute('color');
      const violet = mono || css.getPropertyValue('--convo-violet').trim() || VIOLET;
      const coral = mono || css.getPropertyValue('--convo-coral').trim() || CORAL;
      root.innerHTML = this.msgs.map((m, i) => {
        const which = i % 2 === 0 ? 'top' : 'bottom';
        return `<g data-msg style="display:none">${bubbleMarkup(which, m.icon,
          { bubbleColor: which === 'top' ? violet : coral, iconColor: which === 'top' ? coral : violet })}</g>`;
      }).join('');
      this.nodes = [...root.querySelectorAll('[data-msg]')];

      this.shown = this.targetIndex();
      this.anim = null;
      this.showOnly(this.shown);
      this.onScroll = () => this.update();
      addEventListener('scroll', this.onScroll, { passive: true });
      addEventListener('resize', this.onScroll);
      setTimeout(() => this.announce(this.shown));
    }

    disconnectedCallback() {
      removeEventListener('scroll', this.onScroll);
      removeEventListener('resize', this.onScroll);
      cancelAnimationFrame(this.raf);
    }

    targetIndex() {
      const r = this.getBoundingClientRect();
      const travel = r.height - innerHeight;
      const p = travel > 0 ? clamp(-r.top / travel) * this.steps : 0;
      return Math.min(this.steps, Math.round(p));
    }

    update() {
      if (this.anim) return;
      const target = this.targetIndex();
      if (target === this.shown) return;
      const dir = Math.sign(target - this.shown);
      this.anim = { from: this.shown, to: this.shown + dir, start: performance.now() };
      this.announce(this.anim.to);
      const tick = (now) => {
        const { from, to, start } = this.anim;
        const t = clamp((now - start) / (this.reduced ? DURATION_REDUCED : DURATION));
        this.draw(Math.min(from, to), dir > 0 ? t : 1 - t);
        if (t < 1) { this.raf = requestAnimationFrame(tick); return; }
        this.shown = to;
        this.anim = null;
        this.showOnly(this.shown);
        this.update();
      };
      this.raf = requestAnimationFrame(tick);
    }

    announce(step) {
      const m = this.msgs[step + 1];
      this.dispatchEvent(new CustomEvent('convo-step', { detail: { index: step, icon: m.icon, theme: m.theme } }));
    }

    put(g, opacity, transform) {
      g.setAttribute('opacity', opacity.toFixed(3));
      if (transform) g.setAttribute('transform', transform); else g.removeAttribute('transform');
    }

    /** Messages s (upper) and s+1 (lower) at rest. */
    showOnly(s) {
      this.nodes.forEach((g, j) => {
        g.style.display = j === s || j === s + 1 ? '' : 'none';
        g.removeAttribute('mask');
        if (j === s || j === s + 1) this.put(g, 1, `translate(0 ${slotY(j % 2, j === s ? 0 : 1)})`);
      });
    }

    draw(s, t) {
      const [out, mid, inn] = [this.nodes[s], this.nodes[s + 1], this.nodes[s + 2]];
      const [so, sm, si] = [s % 2, (s + 1) % 2, (s + 2) % 2];
      this.nodes.forEach((g) => { g.style.display = 'none'; });
      for (const g of [out, mid, inn]) { g.style.display = ''; g.removeAttribute('mask'); }

      if (this.reduced) {
        const k = easeInOutCubic(t);
        this.put(out, 1 - k, `translate(0 ${slotY(so, 0)})`);
        this.put(mid, 1, `translate(0 ${slotY(sm, 1)})`);
        this.put(inn, k, `translate(0 ${slotY(si, 1)})`);
        return;
      }

      const p = stepPose(t);
      this.put(out, p.out.opacity, `translate(0 ${(slotY(so, 0) + p.out.lift).toFixed(3)})`);
      const midY = slotY(sm, p.mid.k);
      this.put(mid, 1, `translate(0 ${midY.toFixed(3)})`);
      const [ox, oy] = GEOM[si].origin;
      const innY = slotY(si, 1);
      const innT = `translate(0 ${(innY + p.inn.rise).toFixed(3)}) translate(${ox} ${oy}) scale(${p.inn.scale.toFixed(4)}) translate(${-ox} ${-oy})`;
      this.put(inn, p.inn.opacity, innT);
    }
  }
  customElements.define('mediated-conversation-up', MediatedConversationUp);
}
