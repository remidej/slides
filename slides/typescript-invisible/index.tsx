import { useEffect, useRef } from 'react';
import { useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import editorDocument from './assets/editor.html?raw';

// remi.space/src/styles/global.css: gray = slate, primary = teal (Tailwind 4).
// BaseLayout: dark:bg-gray-900, dark:text-gray-100; typography: Inter
export const design: DesignSystem = {
  palette: {
    bg: 'oklch(20.8% 0.042 265.755)',
    text: 'oklch(96.8% 0.007 247.896)',
    accent: 'oklch(77.7% 0.152 181.912)',
  },
  fonts: { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
  typeScale: { hero: 100, body: 36 },
  radius: 16,
};
const muted = 'oklch(70.4% 0.04 256.788)';
const surface = 'oklch(27.9% 0.041 260.031)';
const border = 'oklch(37.2% 0.044 257.287)';
const fontId = 'osd-webfont-typescript-invisible';
if (typeof document !== 'undefined') {
  let link = document.getElementById(fontId) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.id = fontId;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&display=swap';
}

// Raw assets, NOT modules executed by the presentation. Adding a version here
// automatically exposes it as an editable, importable file in every demo.
const sourceAssets = import.meta.glob<string>(['./assets/*.ts', '!./assets/*.d.ts'], { query: '?raw', import: 'default', eager: true });
const typeAssets = import.meta.glob<string>('./assets/types/*.d.ts', { query: '?raw', import: 'default', eager: true });
const sources = Object.fromEntries(Object.entries(sourceAssets).map(([path, source]) => [path.split('/').pop()!, source]));
const types = Object.fromEntries(Object.entries(typeAssets).map(([path, source]) => [path.split('/').pop()!, source]));

const dictionary = `import { createMessages } from "./create-messages";

export const messages = createMessages({
  welcome: "Bonjour {name} !",
  unread: "Vous avez {count} messages non lus",
  goodbye: "À bientôt !",
});`;
const keys = `import { messages } from "./messages";

messages.t("goodbye"); // ✅
messages.t("hello");   // ❌ clé inconnue

// Essayons une autre clé…
messages.t("welcome", { name: "Alice" });`;
const params = `import { messages } from "./messages";

messages.t("welcome", { name: "Alice" });     // ✅
messages.t("unread", { count: 3 });           // ✅

messages.t("welcome");                       // ❌
messages.t("welcome", { username: "Alice" }); // ❌`;
const react = `import { messages } from "./messages";

const Welcome = () => (
  <messages.Text
    name="welcome"
    params={{ name: <strong>Alice</strong> }}
  />
); // ✅

const Missing = () => <messages.Text name="welcome" />; // ❌`;

type DemoId = 'dictionary' | 'keys' | 'params' | 'react';
type DemoState = { files: Record<string, string>; activeFile: string };
// Live changes survive page navigation, but never write to the source files.
const sessions = new Map<DemoId, DemoState>();

function Editor({ id, code, entry }: { id: DemoId; code: string; entry: string }) {
  const active = useIsActivePage();
  const frame = useRef<HTMLIFrameElement>(null);
  const focusTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    // Escape is reserved by native fullscreen unless Keyboard Lock is available.
    const keyboard = (navigator as Navigator & {
      keyboard?: { lock(keys: string[]): Promise<void>; unlock(): void };
    }).keyboard;
    let editorFocused = false;
    let disposed = false;
    let escapePending = false;
    let unlockTimer: ReturnType<typeof setTimeout> | undefined;
    const releaseKeyboard = () => {
      escapePending = false;
      clearTimeout(unlockTimer);
      keyboard?.unlock();
    };
    const syncKeyboard = () => {
      if (editorFocused && document.fullscreenElement) {
        keyboard?.lock(['Escape']).then(() => {
          if (disposed || (!editorFocused && !escapePending)) keyboard.unlock();
        }).catch(() => { /* Browser may deny the Keyboard Lock permission. */ });
      } else if (!escapePending) releaseKeyboard();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && escapePending) {
        event.preventDefault();
        event.stopImmediatePropagation();
        releaseKeyboard();
      }
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== window.location.origin) return;
      if (event.data?.kind === 'invisible:ready') {
        const files = { ...sources, 'messages.ts': dictionary, [entry]: code };
        frame.current.contentWindow?.postMessage({
          kind: 'invisible:init', files, types, entry,
          state: sessions.get(id),
        }, window.location.origin);
      }
      if (event.data?.kind === 'invisible:change') sessions.set(id, event.data.state);
      if (event.data?.kind === 'invisible:focus') {
        editorFocused = event.data.focused;
        syncKeyboard();
      }
      if (event.data?.kind === 'invisible:leave') {
        editorFocused = false;
        escapePending = true;
        focusTarget.current?.focus({ preventScroll: true });
        // Keep the native Escape lock through keyup, then restore normal Escape.
        unlockTimer = setTimeout(releaseKeyboard, 800);
      }
      if (event.data?.kind === 'invisible:release') releaseKeyboard();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('keyup', onKeyUp, true);
    document.addEventListener('fullscreenchange', syncKeyboard);
    return () => {
      disposed = true;
      releaseKeyboard();
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keyup', onKeyUp, true);
      document.removeEventListener('fullscreenchange', syncKeyboard);
    };
  }, [active, id, code, entry]);
  return (
    <div ref={focusTarget} tabIndex={-1} style={{ outline: 'none', height: 682, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface, boxShadow: '0 24px 70px #00000020' }}>
      {active ? (
        <iframe ref={frame} title={`Éditeur TypeScript — ${id}`} srcDoc={editorDocument}
          style={{ display: 'block', width: '100%', height: '100%', border: 0, borderRadius: 'var(--osd-radius)' }} />
      ) : (
        <>
          <div style={{ height: 60, padding: '14px 28px', boxSizing: 'border-box', fontSize: 24, color: 'var(--osd-accent)', borderBottom: `1px solid ${border}` }}>{entry}</div>
          <pre style={{ margin: 0, padding: '30px 36px', fontSize: 32, lineHeight: '44px', color: 'var(--osd-text)', fontFamily: 'Menlo, Consolas, monospace', whiteSpace: 'pre-wrap' }}>{code}</pre>
        </>
      )}
    </div>
  );
}

