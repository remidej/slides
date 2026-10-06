import { useEffect, useRef, type ReactNode } from 'react';
import { Step, Steps, useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
import editorDocument from './assets/editor.html?raw';
import catLabel from './assets/cat-label.png';

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
type DemoId = 'age-annotated' | 'age-inferred' | 'keys-naive' | 'keys-explicit' | 'keys-inferred' | 'loose' | 'manual' | 'authority' | 'inferred' | 'capture-erased' | 'capture-keys' | 'capture-literals';
type DemoState = { files: Record<string, string>; activeFile: string };
// Live changes survive page navigation, but never write to the source files.
const sessions = new Map<DemoId, DemoState>();

function Editor({ id, code, entry, height = 682, fontSize = 32, standalone = false }: { id: DemoId; code: string; entry: string; height?: number; fontSize?: number; standalone?: boolean }) {
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
          kind: 'invisible:init', files, types, entry, fontSize,
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
  }, [active, id, code, entry, fontSize, standalone]);
  return (
    <div ref={focusTarget} tabIndex={-1} style={{ outline: 'none', height, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface, boxShadow: '0 24px 70px #00000020' }}>
      {active ? (
        <iframe ref={frame} title={`Éditeur TypeScript — ${id}`} srcDoc={editorDocument}
          style={{ display: 'block', width: '100%', height: '100%', border: 0, borderRadius: 'var(--osd-radius)' }} />
      ) : (
        <>
          <pre style={{ margin: 0, padding: '30px 36px', fontSize, lineHeight: `${Math.round(fontSize * 1.375)}px`, color: 'var(--osd-text)', fontFamily: 'Menlo, Consolas, monospace', whiteSpace: 'pre-wrap' }}>{code}</pre>
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
        <span style={{ display: 'inline-block', flexShrink: 0, padding: '6px 18px', background: avoid ? '#fb923c' : 'var(--osd-accent)', color: avoid ? '#431407' : '#042f2e', borderRadius: 6, fontSize: 28, lineHeight: '38px', fontWeight: 700, letterSpacing: '0.04em', transform: 'rotate(-4deg)', boxShadow: '0 5px 12px #00000030' }}>{avoid ? 'À ÉVITER' : 'SOLUTION'}</span>
        <p style={{ margin: 0, fontSize: 40, lineHeight: '60px', color: 'var(--osd-text)' }}>{title}</p>
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

function InferenceIntro({ annotated, showCat = false }: { annotated: boolean; showCat?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <SectionLabel>CÔTÉ UTILISATEUR</SectionLabel>
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

const NaiveKeys: Page = () => <DemoPage id="keys-naive" avoid title="Des clés inconnues sont acceptées" code={naiveKeys} entry="demo.ts" />;
const ExplicitKeys: Page = () => <DemoPage id="keys-explicit" avoid title="Déclarer les clés à la main" code={explicitKeys} entry="demo.ts" />;
const InferredKeys: Page = () => <DemoPage id="keys-inferred" title="Utiliser le dictionnaire fourni pour contraindre l'API" code={inferredKeys} entry="demo.ts" />;

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
    <div style={{ fontSize: 24, color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>CÔTÉ AUTEUR</div>
    <h1 style={{ fontSize: 112, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em', margin: '32px 0 48px' }}>Comment concevoir ses API<br />pour l'inférence</h1>
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
    <SectionLabel>CÔTÉ AUTEUR — CAPTURER</SectionLabel>
    <div style={{ position: 'absolute', top: 350, left: 120, display: 'flex', alignItems: 'center', gap: 24 }}>
      <MethodStage label="Capturer" active>
        <path d="M54 24H24V54M126 24H156V54M24 126V156H54M156 126V156H126" />
        <rect x="62" y="62" width="56" height="56" rx="8" fill="currentColor" stroke="none" />
      </MethodStage>
      <MethodArrow />
      <MethodStage label="Propager">
        <rect x="18" y="70" width="40" height="40" rx="6" fill="currentColor" stroke="none" />
        <path d="M58 90H96M96 90V40H134M96 90V140H134" />
        <rect x="134" y="22" width="36" height="36" rx="6" />
        <rect x="134" y="122" width="36" height="36" rx="6" />
      </MethodStage>
      <MethodArrow />
      <MethodStage label="Contraindre">
        <path d="M22 28H158L112 88V118H68V88Z" />
        <path d="M68 150L84 166L116 134" />
      </MethodStage>
    </div>
    <Footer />
  </section>
);

function AuthorPage({ title, children, takeaway, live = false }: { title: ReactNode; children: ReactNode; takeaway: ReactNode; live?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <div style={{ fontSize: 24, lineHeight: '30px', color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>CÔTÉ AUTEUR — CAPTURER</div>
      <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 78, lineHeight: '94px', fontWeight: 650, letterSpacing: '-0.035em', margin: '24px 0 32px' }}>{title}</h1>
      {children}
      <p style={{ fontSize: 40, lineHeight: '60px', color: live ? '#ffffff' : muted, margin: live ? '24px 0 0' : '48px 0 0' }}>{takeaway}</p>
      <Footer />
    </section>
  );
}

const erasedInformationDemo = `function createDictionary(
  dictionary: Record<string, string>
) { return dictionary; }

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const capturedKeysDemo = `function createDictionary<
  T extends
    Record<string, string>
>(dictionary: T) { return dictionary; }

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const ErasedInformation: Page = () => (
  <AuthorPage live title="Ne surtout pas perdre l'information" takeaway={<>Une annotation <code>Record&lt;string, string&gt;</code> efface les clés et les valeurs exactes.</>}>
    <Editor id="capture-erased" code={erasedInformationDemo} entry="capture.ts" height={540} fontSize={32} standalone />
  </AuthorPage>
);

const CapturedKeys: Page = () => (
  <AuthorPage live title="Conserver les clés" takeaway={<>Un générique <code>T</code> capture les clés ; les valeurs restent des <code>string</code>.</>}>
    <Editor id="capture-keys" code={capturedKeysDemo} entry="capture.ts" height={540} fontSize={32} standalone />
  </AuthorPage>
);

// Return the dictionary only to inspect the captured T; this is not the full API.
const captureLiteralsDemo = `function createDictionary<
  const T extends
    Record<string, string>
>(dictionary: T) { return dictionary; }

const dictionary = createDictionary({
  welcome: "Bonjour {name} !",
  goodbye: "À bientôt !",
});`;

const CapturedLiteralsLive: Page = () => (
  <AuthorPage live title="Conserver les valeurs" takeaway={<>Un générique capture les clés ; <code>const</code> préserve les valeurs littérales.</>}>
    <Editor id="capture-literals" code={captureLiteralsDemo} entry="capture.ts" height={540} fontSize={32} standalone />
  </AuthorPage>
);

export const transition: SlideTransition = {
  duration: 240,
  enter: { easing: 'cubic-bezier(0, 0, 0.2, 1)', keyframes: [{ opacity: 0 }, { opacity: 1 }] },
};
export const notes = [
  'On peut concevoir une API TypeScript qui se consomme comme du JavaScript, avec l’autocomplétion et la vérification des types. L’utilisateur n’a pas à répéter dans des types ce que son code indique déjà. L’exemple sera un petit catalogue de messages ; la gestion complète des langues reste hors du périmètre.',
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
  'Pour obtenir ce comportement, createMessages doit conserver les types littéraux des messages, en déduire les paramètres et vérifier les appels. Ce sont les trois étapes indiquées ici : capturer, propager, contraindre. L’implémentation cible est disponible dans le fichier assets/create-messages.ts du deck, avec les versions loose et manual.',
  'Trois étapes pour concevoir une API qui exploite l’inférence : capturer l’information depuis les valeurs, la propager dans les types, puis contraindre les appels avec le contrat obtenu. On commence par capturer.',
  'Commençons par une signature plausible : un dictionnaire de chaînes. Le consommateur passe bien welcome et goodbye, avec le texte Bonjour {name} !. Mais à l’intérieur de la fonction, dictionary est seulement un Record<string, string>. keyof typeof dictionary vaut string, et le message welcome est typé string. La valeur à l’exécution n’a pas changé : c’est la signature qui ne conserve pas ses détails. On ne peut pas construire notre contrat précis à partir de ce seul type. createDictionary renvoie le dictionnaire pour rendre son type observable. Survoler la constante dictionary : les clés et les valeurs exactes ont été effacées par l’annotation.',
  'On remplace l’annotation générale par un paramètre de type T. extends impose toujours un dictionnaire de chaînes, mais T est inféré depuis l’objet reçu. Pour cet objet passé directement à createDictionary, les clés sont maintenant welcome et goodbye. Survoler la constante dictionary pour voir les propriétés inférées. En revanche, T["welcome"] reste string : les propriétés de cet objet peuvent être modifiées, donc leur texte est élargi. On a récupéré les clés, pas encore le nom du paramètre. Le consommateur n’a rien changé et n’a écrit aucun générique.',
  'On ajoute const devant T : les types affichés au survol viennent du vrai service TypeScript de Monaco. Ce modificateur conserve les valeurs littérales de l’objet passé directement à la fonction, sans as const côté consommateur ; il ne gèle pas l’objet à l’exécution et ne récupère pas une valeur déjà élargie en string. Cette fonction renvoie uniquement le dictionnaire pour rendre T observable, elle ne remplace pas notre API complète. Survoler la constante dictionary : son type révèle les clés welcome et goodbye ainsi que leurs valeurs littérales, dont "Bonjour {name} !". createDictionary distingue cette démonstration de l’API createMessages de la première partie. Retirer const devant T dans l’éditeur, puis refaire les survols : les clés restent connues, mais welcome devient string. Restaurer const ou utiliser Réinitialiser. Les changements restent propres à cette page. Échap rend le clavier à la présentation. Monaco nécessite un accès à cdn.jsdelivr.net.',
];
export const meta: SlideMeta = {
  title: 'Rendre TypeScript invisible — Ça ressemble à quoi ?',
  createdAt: '2026-10-02T08:39:03.778Z',
};
export default [Intro, AnnotatedAge, RedundantAnnotation, InferredAge, InferenceQuestion, NaiveKeys, ExplicitKeys, InferredKeys, LooseParams, ManualParams, InferredParams, UnderTheHood, InferenceMethod, ErasedInformation, CapturedKeys, CapturedLiteralsLive] satisfies Page[];
