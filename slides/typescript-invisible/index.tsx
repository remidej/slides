import { useEffect, useRef, type ReactNode } from 'react';
import { Step, Steps, useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import editorDocument from './assets/editor.html?raw';
import catLabel from './assets/cat-label.png';
import homerInvisible from './assets/homer-invisible.png';
import claudeLogo from './assets/claude-logo.png';
import codexLogo from './assets/codex.svg';
import cursorLogo from './assets/cursor.svg';
import remiPortrait from './assets/remi-portrait.png';
import zodLogo from './assets/zod.svg';
import trpcLogo from './assets/trpc.svg';
import reactRouterLogo from './assets/react-router.svg';
import tanstackLogo from './assets/tanstack.svg';

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
const typeAssets = import.meta.glob<string>('./assets/types/**/*.d.ts', { query: '?raw', import: 'default', eager: true });
const sources = Object.fromEntries(Object.entries(sourceAssets).map(([path, source]) => [path.split('/').pop()!, source]));
const types = Object.fromEntries(Object.entries(typeAssets).map(([path, source]) => [path.split('/types/')[1], source]));

const naiveKeys = `import { createMessages } from "./create-messages-naive";

const messages = createMessages({
  welcome: "Bonjour !",
  goodbye: "À bientôt !",
});

messages.t("welcome");  // ✅ accepté
messages.t("welcomme"); // ❌ accepté à tort`;
const explicitKeys = `import { createMessages } from "./create-messages-keys";

const messages = createMessages<"welcome" | "goodbye">({
  welcome: "Bonjour !",
  goodbye: "À bientôt !",
});

messages.t("welcome");  // ✅ accepté
messages.t("welcomme"); // ✅ rejeté`;
const inferredKeys = explicitKeys.replace('<"welcome" | "goodbye">', '');

const dictionary = `import { createMessages } from "./create-messages";

export const messages = createMessages({
  welcome: "Bonjour {name} !",
  unread: "Vous avez {count} messages non lus",
  goodbye: "À bientôt !",
});`;
const loose = `import { createMessages } from "./create-messages-loose";

const messages = createMessages({
  welcome: "Bonjour {name} !",
  unread: "Vous avez {count} messages non lus",
  goodbye: "À bientôt !",
});

messages.t("welcome", { name: "Alice" });     // ✅ accepté
messages.t("welcome", { username: "Alice" }); // ❌ accepté à tort
messages.t("welcome");                        // ❌ accepté à tort`;
const manual = `import { createMessages } from "./create-messages-manual";
type MessageParams = {
  welcome: { name: string | number };
  unread: { count: string | number };
  goodbye: never;
};
const messages = createMessages<MessageParams>({
  welcome: "Bonjour {name} !",
  unread: "Vous avez {count} messages non lus",
  goodbye: "À bientôt !",
});

messages.t("welcome", { name: "Alice" });`;
const inferred = `${dictionary.replace('export const', 'const')}

messages.t("welcome", { name: "Alice" });     // ✅ accepté
messages.t("welcome", { username: "Alice" }); // ✅ rejeté
messages.t("welcome");                        // ✅ rejeté
messages.t("goodbye");                        // ✅ accepté`;
type DemoId = 'age-annotated' | 'age-inferred' | 'keys-naive' | 'keys-explicit' | 'keys-inferred' | 'loose' | 'manual' | 'authority' | 'inferred' | 'capture-erased' | 'capture-keys' | 'capture-literals' | 'assembled-live' | 'type-tests';
type DemoState = { files: Record<string, string>; activeFile: string };
// Live changes survive page navigation, but never write to the source files.
const sessions = new Map<DemoId, DemoState>();

function Editor({ id, code, entry, height = 682, fontSize = 32, standalone = false, foldRegions = false }: { id: DemoId; code: string; entry: string; height?: number; fontSize?: number; standalone?: boolean; foldRegions?: boolean }) {
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
        const files = standalone || id.startsWith('age-')
          ? { [entry]: code }
          : { ...sources, 'messages.ts': dictionary, [entry]: code };
        frame.current.contentWindow?.postMessage({
          kind: 'invisible:init', files, types, entry, fontSize, foldRegions,
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
  }, [active, id, code, entry, fontSize, standalone, foldRegions]);
  return (
    <div ref={focusTarget} tabIndex={-1} style={{ outline: 'none', height, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface, boxShadow: '0 24px 70px #00000020' }}>
      {active ? (
        <iframe ref={frame} title={`Éditeur TypeScript — ${id}`} srcDoc={editorDocument}
          style={{ display: 'block', width: '100%', height: '100%', border: 0, borderRadius: 'var(--osd-radius)' }} />
      ) : (
        <>
          <pre style={{ margin: 0, padding: '30px 36px', fontSize, lineHeight: `${Math.round(fontSize * 1.375)}px`, color: 'var(--osd-text)', fontFamily: 'Menlo, Consolas, monospace', whiteSpace: 'pre-wrap' }}>{foldRegions ? code.replace(/\/\/ #region ([^\n]*)\n[\s\S]*?\/\/ #endregion/g, '// $1 …') : code}</pre>
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

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ position: 'absolute', top: 100, left: 120, fontSize: 24, lineHeight: '30px', color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>{children}</div>;
}

function DemoPage({ id, title, code, entry, avoid = false }: { id: DemoId; title: string; code: string; entry: string; avoid?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', height: 26, fontSize: 22, lineHeight: '26px', color: muted, letterSpacing: '0.09em' }}>
        <span style={{ color: 'var(--osd-accent)' }}>CÔTÉ UTILISATEUR</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 32, minHeight: 60 }}>
        <span style={{ display: 'inline-block', flexShrink: 0, padding: '6px 18px', background: avoid ? '#fb923c' : 'var(--osd-accent)', color: avoid ? '#431407' : '#042f2e', borderRadius: 6, fontSize: 28, lineHeight: '38px', fontWeight: 700, letterSpacing: '0.04em', transform: 'rotate(-4deg)', boxShadow: '0 5px 12px #00000030' }}>{avoid ? 'À ÉVITER' : 'À FAIRE'}</span>
        <p style={{ margin: 0, fontFamily: 'var(--osd-font-display)', fontSize: 44, lineHeight: '60px', fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--osd-text)' }}>{title}</p>
      </div>
      <div style={{ marginTop: 32 }}>
        <Editor id={id} code={code} entry={entry} height={620} />
      </div>
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
    <SectionLabel>CÔTÉ UTILISATEUR</SectionLabel>
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

const InferenceSection: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>L’INFÉRENCE</SectionLabel>
    <h1 style={{ margin: 0, fontFamily: 'var(--osd-font-display)', fontSize: 112, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em' }}>C'est quoi l'inférence ?</h1>
    <Footer />
  </section>
);

function InferenceIntro({ annotated, showCat = false }: { annotated: boolean; showCat?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <SectionLabel>{annotated ? "L’INFÉRENCE" : 'CÔTÉ UTILISATEUR'}</SectionLabel>
      <Editor id={annotated ? 'age-annotated' : 'age-inferred'} code={annotated ? 'let age: number = 18;' : 'let age = 18;'} entry="demo.ts" height={260} fontSize={64} />
      <p style={{ margin: '40px 0 0', fontSize: 40, lineHeight: '60px', color: muted }}>
        {annotated ? 'Type redondant' : 'Type ✨déduit✨'}
      </p>
      {showCat && <img src={catLabel} alt="Un chat avec une étiquette CAT sur le front" style={{ position: 'absolute', left: '77%', top: '50%', width: 495.6, height: 392, objectFit: 'contain', transform: 'translate(-50%, -50%) rotate(5deg)', boxShadow: '0 24px 80px #00000066', pointerEvents: 'none', zIndex: 1 }} />}
      <Footer />
    </section>
  );
}

const AnnotatedAge: Page = () => <InferenceIntro annotated />;
const RedundantAnnotation: Page = () => <InferenceIntro annotated showCat />;
const InferredAge: Page = () => <InferenceIntro annotated={false} />;
const InferenceQuestion: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ UTILISATEUR</SectionLabel>
    <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 104, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em', margin: 0 }}>
      Pourquoi c'est si utile{''}<span style={{ color: '#00d5be' }}>{''}<span style={{ color: '#ffffff' }}>{''}</span></span><span style={{ color: '#00d5be' }}>{''}</span>{''}{' ?'}
      {''}<span style={{ color: 'var(--osd-accent)' }}>{''}</span>
    </h1>
    <Footer />
  </section>
);

const NaiveKeys: Page = () => <DemoPage id="keys-naive" avoid title="Accepter n'importe quoi" code={naiveKeys} entry="demo.ts" />;
const ExplicitKeys: Page = () => <DemoPage id="keys-explicit" avoid title="Déclarer les clés à la main" code={explicitKeys} entry="demo.ts" />;
const InferredKeys: Page = () => <DemoPage id="keys-inferred" title="Utiliser la valeur fournie pour contraindre l'API" code={inferredKeys} entry="demo.ts" />;

const OneSource: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <div style={{ fontSize: 24, color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>CÔTÉ UTILISATEUR</div>
    <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 88, lineHeight: '108px', fontWeight: 650, letterSpacing: '-0.035em', margin: '24px 0 80px' }}>Les clés sont déclarées deux fois</h1>
    <div style={{ position: 'relative', height: 350 }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 680, height: 350, boxSizing: 'border-box', padding: 40, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface }}>
        <div style={{ fontSize: 26, color: muted, marginBottom: 40 }}>DÉCLARATION MANUELLE</div>
        <pre style={{ fontSize: 40, lineHeight: '64px', margin: 0 }}>{'type Key =\n  "welcome" | "goodbye";'}</pre>
      </div>
      <div style={{ position: 'absolute', left: 680, top: 100, width: 320, textAlign: 'center', color: muted }}>
        <div style={{ fontSize: 26 }}>doublon</div>
        <div style={{ fontSize: 72, lineHeight: '100px' }}>↔</div>
      </div>
      <div style={{ position: 'absolute', right: 0, top: 0, width: 680, height: 350, boxSizing: 'border-box', padding: 40, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface }}>
        <div style={{ fontSize: 26, color: 'var(--osd-accent)', marginBottom: 24 }}>DICTIONNAIRE</div>
        <pre style={{ fontSize: 36, lineHeight: '56px', margin: 0 }}>{'{\n  welcome: "Bonjour !",\n  goodbye: "À bientôt !",\n}'}</pre>
      </div>
      <Steps>
        <Step>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1000, height: 350, background: 'var(--osd-bg)' }}>
            <div style={{ width: 680, height: 350, boxSizing: 'border-box', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 26, color: 'var(--osd-accent)', marginBottom: 40 }}>CLÉS DÉDUITES</div>
              <code style={{ fontSize: 40, lineHeight: '64px' }}>"welcome" | "goodbye"</code>
            </div>
            <div style={{ position: 'absolute', left: 680, top: 100, width: 320, textAlign: 'center', color: 'var(--osd-accent)' }}>
              <div style={{ fontSize: 26 }}>inférence</div>
              <div style={{ fontSize: 72, lineHeight: '100px' }}>←</div>
            </div>
          </div>
        </Step>
      </Steps>
    </div>
    <p style={{ fontSize: 44, lineHeight: '64px', margin: '72px 0 0', color: muted }}>Le dictionnaire suffit à définir les clés autorisées.</p>
    <Footer />
  </section>
);

const LooseParams: Page = () => <DemoPage id="loose" avoid title="On accepte n'importe quels paramètres" code={loose} entry="demo.ts" />;
const ManualParams: Page = () => <DemoPage id="manual" avoid title="Décrire les paramètres à la main" code={manual} entry="demo.ts" />;
const Authority: Page = () => <DemoPage id="authority" avoid title="Les types peuvent diverger des messages" code={manual} entry="demo.ts" />;
const InferredParams: Page = () => <DemoPage id="inferred" title="Utiliser le code runtime comme source de types" code={inferred} entry="demo.ts" />;

const UnderTheHood: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
    <h1 style={{ fontSize: 112, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em', margin: '32px 0 48px' }}>Comment concevoir ses API<br />pour l'inférence</h1>
    <Footer />
  </section>
);

function ApiDesignBadge({ avoid = false }: { avoid?: boolean }) {
  return (<span style={{ display: 'inline-block', flexShrink: 0, padding: '6px 18px', background: avoid ? '#fb923c' : 'var(--osd-accent)', color: avoid ? '#431407' : '#042f2e', borderRadius: 6, fontSize: 28, lineHeight: '38px', fontWeight: 700, letterSpacing: '0.04em', transform: 'rotate(-4deg)', boxShadow: '0 5px 12px #00000030' }}>{avoid ? 'À ÉVITER' : 'À FAIRE'}</span>);
}

function ApiDesignCell({ title, code, preferred = false }: { title: string; code: string; preferred?: boolean }) {
  return (
    <td style={{ padding: '24px 32px', verticalAlign: 'top', borderTop: `1px solid color-mix(in oklch, ${border} 65%, ${muted})`, borderLeft: preferred ? `1px solid color-mix(in oklch, ${border} 65%, ${muted})` : undefined }}>
      <h2 style={{ margin: 0, fontSize: 34, lineHeight: '44px', fontWeight: 650, color: preferred ? 'var(--osd-accent)' : muted }}>{title}</h2>
      <pre style={{ height: 160, margin: '20px 0 0', fontFamily: 'Menlo, Consolas, monospace', fontSize: 28, lineHeight: '40px', whiteSpace: 'pre-wrap' }}>{code}</pre>
    </td>
  );
}

const DesignForInference: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>Bien choisir son design pattern</h1>
    <div style={{ marginTop: 32, border: `1px solid color-mix(in oklch, ${border} 65%, ${muted})`, borderRadius: 'var(--osd-radius)' }}>
    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 0 }}>
      <thead><tr>
        <th style={{ padding: '16px 32px 28px', textAlign: 'left' }}><ApiDesignBadge avoid /></th>
        <th style={{ padding: '16px 32px 28px', textAlign: 'left', borderLeft: `1px solid color-mix(in oklch, ${border} 65%, ${muted})` }}><ApiDesignBadge /></th>
      </tr></thead>
      <tbody><tr>
      <ApiDesignCell title="Configuration globale" code={'configureMessages(catalogue);\n\nt("welcome", { name: "Alice" });'} />
      <ApiDesignCell title="Factory spécialisée" preferred code={'const messages = createMessages(catalogue);\n\nmessages.t("welcome", { name: "Alice" });'} />
      </tr><tr>
      <ApiDesignCell title="Registre mutable" code={'const messages = createMessages();\nmessages.add("welcome", "Bonjour {name} !");'} />
      <ApiDesignCell title="Builder chaîné" preferred code={'const messages = messageBuilder()\n  .add("welcome", "Bonjour {name} !")\n  .build();'} />
      </tr></tbody>
    </table>
    </div>
    <Footer />
  </section>
);

function MethodStage({ label, children, active = false }: { label: string; children: ReactNode; active?: boolean }) {
  return (
    <div style={{ width: 480, height: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, color: active ? 'var(--osd-text)' : muted, background: surface, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)' }}>
      <svg width="112" height="112" viewBox="0 0 180 180" style={{ color: active ? 'var(--osd-accent)' : muted }} fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
      <div style={{ fontSize: 56, lineHeight: '68px', fontWeight: 650, letterSpacing: '-0.025em' }}>{label}</div>
    </div>
  );
}

function MethodArrow() {
  return <svg width="72" height="48" viewBox="0 0 72 48" fill="none" stroke={muted} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 24H66M48 6L66 24L48 42" /></svg>;
}

const InferenceMethod: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
    <div style={{ position: 'absolute', top: 350, left: 420, display: 'flex', alignItems: 'center', gap: 24 }}>
      <MethodStage label="Capturer" active>
        <path d="M54 24H24V54M126 24H156V54M24 126V156H54M156 126V156H126" />
        <rect x="62" y="62" width="56" height="56" rx="8" fill="currentColor" stroke="none" />
      </MethodStage>
      <MethodArrow />
      <MethodStage label="Exploiter">
        <rect x="18" y="70" width="40" height="40" rx="6" fill="currentColor" stroke="none" />
        <path d="M58 90H96M96 90V40H134M96 90V140H134" />
        <rect x="134" y="22" width="36" height="36" rx="6" />
        <rect x="134" y="122" width="36" height="36" rx="6" />
      </MethodStage>

    </div>
    <Footer />
  </section>
);

const ExploitMethod: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
    <div style={{ position: 'absolute', top: 350, left: 420, display: 'flex', alignItems: 'center', gap: 24 }}>
      <MethodStage label="Capturer">
        <path d="M54 24H24V54M126 24H156V54M24 126V156H54M156 126V156H126" />
        <rect x="62" y="62" width="56" height="56" rx="8" fill="currentColor" stroke="none" />
      </MethodStage>
      <MethodArrow />
      <MethodStage label="Exploiter" active>
        <rect x="18" y="70" width="40" height="40" rx="6" fill="currentColor" stroke="none" />
        <path d="M58 90H96M96 90V40H134M96 90V140H134" />
        <rect x="134" y="22" width="36" height="36" rx="6" />
        <rect x="134" y="122" width="36" height="36" rx="6" />
      </MethodStage>

    </div>
    <Footer />
  </section>
);