function Footer() {
  return (
    <footer style={{ position: 'absolute', bottom: 64, left: 120, right: 120, display: 'flex', justifyContent: 'space-between', fontSize: 24, lineHeight: '32px', color: muted, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
      <span>Rémi de Juvigny</span>
      <span>TS meetup 06/10</span>
    </footer>
  );
}

function DemoPage({ id, title, code, entry }: { id: DemoId; title: string; code: string; entry: string }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', height: 26, fontSize: 22, lineHeight: '26px', color: muted, letterSpacing: '0.09em' }}>
        <span style={{ color: 'var(--osd-accent)' }}>ÇA RESSEMBLE À QUOI ?</span>
      </div>
      <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 78, lineHeight: '94px', fontWeight: 650, letterSpacing: '-0.035em', margin: '16px 0 32px' }}>{title}</h1>
      <Editor id={id} code={code} entry={entry} />
      <Footer />
    </section>
  );
}

function InvisibleWord() {
  const host = useRef<HTMLSpanElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const element = host.current!;
    const label = text.current!;
    const layer = canvas.current!;
    const ctx = layer.getContext('2d');
    if (!ctx) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const padding = 240;
    let frame = 0;
    let progress = 0;
    let target = 0;
    let lastTime = 0;
    let disposed = false;
    let particles: { x: number; y: number; dx: number; dy: number; size: number; alpha: number; delay: number }[] = [];

    const prepare = () => {
      const style = getComputedStyle(label);
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      // Hidden/pre-mounted pages have no layout yet. Wait for a valid size.
      if (width <= 0 || height <= 0) return false;
      layer.width = width + padding * 2;
      layer.height = height + padding * 2;
      const mask = document.createElement('canvas');
      mask.width = width;
      mask.height = height;
      const ink = mask.getContext('2d', { willReadFrequently: true });
      if (!ink) return false;
      ink.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      ink.letterSpacing = style.letterSpacing;
      ink.fillStyle = style.color;
      const metrics = ink.measureText('invisible');
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      ink.fillText('invisible', 0, (height - ascent - descent) / 2 + ascent);
      const pixels = ink.getImageData(0, 0, width, height).data;
      particles = [];
      for (let y = 0; y < height; y += 3) {
        for (let x = 0; x < width; x += 3) {
          const alpha = pixels[(y * width + x) * 4 + 3] / 255;
          if (alpha < 0.1) continue;
          particles.push({
            x: x + padding, y: y + padding,
            dx: 40 + Math.random() * 175, dy: -35 - Math.random() * 170,
            size: 1.4 + Math.random() * 1.8, alpha,
            delay: (x / width) * 0.22 + Math.random() * 0.1,
          });
        }
      }
      ctx.fillStyle = style.color;
      return true;
    };

    const draw = (now: number) => {
      const delta = Math.min(now - lastTime, 40);
      lastTime = now;
      progress = Math.max(0, Math.min(1, progress + (target ? 1 : -1) * delta / (target ? 1450 : 850)));
      ctx.clearRect(0, 0, layer.width, layer.height);
      label.style.opacity = String(Math.max(0, 1 - progress / 0.15));
      for (const particle of particles) {
        const t = Math.max(0, Math.min(1, (progress - particle.delay) / (1 - particle.delay)));
        const drift = t * t;
        ctx.globalAlpha = particle.alpha * Math.min(1, progress / 0.15) * (1 - t) ** 1.5;
        ctx.fillRect(
          particle.x + particle.dx * drift,
          particle.y + particle.dy * drift + Math.sin(t * 7 + particle.x) * t * 12,
          particle.size, particle.size,
        );
      }
      if (progress !== target) frame = requestAnimationFrame(draw);
      else frame = 0;
    };
    const update = () => {
      target = element.matches(':hover, :focus-visible') ? 1 : 0;
      if (reducedMotion.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        progress = target;
        ctx.clearRect(0, 0, layer.width, layer.height);
        label.style.opacity = String(1 - target);
        return;
      }
      if (!frame) {
        if (progress === 0 && !prepare()) return;
        lastTime = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    prepare();
    const resizeObserver = new ResizeObserver(() => {
      if (progress === 0 && !frame) prepare();
    });
    resizeObserver.observe(element);
    void document.fonts.ready.then(() => { if (!disposed && progress === 0) prepare(); });
    element.addEventListener('pointerenter', update);
    element.addEventListener('pointerleave', update);
    element.addEventListener('focus', update);
    element.addEventListener('blur', update);
    return () => {
      disposed = true;
      resizeObserver.disconnect();
      cancelAnimationFrame(frame);
      element.removeEventListener('pointerenter', update);
      element.removeEventListener('pointerleave', update);
      element.removeEventListener('focus', update);
      element.removeEventListener('blur', update);
      label.style.opacity = '1';
    };
  }, []);

  return (
    <span ref={host} tabIndex={0} style={{ position: 'relative', display: 'inline-block', color: 'var(--osd-accent)' }}>
      <span ref={text}>invisible</span>
      <canvas ref={canvas} aria-hidden="true" style={{ position: 'absolute', left: -240, top: -240, pointerEvents: 'none' }} />
    </span>
  );
}

