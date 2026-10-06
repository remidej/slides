import { useEffect, useRef } from 'react';
import { useIsActivePage, type DesignSystem, type Page, type SlideMeta, type SlideTransition } from '@open-slide/core';
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
type DemoId = 'age-annotated' | 'age-inferred' | 'keys-naive' | 'keys-explicit' | 'keys-inferred' | 'loose' | 'manual' | 'authority' | 'inferred';
type DemoState = { files: Record<string, string>; activeFile: string };
// Live changes survive page navigation, but never write to the source files.
const sessions = new Map<DemoId, DemoState>();

function Editor({ id, code, entry, height = 682, fontSize = 32 }: { id: DemoId; code: string; entry: string; height?: number; fontSize?: number }) {
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
        const files = id.startsWith('age-')
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
  }, [active, id, code, entry, fontSize]);
  return (
    <div ref={focusTarget} tabIndex={-1} style={{ outline: 'none', height, border: `1px solid ${border}`, borderRadius: 'var(--osd-radius)', background: surface, boxShadow: '0 24px 70px #00000020' }}>
      {active ? (
        <iframe ref={frame} title={`Éditeur TypeScript — ${id}`} srcDoc={editorDocument}
          style={{ display: 'block', width: '100%', height: '100%', border: 0, borderRadius: 'var(--osd-radius)' }} />
      ) : (
        <>
          <div style={{ height: 60, padding: '14px 28px', boxSizing: 'border-box', fontSize: 24, color: 'var(--osd-accent)', borderBottom: `1px solid ${border}` }}>{entry}</div>
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

function DemoPage({ id, title, code, entry, label = 'LES PARAMÈTRES' }: { id: DemoId; title: string; code: string; entry: string; label?: string }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', height: 26, fontSize: 22, lineHeight: '26px', color: muted, letterSpacing: '0.09em' }}>
        <span style={{ color: 'var(--osd-accent)' }}>{label}</span>
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

function InferenceIntro({ annotated, showCat = false }: { annotated: boolean; showCat?: boolean }) {
  return (
    <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
      <h1 style={{ fontSize: 88, lineHeight: '108px', fontWeight: 650, letterSpacing: '-0.035em', margin: '0 0 56px' }}>{annotated ? 'On peut écrire le type…' : '…ou laisser TypeScript le déduire'}</h1>
      <Editor id={annotated ? 'age-annotated' : 'age-inferred'} code={annotated ? 'const age: number = 18;' : 'const age = 18;'} entry="demo.ts" height={260} fontSize={64} />
      <p style={{ margin: '40px 0 0', fontSize: 40, lineHeight: '60px', color: muted }}>{annotated ? 'Une valeur. Une annotation.' : 'Déduire le type à partir de la valeur : c’est l’inférence.'}</p>
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
    <h1 style={{ fontFamily: 'var(--osd-font-display)', fontSize: 104, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em', margin: 0 }}>
      Comment profiter de l’inférence<br />
      dans une <span style={{ color: 'var(--osd-accent)' }}>API plus complexe</span> ?
    </h1>
    <Footer />
  </section>
);

const NaiveKeys: Page = () => <DemoPage id="keys-naive" title="Prenons une API de traductions" code={naiveKeys} entry="demo.ts" label="UN EXEMPLE CONCRET" />;
const ExplicitKeys: Page = () => <DemoPage id="keys-explicit" title="On peut déclarer les clés…" code={explicitKeys} entry="demo.ts" label="LES CLÉS" />;
const InferredKeys: Page = () => <DemoPage id="keys-inferred" title="…ou les déduire du dictionnaire" code={inferredKeys} entry="demo.ts" label="LES CLÉS" />;

const LooseParams: Page = () => <DemoPage id="loose" title="Et si on personnalisait les messages ?" code={loose} entry="demo.ts" />;
const ManualParams: Page = () => <DemoPage id="manual" title="Décrire les paramètres à la main" code={manual} entry="demo.ts" />;
const Authority: Page = () => <DemoPage id="authority" title="Quel contrat fait autorité ?" code={manual} entry="demo.ts" label="LES PARAMÈTRES · À L’ÉPREUVE DU CHANGEMENT" />;
const InferredParams: Page = () => <DemoPage id="inferred" title="Déduire plutôt que déclarer" code={inferred} entry="demo.ts" />;

const UnderTheHood: Page = () => (
  <section style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', padding: '100px 120px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--osd-bg)', color: 'var(--osd-text)', fontFamily: 'var(--osd-font-body)' }}>
    <div style={{ fontSize: 24, color: 'var(--osd-accent)', letterSpacing: '0.09em' }}>CÔTÉ AUTEUR</div>
    <h1 style={{ fontSize: 112, lineHeight: '132px', fontWeight: 650, letterSpacing: '-0.035em', margin: '32px 0 48px' }}>Où sont passés les types ?</h1>
    <p style={{ fontSize: 48, lineHeight: '72px', color: muted, margin: 0 }}>Capturer → Propager → Contraindre</p>
    <Footer />
  </section>
);

export const transition: SlideTransition = {
  duration: 240,
  enter: { easing: 'cubic-bezier(0, 0, 0.2, 1)', keyframes: [{ opacity: 0 }, { opacity: 1 }] },
};
export const notes = [
  'Et si une API TypeScript pouvait se consommer comme du JavaScript, sans perdre l’autocomplétion ni la sécurité des types ? Pas enlever TypeScript : enlever le travail de typage répétitif côté utilisateur. On va prendre un petit catalogue de messages, pas une bibliothèque i18n complète.',
  'Partons de quelque chose de très simple. Je peux écrire const age: number = 18. La valeur est 18, et je précise le type avec une annotation. Mais est-ce que TypeScript a vraiment besoin que je lui dise que c’est un nombre ? Ne pas appeler cette annotation un cast.',
  'C’est un peu comme coller une étiquette CAT sur un chat. Merci, on avait reconnu. Ici, l’annotation répète une information déjà évidente dans la valeur. Laisser le temps à la salle de voir l’image, puis avancer vers la version sans annotation. Le propos porte sur cette annotation redondante, pas sur toutes les annotations de types.',
  'Non : la valeur lui suffit. Déduire un type à partir du code, c’est l’inférence. On l’utilise déjà tous les jours. Survoler age si utile : avec const, TypeScript connaît même la valeur exacte, le type littéral 18. Ne pas ouvrir une parenthèse sur le widening à ce stade.',
  'Pour une variable, on profite naturellement de l’inférence. Comment retrouver cette simplicité quand on utilise une API plus complexe ? Peut-on obtenir des suggestions et détecter les erreurs sans demander au consommateur de tout annoter ? Pour explorer cette question, on va construire une petite API de traductions.',
  'Prenons une application qui affiche des textes traduits. On définit ici son catalogue français : une clé stable, comme welcome, associée au texte à afficher. createMessages reçoit ce dictionnaire ; messages.t("welcome") retrouve Bonjour !. Prendre le temps de poser cet usage avant de regarder la faute de frappe. Notre première version accepte aussi welcomme : elle attend seulement un string. Voilà ce que nous allons améliorer. On se limite au catalogue et à son utilisation, pas à la gestion des langues d’une bibliothèque i18n complète.',
  'Avec une version générique de la fonction, on peut décrire les clés autorisées. La faute de frappe est maintenant soulignée. Mais welcome et goodbye sont écrits deux fois : dans le type et dans l’objet. Ici, on a changé la signature de la bibliothèque, pas seulement ajouté une annotation à la version naïve. Rester bref, pas de cours sur les generics.',
  'On retire simplement le générique explicite : la même signature déduit les clés depuis l’objet. Les mêmes erreurs restent détectées. Comme pour age, l’information est déjà dans la valeur. Pour les clés, c’est familier. Maintenant, est-ce qu’on peut faire pareil avec le contenu des messages ?',
  'On veut maintenant personnaliser les messages. Les clés restent inférées et vérifiées : essayer welcomme si nécessaire. Mais params est un dictionnaire optionnel. Les trois appels affichés compilent, même username et le paramètre absent. On sait quel message existe ; on ne sait pas encore ce qu’il attend. Les diagnostics sont réels, le code n’est pas exécuté. Échap rend le clavier à la présentation.',
  'Cette version de l’API accepte un contrat manuel : le générique décrit les paramètres par clé, et never signifie aucun paramètre. Survoler t. Dans le dernier appel, remplacer name par username pour voir l’erreur, puis retirer le deuxième argument. Restaurer name ou réinitialiser. Ça fonctionne, mais les noms des paramètres sont écrits à deux endroits. On utilise string | number : le nom count ne suffit pas à inférer un type numérique.',
  'Démo live : cette page démarre volontairement sans divergence et sans erreur. Modifier uniquement Bonjour {name} en Bonjour {firstName} dans le dictionnaire, sans toucher au type ni à l’appel. Le dernier appel reste accepté. Le compilateur fait confiance à mon type, mais mon type n’est plus d’accord avec mon message. Le runtime laisserait ici {firstName} non remplacé. Les modifications restent propres à cette page ; Réinitialiser restaure le point de départ.',
  'On supprime la description manuelle : les messages définissent eux-mêmes leurs paramètres. Survoler les deux erreurs, corriger username avec l’autocomplétion, puis modifier {name} en {firstName} dans le dictionnaire. Cette fois, l’appel avec name devient invalide et firstName est suggéré. Même principe que pour les clés, sauf qu’on extrait maintenant l’information à l’intérieur des strings. Aucun type explicite, aucun as const côté consommateur.',
  'Les types n’ont pas disparu : leur complexité a été déplacée derrière l’API. Passons côté auteur. Il faut capturer les valeurs sans perdre les littéraux, propager cette information jusqu’aux paramètres, puis contraindre les appels. L’implémentation cible est disponible dans create-messages.ts ; les versions loose et manual sont aussi consultables dans les éditeurs.',
];
export const meta: SlideMeta = {
  title: 'Rendre TypeScript invisible — Ça ressemble à quoi ?',
  createdAt: '2026-10-02T08:39:03.778Z',
};
export default [Intro, AnnotatedAge, RedundantAnnotation, InferredAge, InferenceQuestion, NaiveKeys, ExplicitKeys, InferredKeys, LooseParams, ManualParams, Authority, InferredParams, UnderTheHood] satisfies Page[];