function AuthorPage({ title, children, avoid = false }: { title: ReactNode; children: ReactNode; avoid?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <div style={{ fontSize: 24, lineHeight: '30px', color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>CÔTÉ AUTEUR</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 32, minHeight: 60 }}>
        <span style={{ display: 'inline-block', flexShrink: 0, padding: '6px 18px', background: avoid ? '#fb923c' : 'var(--osd-accent)', color: avoid ? '#431407' : '#042f2e', borderRadius: 6, fontSize: 28, lineHeight: '38px', fontWeight: 700, letterSpacing: '0.04em', transform: 'rotate(-4deg)', boxShadow: '0 5px 12px #00000030' }}>{avoid ? 'À ÉVITER' : 'À FAIRE'}</span>
        <h1 style={{ margin: 0, fontFamily: 'var(--osd-font-display)', fontSize: 44, lineHeight: '60px', fontWeight: 650, letterSpacing: '-0.02em', color: 'var(--osd-text)' }}>{title}</h1>
      </div>
      <div style={{ marginTop: 32 }}>{children}</div>
      <Footer />
    </section>
  );
}

const erasedInformationDemo = `function createDictionary(
  dictionary: Record<string, string>
) {
  return dictionary;
}

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const capturedKeysDemo = `function createDictionary<
  T extends Record<string, string>