const Intro: Page = () => (
  <section style={{
    position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
    background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)',
  }}>
    <h1 style={{
      margin: '0 0 40px', fontFamily: 'var(--osd-font-display)',
      fontSize: 152, lineHeight: '164px', fontWeight: 650, letterSpacing: '-0.055em',
    }}>
      Rendre TypeScript<br />
      <InvisibleWord />
    </h1>
    <p style={{ margin: 0, fontSize: 44, lineHeight: '62px', color: muted }}>
      Concevoir des APIs pour l’inférence de types
    </p>
    <Footer />
  </section>
);

const Dictionary: Page = () => <DemoPage id="dictionary" title="On écrit juste les messages" code={dictionary} entry="messages.ts" />;
const Keys: Page = () => <DemoPage id="keys" title="Les clés sont déjà connues" code={keys} entry="usage.ts" />;
const Parameters: Page = () => <DemoPage id="params" title="Même les paramètres sont déduits" code={params} entry="usage.ts" />;
const ReactDemo: Page = () => <DemoPage id="react" title="Et ça suit jusque dans React" code={react} entry="usage.tsx" />;

export const transition: SlideTransition = {
  duration: 240,
  enter: { easing: 'cubic-bezier(0, 0, 0.2, 1)', keyframes: [{ opacity: 0 }, { opacity: 1 }] },
};
export const notes = [
  'Et si une API TypeScript pouvait se consommer comme du JavaScript, sans perdre l’autocomplétion ni la sécurité des types ? C’est ce qu’on va regarder avec une petite API de messages. Je commence par vous montrer ce que voit la personne qui l’utilise.',
  'Voici uniquement le côté utilisateur. Aucun type à écrire : les valeurs suffisent. Survoler messages, puis welcome. L’implémentation cible est disponible dans le sélecteur de fichiers, mais on ne la détaille pas encore. Les modifications live restent en mémoire pendant la navigation. Réinitialiser restaure tous les fichiers de cette page.',
  'Survoler hello : cette clé n’existe pas. Remplacer son contenu et déclencher les suggestions avec Ctrl+Espace ou le bouton Compléter. Les clés sont inférées à travers usage.ts → messages.ts → create-messages.ts. Pour reprendre la navigation du deck, appuyer sur Échap ou cliquer le titre hors de l’éditeur. Le maintien du plein écran natif pendant Échap utilise Keyboard Lock lorsque le navigateur l’autorise.',
  'Survoler les deux erreurs : le paramètre manque, puis son nom est incorrect. Effacer username et montrer la suggestion name. Modifier {name} en {firstName} dans messages.ts, puis revenir dans usage.ts : les diagnostics et suggestions évoluent réellement. Réinitialiser avant de continuer.',
  'Le même dictionnaire pilote les props React. name accepte maintenant un élément React. Survoler l’erreur : params reste obligatoire. Pour les prochaines parties, ajouter create-messages-1.ts, create-messages-2.ts, etc. dans slides/typescript-invisible/assets/ : ils sont automatiquement chargés dans le projet virtuel. Modifier l’import de messages.ts pour passer d’une version à l’autre. L’éditeur et ses workers nécessitent un accès à cdn.jsdelivr.net ; Inter vient de Google Fonts. Le code est analysé, pas exécuté.',
];
export const meta: SlideMeta = {
  title: 'Rendre TypeScript invisible — Ça ressemble à quoi ?',
  createdAt: '2026-10-02T08:39:03.778Z',
};
export default [Intro, Dictionary, Keys, Parameters, ReactDemo] satisfies Page[];