>(dictionary: T) {
  return dictionary;
}

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const ErasedInformation: Page = () => (
  <AuthorPage avoid title="Perdre l’information avec une annotation trop large">
    <Editor id="capture-erased" code={erasedInformationDemo} entry="capture.ts" height={620} fontSize={32} standalone />
  </AuthorPage>
);

const CapturedKeys: Page = () => (
  <AuthorPage title={<>Conserver les clés avec un générique <code>T</code></>}>
    <Editor id="capture-keys" code={capturedKeysDemo} entry="capture.ts" height={620} fontSize={32} standalone />
  </AuthorPage>
);

// Return the dictionary only to inspect the captured T; this is not the full API.
const captureLiteralsDemo = `function createDictionary<
  const T extends Record<string, string>
>(dictionary: T) {
  return dictionary;
}

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const CapturedLiteralsLive: Page = () => (
  <AuthorPage title={<>Conserver les valeurs littérales avec <code>const T</code></>}>
    <Editor id="capture-literals" code={captureLiteralsDemo} entry="capture.ts" height={620} fontSize={32} standalone />
  </AuthorPage>
);

// Two supporting examples on the left, the TypeScript mechanic on the right.
function ExploitPage({ title, tool, notation, children }: { title: string; tool: string; notation: string; children: ReactNode }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
      <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>{title}</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '920px 700px', gap: 60, alignItems: 'center', height: 600, marginTop: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
        <div style={{ padding: '40px 36px', border: '2px solid var(--osd-accent)', borderRadius: 'var(--osd-radius)', background: surface }}>
          <h2 style={{ margin: 0, fontSize: 44, lineHeight: '60px', fontWeight: 650, color: 'var(--osd-accent)' }}>{tool}</h2>
          <pre style={{ margin: '32px 0 0', fontFamily: 'monospace', fontSize: 36, lineHeight: '58px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: 'var(--osd-text)' }}>{notation}</pre>
        </div>
      </div>
      <Footer />
    </section>
  );
}

function TypeExample({ children, accent = false }: { children: ReactNode; accent?: boolean }) {
  return <pre style={{ margin: 0, padding: '28px 32px', border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface, fontSize: 34, lineHeight: '54px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', color: accent ? 'var(--osd-accent)' : 'var(--osd-text)' }}>{children}</pre>;
}

function DerivationArrow() {
  return <div aria-hidden="true" style={{ color: muted, fontSize: 40, lineHeight: '44px', textAlign: 'center' }}>↓</div>;
}

const ExploitKeys: Page = () => (
  <ExploitPage title="Extraire les clés d’un objet" tool="keyof" notation="keyof T">
    <TypeExample>{'{\n  welcome: "Bonjour {name} !",\n  goodbye: "À bientôt !"\n}'}</TypeExample>
    <DerivationArrow />
    <TypeExample accent>{'"welcome" | "goodbye"'}</TypeExample>
  </ExploitPage>
);

const ExploitSelection: Page = () => (
  <ExploitPage title="Accéder au type d’une propriété" tool="Types indexés" notation="T[K]">
    <TypeExample>{'"welcome"\n→ "Bonjour {name} !"'}</TypeExample>
    <TypeExample>{'"unread"\n→ "Vous avez {count} messages."'}</TypeExample>
  </ExploitPage>
);

const ExploitText: Page = () => (
  <ExploitPage title="Identifier des patterns dans les strings" tool="Template literal types + infer" notation={'`${string}{${infer Name}}${infer Rest}`'}>
    <TypeExample>{'"Bonjour {name},\nvous avez {count} messages."'}</TypeExample>
    <DerivationArrow />
    <TypeExample accent>{'"name" | "count"'}</TypeExample>
  </ExploitPage>
);

const ExploitShape: Page = () => (
  <ExploitPage title="Construire un objet à partir d’une union" tool="Mapped types" notation="{ [P in Names]: Value }">
    <TypeExample accent>{'"name" | "count"'}</TypeExample>
    <DerivationArrow />
    <TypeExample>{'{\n  name: string | number;\n  count: string | number;\n}'}</TypeExample>
  </ExploitPage>
);

const ExploitArguments: Page = () => (
  <ExploitPage title="Choisir un type selon une condition" tool="Types conditionnels" notation="T extends U ? A : B">
    <TypeExample>{'// Aucun placeholder\nmessages.t("goodbye");'}</TypeExample>
    <TypeExample>{'// Paramètres obligatoires\nmessages.t("welcome", { name: "Alice" });'}</TypeExample>
  </ExploitPage>
);

// Same source as the consumer demo, with presentation-only region markers and line breaks.
const assembledLiveCode = sources['create-messages.ts']
  .replace(/^[\s\S]*?(?=type Placeholders)/, '// #region Types utilitaires\n')
  .replace('export function createMessages', '// #endregion\n\nexport function createMessages')
  .replace('createMessages<const M extends Record<string, string>>(dictionary: M)', 'createMessages<\n  const M extends Record<string, string>\n>(dictionary: M)')
  .replace('    const params =', '    // #region Remplacement des placeholders\n    const params =')
  .replace('    );\n  }', '    );\n    // #endregion\n  }');

const AssembledContractLive: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>CÔTÉ AUTEUR</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>Assembler le contrat de l’API</h1>
    <div style={{ marginTop: 32 }}>
      <Editor id="assembled-live" code={assembledLiveCode} entry="create-messages.ts" height={680} fontSize={30} standalone foldRegions />
    </div>
    <Footer />
  </section>
);

const InvisibleMeme: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>COMPLEXITÉ</SectionLabel>
    <h1 style={{ position: 'absolute', left: 120, top: 390, width: 960, margin: 0, fontFamily: 'var(--osd-font-display)', fontSize: 96, lineHeight: '120px', fontWeight: 650, letterSpacing: '-0.035em' }}>Est-ce que ça mérite sa complexité ?<span style={{ color: 'var(--osd-accent)' }}>{''}</span></h1>
    <div style={{ position: 'absolute', right: 120, top: 190, width: 604.35, height: 680, transform: 'rotate(3deg)' }}>
      <img src={homerInvisible} alt="Homer paraît mince de face, mais retient les plis de son dos avec ses mains." style={{ display: 'block', width: '100%', height: '100%' }} />
      <div style={{ position: 'absolute', left: 20, right: 20, top: 238, textAlign: 'center', fontFamily: 'Impact, Arial Black, sans-serif', fontSize: 44, lineHeight: '48px', fontWeight: 900, color: '#fff', WebkitTextStroke: '2px #000', paintOrder: 'stroke fill', textShadow: '2px 3px 0 #000' }}>TypeScript<br />côté utilisateur</div>
      <div style={{ position: 'absolute', left: 20, right: 20, bottom: 16, textAlign: 'center', fontFamily: 'Impact, Arial Black, sans-serif', fontSize: 44, lineHeight: '48px', fontWeight: 900, color: '#fff', WebkitTextStroke: '2px #000', paintOrder: 'stroke fill', textShadow: '2px 3px 0 #000' }}>TypeScript<br />côté auteur</div>
    </div>
    <Footer />
  </section>
);

function ComplexityDrawing({ transform }: { transform: string }) {
  return (
      <g transform={transform} fill="none" stroke={muted} strokeWidth="3" opacity="0.85">
        <path d="M30 50C300 0 380 260 130 240S40 30 290 80S360 280 180 160S380 40 390 210M50 210C220 280 350 20 170 30S10 160 240 250M80 100C360 180 20 300 320 130S240 10 60 270" />
        <path d="M15 150H60V20H210V300H370V45H480V210H410M50 285L115 235L155 295L205 225L255 285L300 235M225 45L270 15L300 55L340 20L375 65L420 30" strokeDasharray="9 7" />
        <path d="M345 150c-65-100 150-115 100-25s-145 60-90-5s120 65 30 105M90 90c-80-60-80 100 0 50s-60-120-50-20M460 250l20-20 20 20-20 20zM130 15l18 30h-36z" />
        <circle cx="170" cy="150" r="48" /><circle cx="170" cy="150" r="27" />
        <path d="M170 88V102M170 198V212M108 150H122M218 150H232M126 106L136 116M204 184L214 194M126 194L136 184M204 116L214 106" strokeWidth="7" />
        <circle cx="480" cy="80" r="22" /><circle cx="55" cy="245" r="13" />
        <path d="M300 305h80m-65 10h50m-35 10h20M420 285v-35h-25M285 175l20-10-20-10" />
      </g>
  );
}

const EncapsulatedComplexity: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>COMPLEXITÉ</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>La complexité est encapsulée</h1>
    <svg width="1680" height="540" viewBox="0 0 1680 540" role="img" aria-label="À gauche, la logique métier utilise une interface simple, à la frontière de l’implémentation plus complexe à droite." style={{ display: 'block', marginTop: 88 }}>
      <rect x="998" y="20" width="680" height="480" rx="16" fill={surface} stroke={muted} strokeWidth="2" />
      <text x="1038" y="86" fill={muted} fontSize="36" fontWeight="650">Implémentation plus complexe</text>
      <ComplexityDrawing transform="translate(1640 140) scale(-1 1)" />
      <rect x="892" y="150" width="212" height="220" rx="16" fill="var(--osd-bg)" stroke="var(--osd-accent)" strokeWidth="2" />
      <text x="998" y="250" fill="var(--osd-accent)" textAnchor="middle" fontSize="36" fontWeight="650"><tspan x="998">Interface</tspan><tspan x="998" dy="50">simple</tspan></text>
      <path d="M680 260H890M874 246L890 260L874 274" fill="none" stroke="var(--osd-accent)" strokeWidth="3" />
      <rect x="2" y="110" width="678" height="300" rx="16" fill="none" stroke={muted} strokeWidth="2" />
      <text x="341" y="277" textAnchor="middle" fill="var(--osd-text)" fontSize="52" fontWeight="650">Logique métier</text>
    </svg>
    <Footer />
  </section>
);

const AgentImplementation: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>COMPLEXITÉ</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>L'agent prend en charge l'implémentation</h1>
    <svg width="1680" height="540" viewBox="0 0 1680 540" role="img" aria-label="Nous définissons l’API désirée, puis l’agent réalise l’implémentation complexe." style={{ display: 'block', marginTop: 88 }}>
      <defs><clipPath id="agent-slide-portrait"><circle cx="130" cy="280" r="110" /></clipPath></defs>
      <image href={remiPortrait} x="20" y="170" width="220" height="220" preserveAspectRatio="xMidYMid meet" clipPath="url(#agent-slide-portrait)" />
      <path d="M320 30H550Q580 30 580 60V150Q580 180 550 180H325L270 205L290 155V60Q290 30 320 30Z" fill="var(--osd-bg)" stroke="var(--osd-accent)" strokeWidth="3" strokeLinejoin="round" />
      <text x="435" y="95" fill="var(--osd-accent)" textAnchor="middle" fontSize="36" fontWeight="650"><tspan x="435">une API</tspan><tspan x="435" dy="50">de ouf</tspan></text>
      <path d="M590 110H640Q680 110 680 150V220Q680 260 720 260H730M714 246L730 260L714 274M928 260H1040M1024 246L1040 260L1024 274" fill="none" stroke={muted} strokeWidth="3" />
      <rect x="1050" y="20" width="628" height="480" rx="16" fill={surface} stroke={muted} strokeWidth="2" />
      <text x="1082" y="80" fill={muted} fontSize="34" fontWeight="650">Implémentation complexe</text>
      <ComplexityDrawing transform="translate(1640 140) scale(-1 1)" />
      <image href={claudeLogo} x="740" y="170" width="180" height="180" />
    </svg>
    <Footer />
  </section>
);

const typeTestsCode = `import { expectTypeOf } from "vitest";
import { createMessages } from "./create-messages";

const messages = createMessages({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});

expectTypeOf(messages.t<"welcome">).parameters
  .toEqualTypeOf<["welcome", { name: string | number }]>();

expectTypeOf(messages.t<"goodbye">).parameters
  .toEqualTypeOf<["goodbye"]>();`;

const TestTheTypes: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>COMPLEXITÉ</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>On peut tester les types</h1>
    <div style={{ display: 'grid', gridTemplateColumns: '1100px 520px', gap: 60, alignItems: 'center', marginTop: 32 }}>
      <Editor id="type-tests" code={typeTestsCode} entry="create-messages.test-d.ts" height={640} fontSize={30} />
      <div style={{ padding: '40px 36px', border: '2px solid var(--osd-accent)', borderRadius: 'var(--osd-radius)', background: surface }}>
        <h2 style={{ margin: 0, fontSize: 44, lineHeight: '60px', fontWeight: 650, color: 'var(--osd-accent)' }}>TDD sur les types</h2>
        <pre style={{ margin: '32px 0 0', fontFamily: 'monospace', fontSize: 36, lineHeight: '58px', color: 'var(--osd-text)' }}>vitest --typecheck</pre>
      </div>
    </div>
    <Footer />
  </section>
);

function DxComparison({ from, to, fromLogo, toLogo }: { from: string; to: string; fromLogo?: string; toLogo: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '530px 180px 610px', alignItems: 'center', height: 160 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
        <div style={{ width: 100, height: 100, flexShrink: 0 }}>{fromLogo && <img src={fromLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}</div>
        <span style={{ fontSize: 48, lineHeight: '64px', fontWeight: 650 }}>{from}</span>
      </div>
      <svg width="120" height="48" viewBox="0 0 120 48" fill="none" stroke={muted} strokeWidth="3" aria-hidden="true"><path d="M4 24H108M92 8L108 24L92 40" /></svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        <img src={toLogo} alt="" style={{ width: 100, height: 100, objectFit: 'contain' }} />
        <span style={{ fontSize: 48, lineHeight: '64px', fontWeight: 650, color: 'var(--osd-accent)' }}>{to}</span>
      </div>
    </div>
  );
}

const DifferentiatingDx: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <SectionLabel>DX</SectionLabel>
    <h1 style={{ margin: '62px 0 0', fontFamily: 'var(--osd-font-display)', fontSize: 64, lineHeight: '84px', fontWeight: 650, letterSpacing: '-0.035em' }}>La DX peut être différenciante</h1>
    <div style={{ marginTop: 64, marginLeft: 140, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <DxComparison from="Yup" to="Zod" toLogo={zodLogo} />
      <DxComparison from="REST" to="tRPC" toLogo={trpcLogo} />
      <DxComparison from="React Router" to="TanStack Start" fromLogo={reactRouterLogo} toLogo={tanstackLogo} />
    </div>
    <Footer />
  </section>
);

function BentoCell({ children, column, row, accent = false, size = 44, mono = false, background }: { children: ReactNode; column: string; row: string; accent?: boolean; size?: number; mono?: boolean; background?: ReactNode }) {
  return (
    <div style={{ position: 'relative', gridColumn: column, gridRow: row, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, boxSizing: 'border-box', borderRadius: 24, border: `1px solid ${accent ? 'var(--osd-accent)' : border}`, background: accent ? 'color-mix(in oklch, var(--osd-accent) 12%, var(--osd-bg))' : surface, color: accent ? 'var(--osd-accent)' : 'var(--osd-text)', textAlign: 'center', fontFamily: mono ? 'Menlo, Consolas, monospace' : 'var(--osd-font-display)', fontSize: size, lineHeight: 1.3, fontWeight: 650, letterSpacing: '-0.025em' }}>
      {background}
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  );
}

function BentoTool({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 84, padding: '12px 20px', boxSizing: 'border-box', borderRadius: 12, background: 'var(--osd-bg)', border: `1px solid ${border}`, color: 'var(--osd-text)', fontSize: 30, lineHeight: 1.3, fontWeight: 500, fontFamily: mono ? 'Menlo, Consolas, monospace' : 'var(--osd-font-body)' }}>{children}</div>;
}

const ClosingBento: Page = () => (
  <section style={{ width: '100%', height: '100%', boxSizing: 'border-box', padding: 120, background: 'var(--osd-bg)', fontFamily: 'var(--osd-font-body)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gridTemplateRows: 'repeat(4, minmax(0, 1fr))', gap: 24, height: 840 }}>
      <BentoCell column="1 / 3" row="1 / 4" size={56}>
        <div style={{ marginBottom: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
          <span>Boîte à outils</span>
          <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="TypeScript" style={{ flexShrink: 0 }}>
            <rect width="64" height="64" rx="2" fill="#3178c6" />
            <text x="59" y="55" textAnchor="end" fill="#fff" fontFamily="Arial, sans-serif" fontSize="36" fontWeight="700" letterSpacing="-2">TS</text>
          </svg>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 330px)', gap: 16 }}>
          <BentoTool mono>T</BentoTool>
          <BentoTool mono>const T</BentoTool>
          <BentoTool mono>keyof</BentoTool>
          <BentoTool mono>T[K]</BentoTool>
          <BentoTool>Template literals</BentoTool>
          <BentoTool mono>infer</BentoTool>
          <BentoTool>Mapped types</BentoTool>
          <BentoTool>Types conditionnels</BentoTool>
        </div>
      </BentoCell>
      <BentoCell column="3 / 5" row="1" size={52}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none" stroke={muted} strokeWidth="3" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M32 32L17 17M48 32L63 17M32 48L17 63M48 48L63 63" />
            <circle cx="40" cy="40" r="12" fill={muted} stroke="none" />
            <circle cx="12" cy="12" r="7" /><circle cx="68" cy="12" r="7" />
            <circle cx="12" cy="68" r="7" /><circle cx="68" cy="68" r="7" />
          </svg>
          <span>Source de vérité unique</span>
        </div>
      </BentoCell>
      <BentoCell column="3" row="2" size={40}>Factory / Builder</BentoCell>
      <BentoCell column="4" row="2" size={40} background={
        <svg viewBox="0 0 540 350" preserveAspectRatio="none" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', borderRadius: 24, opacity: 0.33, pointerEvents: 'none' }}>
          <ComplexityDrawing transform="translate(10 5)" />
        </svg>
      }>
        Complexité<br />encapsulée
      </BentoCell>
      <BentoCell column="3" row="3" size={52}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#4ade80" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="24" cy="24" r="20" /><path d="M14 24L21 31L34 17" />
          </svg>
          <span>TDD</span>
        </div>
        <code style={{ fontSize: 28, color: muted }}>expectTypeOf</code>
      </BentoCell>
      <BentoCell column="4" row="3 / 5" size={43}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 32 }}>
          <img src={codexLogo} alt="Codex" style={{ width: 72, height: 72, objectFit: 'contain' }} />
          <img src={claudeLogo} alt="Claude" style={{ width: 80, height: 80, objectFit: 'contain' }} />
          <img src={cursorLogo} alt="Cursor" style={{ width: 72, height: 72, objectFit: 'contain' }} />
        </div>
        Prompt<br />engineering
      </BentoCell>
      <BentoCell column="1 / 3" row="4" size={48}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <div>
            <svg width="48" height="48" viewBox="0 0 180 180" fill="none" stroke={muted} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: '0 auto 10px' }}>
              <path d="M54 24H24V54M126 24H156V54M24 126V156H54M156 126V156H126" />
              <rect x="62" y="62" width="56" height="56" rx="8" fill={muted} stroke="none" />
            </svg>
            Capturer
          </div>
          <span style={{ color: muted }}>→</span>
          <div>
            <svg width="48" height="48" viewBox="0 0 180 180" fill="none" stroke={muted} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', margin: '0 auto 10px' }}>
              <rect x="18" y="70" width="40" height="40" rx="6" fill={muted} stroke="none" />
              <path d="M58 90H96M96 90V40H134M96 90V140H134" />
              <rect x="134" y="22" width="36" height="36" rx="6" />
              <rect x="134" y="122" width="36" height="36" rx="6" />
            </svg>
            Exploiter
          </div>
        </div>
      </BentoCell>
      <BentoCell column="3" row="4" size={64}>DX</BentoCell>
    </div>
  </section>
);

export const transition: SlideTransition = {
  duration: 240,
  enter: { easing: 'cubic-bezier(0, 0, 0.2, 1)', keyframes: [{ opacity: 0 }, { opacity: 1 }] },
};
export const notes = [
  'On peut concevoir une API TypeScript qui se consomme comme du JavaScript, avec l’autocomplétion et la vérification des types. L’utilisateur n’a pas à répéter dans des types ce que son code indique déjà. L’exemple sera un petit catalogue de messages ; la gestion complète des langues reste hors du périmètre.',
  undefined,
  'Avec const age: number = 18, je précise le type number par une annotation. TypeScript peut déjà le déduire de la valeur 18. Ne pas appeler cette annotation un cast.',
  'C’est un peu comme coller une étiquette CAT sur un chat. Merci, on avait reconnu. Ici, l’annotation répète une information déjà évidente dans la valeur. Laisser le temps à la salle de voir l’image, puis avancer vers la version sans annotation. Le propos porte sur cette annotation redondante, pas sur toutes les annotations de types.',
  'Déduire un type à partir du code, c’est l’inférence. Survoler age si utile : avec const, TypeScript connaît même la valeur exacte, le type littéral 18. Ne pas ouvrir une parenthèse sur le widening à ce stade.',
  'L’inférence peut aussi servir à suggérer les arguments d’une fonction et à détecter les appels invalides, sans annotation côté consommateur. On va le voir avec une API de traductions.',
  'On définit le catalogue français d’une application : une clé stable, comme welcome, associée au texte à afficher. createMessages reçoit ce dictionnaire ; messages.t("welcome") retrouve Bonjour !. Prendre le temps de poser cet usage avant de regarder la faute de frappe. Notre première version accepte aussi welcomme, car elle attend seulement un string. Il faut restreindre les appels aux clés présentes dans le dictionnaire. On se limite au catalogue et à son utilisation, sans aborder la gestion des langues d’une bibliothèque i18n complète.',
  'Avec une version générique de la fonction, on peut décrire les clés autorisées. La faute de frappe est maintenant soulignée. Mais welcome et goodbye sont écrits deux fois : dans le type et dans l’objet. Ici, on a changé la signature de la bibliothèque, pas seulement ajouté une annotation à la version naïve. Rester bref, pas de cours sur les generics.',
  'On retire le générique explicite : la même signature déduit les clés depuis l’objet. Les mêmes erreurs restent détectées. Comme pour age, l’information est déjà dans la valeur. Le contenu des messages peut aussi nous renseigner sur les paramètres attendus.',
  'On veut maintenant personnaliser les messages. Les clés restent inférées et vérifiées : essayer welcomme si nécessaire. Mais params est un dictionnaire optionnel. Les trois appels affichés compilent, même username et le paramètre absent. On sait quel message existe ; on ne sait pas encore ce qu’il attend. Les diagnostics sont réels, le code n’est pas exécuté. Échap rend le clavier à la présentation.',
  'Cette version de l’API accepte un contrat manuel : le générique décrit les paramètres par clé, et never signifie aucun paramètre. Survoler t. Dans le dernier appel, remplacer name par username pour voir l’erreur, puis retirer le deuxième argument. Restaurer name ou réinitialiser. Ça fonctionne, mais les noms des paramètres sont écrits à deux endroits. On utilise string | number : le nom count ne suffit pas à inférer un type numérique.',
  'On supprime la description manuelle : les messages définissent eux-mêmes leurs paramètres. Survoler les deux erreurs, corriger username avec l’autocomplétion, puis modifier {name} en {firstName} dans le dictionnaire. Cette fois, l’appel avec name devient invalide et firstName est suggéré. Comme pour les clés, les types sont déduits du dictionnaire. Ici, on extrait les noms entre accolades dans les strings, sans type explicite ni as const côté consommateur.',
  'Pour obtenir ce comportement, createMessages doit conserver les types littéraux des messages, en déduire les paramètres et vérifier les appels. Deux étapes permettent de concevoir cette API : capturer l’information, puis l’exploiter pour définir les appels autorisés. L’implémentation cible est disponible dans le fichier assets/create-messages.ts du deck, avec les versions loose et manual.',
  'Deux étapes : capturer l’information depuis les valeurs, puis l’exploiter pour dériver le contrat de notre API. Pas besoin de retenir une implémentation : le but est de reconnaître les outils utiles et les relations à demander à un agent. On commence par capturer.',
  'Le design runtime de l’API prépare l’inférence. En haut : une configuration globale ne spécialise pas automatiquement le type de la fonction t utilisée ailleurs ; une factory retourne une instance dont le type peut capturer le catalogue reçu. catalogue désigne ici notre dictionnaire de traductions. En bas : les mutations ordinaires ne font pas automatiquement évoluer le type de messages ; dans un builder chaîné, chaque retour peut porter un type enrichi, utilisé par l’étape suivante. Les deux formes peuvent offrir le même comportement runtime. Ces exemples comparent des designs, pas des implémentations exécutables. Les badges concernent notre objectif d’inférence locale, pas une interdiction générale de ces patterns. Les bonnes formes ne suffisent pas : leurs signatures doivent préserver et exploiter les informations. C’est ce que nous allons voir.',
  'Commençons par une signature plausible : un dictionnaire de chaînes. Le consommateur passe bien welcome et goodbye, avec le texte Bonjour {name} !. Mais à l’intérieur de la fonction, dictionary est seulement un Record<string, string>. keyof typeof dictionary vaut string, et le message welcome est typé string. La valeur à l’exécution n’a pas changé : c’est la signature qui ne conserve pas ses détails. On ne peut pas construire notre contrat précis à partir de ce seul type. createDictionary renvoie le dictionnaire pour rendre son type observable. Survoler la constante dictionary : les clés et les valeurs exactes ont été effacées par l’annotation.',
  'On remplace l’annotation générale par un paramètre de type T. extends impose toujours un dictionnaire de chaînes, mais T est inféré depuis l’objet reçu. Pour cet objet passé directement à createDictionary, les clés sont maintenant welcome et goodbye. Survoler la constante dictionary pour voir les propriétés inférées. En revanche, T["welcome"] reste string : les propriétés de cet objet peuvent être modifiées, donc leur texte est élargi. On a récupéré les clés, pas encore le nom du paramètre. Le consommateur n’a rien changé et n’a écrit aucun générique.',
  'On ajoute const devant T : les types affichés au survol viennent du vrai service TypeScript de Monaco. Ce modificateur conserve les valeurs littérales de l’objet passé directement à la fonction, sans as const côté consommateur ; il ne gèle pas l’objet à l’exécution et ne récupère pas une valeur déjà élargie en string. Cette fonction renvoie uniquement le dictionnaire pour rendre T observable, elle ne remplace pas notre API complète. Survoler la constante dictionary : son type révèle les clés welcome et goodbye ainsi que leurs valeurs littérales, dont "Bonjour {name} !". createDictionary distingue cette démonstration de l’API createMessages de la première partie. Retirer const devant T dans l’éditeur, puis refaire les survols : les clés restent connues, mais welcome devient string. Restaurer const ou utiliser Réinitialiser. Les changements restent propres à cette page. Échap rend le clavier à la présentation. Monaco nécessite un accès à cdn.jsdelivr.net.',
  'L’information est capturée. Passons à Exploiter : utiliser les clés et les textes conservés pour déduire les appels autorisés.',
  'Nous avons capturé les détails du dictionnaire. Maintenant, exploitons-les. keyof transforme les clés de son type en choix possibles pour messages.t. Retenir la possibilité, pas une signature : demandez à votre agent de dériver les choix autorisés depuis les données plutôt que de maintenir une liste parallèle.',
  'Le choix de welcome nous donne le texte de welcome, pas un texte quelconque du catalogue. L’outil est un type indexé, T[K]. Cette relation permettra de demander name pour welcome et count pour unread. Même mécanique pour un nom d’événement et son payload : les arguments ne sont pas indépendants.',
  'Puisque le texte exact a été conservé, TypeScript peut reconnaître les accolades et en extraire les noms. Les outils à connaître sont les template literal types et infer. On peut répéter cette extraction pour plusieurs placeholders ; inutile de détailler la récursion ici. Cela fonctionne sur une chaîne littérale connue, pas sur un simple string obtenu à l’exécution. Même idée avec les paramètres d’un chemin de route.',
  'Un mapped type transforme chaque nom extrait en propriété attendue. On obtient la forme du paramètre sans la déclarer une seconde fois. Attention : count ne veut pas automatiquement dire number. Accepter string ou number est ici notre décision de conception, pas une information déduite du nom.',
  'Dernière adaptation : aucun placeholder, aucun argument de paramètres ; des placeholders, un objet obligatoire. Les types conditionnels permettent ce choix. never représente ici l’absence de noms extraits, pas un paramètre à fournir. Le modèle mental est : données, choix possibles, information sélectionnée, contrat dérivé. Vous pouvez décrire cette chaîne à un agent sans mémoriser la syntaxe. Si le temps le permet, revenir à la démo consommateur et remplacer name par firstName pour montrer que tout suit.',
  'Voici comment les outils se rejoignent pour définir le contrat de notre API. Les types déduits deviennent les types des paramètres : TypeScript vérifie alors les appels, sans validation à l’exécution. Pas besoin de retenir chaque symbole de cette signature. Le code provient directement de assets/create-messages.ts ; seules des régions de repli et des coupures de ligne sont ajoutées. Les utilitaires et le remplacement runtime sont repliés au départ. Montrer const M, key: K & keyof M, puis Arguments<M[K]>. Survoler les types ou déplier les régions avec les chevrons si utile. Réinitialiser restaure le code et les replis ; Échap rend le clavier à la présentation.',
  'Laisser la salle regarder le mème. Invisible… côté utilisateur ! La complexité n’a pas disparu : on l’a déplacée côté auteur. Et dans un monde où les agents écrivent de plus en plus de code, est-ce que cet effort en vaut encore la peine ? Transition vers la discussion sur le vibe coding, sans donner la réponse tout de suite.',
  'Première réponse à la question de la complexité : elle est localisée. Placeholders, Values et Arguments sont implémentés ensemble dans create-messages.ts. Le code métier utilise le résultat à travers une API simple ; il ne réécrit ni les génériques ni les conditionnels à chaque appel. Les règles se propagent, pas leur implémentation. Cela ne supprime pas le coût de maintenance du module, et des diagnostics trop compliqués peuvent encore nuire à son utilisation : la qualité de cette frontière fait partie du travail de conception. Mais ce coût peut être mutualisé sur tous les usages. Nous pourrons ensuite montrer comment tester ce contrat.',
  'Lire le diagramme de gauche à droite : nous définissons l’API désirée, l’agent réalise l’implémentation complexe. Nous concentrons la conception sur une interface simple et la DX souhaitée. Pas besoin de savoir écrire chaque type de mémoire : il faut savoir ce qui est possible pour le demander et évaluer le résultat. Cette DX n’est pas garantie par défaut ; notre intention doit être explicite. Déléguer ne dispense pas de vérifier : la slide suivante montre les tests de types.',
  'Avec Vitest, expectTypeOf spécifie le contrat attendu. Pour welcome, les arguments comprennent la clé et un objet name obligatoire ; pour goodbye, la clé seule. t<"welcome"> spécialise la fonction pour inspecter ce cas dans le test, sans rendre les génériques nécessaires dans le code métier. Remplacer {name} par {firstName} : le premier test échoue dans les diagnostics TypeScript. Mettre à jour le contrat attendu ou réinitialiser. Ces tests peuvent guider un agent et sécuriser le refactoring, sans remplacer les tests runtime. Dans un projet, utiliser un fichier .test-d.ts et vitest --typecheck. Ici, les vraies déclarations expect-type 1.2.2 sont exposées via une façade de typage vitest : Monaco vérifie les assertions, mais aucun runner Vitest ne tourne dans le navigateur.',
  'Pour une bibliothèque ou un framework, la DX est une part centrale du produit. Une meilleure expérience de typage peut donc constituer une raison de choisir ou de créer une alternative. Ces flèches illustrent des positionnements, pas une migration obligatoire ni une supériorité universelle : Yup offre aussi du typage ; REST peut être consommé via des clients générés et typés ; React Router et TanStack Start ne sont pas strictement équivalents et couvrent des usages différents. Le propos est le poids différenciant accordé à la type safety et à l’inférence, pas une explication unique de leur succès. Logos téléchargés depuis le catalogue api.svgl.app : Zod, tRPC, React Router et logo de famille TanStack pour Start. Yup et REST ne figuraient pas dans ce catalogue lors de la création : noms affichés sans logo.',
];
export const meta: SlideMeta = {
  title: 'Rendre TypeScript invisible',
  createdAt: '2026-10-02T08:39:03.778Z',
};
export default [Intro, InferenceSection, AnnotatedAge, RedundantAnnotation, InferredAge, InferenceQuestion, NaiveKeys, ExplicitKeys, InferredKeys, LooseParams, ManualParams, InferredParams, UnderTheHood, InferenceMethod, DesignForInference, ErasedInformation, CapturedKeys, CapturedLiteralsLive, ExploitMethod, ExploitKeys, ExploitSelection, ExploitText, ExploitShape, ExploitArguments, AssembledContractLive, InvisibleMeme, EncapsulatedComplexity, AgentImplementation, TestTheTypes, DifferentiatingDx, ClosingBento] satisfies Page[];
