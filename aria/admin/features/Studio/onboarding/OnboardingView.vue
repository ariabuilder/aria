<script setup lang="ts">
import { actions } from "astro:actions";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DbDotGridBackdrop } from "@/components/ui/db-dot-grid-backdrop";
import { useBuilderData } from "@/composables/useBuilderData";

defineOptions({ name: "OnboardingView" });

type Phase = "name" | "locking" | "foundation" | "installing" | "complete";
type Foundation = "blank" | "starter-content";
type StepId = "site-shell" | "collections" | "pages" | "catalog";

const router = useRouter();
const route = useRoute();
const { fetchBuilderData } = useBuilderData();
const phase = ref<Phase>("name");
const siteName = ref("");
const decodedTitle = ref("");
const titleElement = ref<HTMLElement | null>(null);
const titleFontSize = ref<number | null>(null);
const foundation = ref<Foundation>("starter-content");
const activeStepId = ref<StepId | null>(null);
const completedSteps = ref<StepId[]>([]);
const busy = ref(false);
const errorMessage = ref<string | null>(null);
const isHandingOff = ref(false);

const isPreview = computed(() => route.query.preview !== undefined);
const previewPhase = computed<Phase>(() => {
  const value = route.query.preview;
  if (typeof value === "string" && ["name", "foundation", "installing", "complete"].includes(value)) {
    return value as Phase;
  }
  return "foundation";
});

const titleStyle = computed(() =>
  titleFontSize.value ? { fontSize: `${titleFontSize.value}px` } : undefined,
);

const steps = computed<{ id: StepId; label: string }[]>(() =>
  foundation.value === "blank"
    ? [{ id: "site-shell", label: "Preparing your site" }]
    : [
        { id: "site-shell", label: "Preparing your site" },
        { id: "collections", label: "Adding collections" },
        { id: "pages", label: "Adding pages" },
        { id: "catalog", label: "Adding content" },
      ],
);

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, duration));
}

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function fitTitle(): void {
  const title = titleElement.value;
  const container = title?.parentElement;
  if (!title || !container) return;

  const maxWidth = container.clientWidth;
  const maxFontSize = Math.min(96, Math.max(56, window.innerWidth * 0.08));
  title.style.fontSize = `${maxFontSize}px`;
  const naturalWidth = title.scrollWidth;
  if (!naturalWidth) return;

  titleFontSize.value = Math.max(
    18,
    Math.min(maxFontSize, Math.floor((maxWidth / naturalWidth) * maxFontSize)),
  );
}

async function decodeName(target: string): Promise<void> {
  const glyphs = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const duration = 720;
  const started = performance.now();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduceMotion) {
    decodedTitle.value = target;
    return;
  }

  await new Promise<void>((resolve) => {
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const revealProgress = Math.max(0, (progress - 0.12) / 0.88);
      const easedReveal = 1 - (1 - revealProgress) ** 2;
      const locked = Math.floor(easedReveal * target.length);
      decodedTitle.value = [...target]
        .map((character, index) => {
          if (character === " " || index < locked) return character;
          return glyphs[Math.floor((now / 48 + index * 13) % glyphs.length)];
        })
        .join("");

      if (progress < 1) requestAnimationFrame(tick);
      else {
        decodedTitle.value = target;
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

async function lockName(): Promise<void> {
  const value = siteName.value.trim();
  if (!value || busy.value) return;

  busy.value = true;
  errorMessage.value = null;
  phase.value = "locking";
  // Size against a deliberately wide glyph string before the first frame. This
  // keeps the decoder on a single line even while its letters are changing.
  decodedTitle.value = [...value]
    .map((character) => (character === " " ? " " : "M"))
    .join("");
  await nextTick();
  fitTitle();

  try {
    const persistedName = isPreview.value
      ? Promise.resolve({ error: undefined })
      : actions.onboarding.lockName({ siteName: value });
    const [{ error }] = await Promise.all([
      persistedName,
      decodeName(value),
      wait(800),
    ]);
    if (error) throw error;
    phase.value = "foundation";
  } catch (error) {
    phase.value = "name";
    errorMessage.value = messageFrom(error, "We couldn't save that site name.");
  } finally {
    busy.value = false;
  }
}

async function launchFoundation(): Promise<void> {
  if (busy.value) return;

  busy.value = true;
  errorMessage.value = null;
  try {
    const { error } = isPreview.value
      ? { error: undefined }
      : await actions.onboarding.startInstall({ foundation: foundation.value });
    if (error) throw error;

    phase.value = "installing";
    completedSteps.value = [];
    for (const step of steps.value) {
      activeStepId.value = step.id;
      const startedAt = performance.now();
      const { error: stepError } = isPreview.value
        ? { error: undefined }
        : await actions.onboarding.installStep({ stepId: step.id });
      if (stepError) throw stepError;
      completedSteps.value.push(step.id);
      await wait(Math.max(0, 430 - (performance.now() - startedAt)));
    }

    const { error: completeError } = isPreview.value
      ? { error: undefined }
      : await actions.onboarding.complete();
    if (completeError) throw completeError;

    activeStepId.value = null;
    phase.value = "complete";
    if (!isPreview.value) {
      await wait(1_400);
      await handoffToDashboard();
    }
  } catch (error) {
    phase.value = "foundation";
    errorMessage.value = messageFrom(error, "Foundation installation failed. Try again.");
  } finally {
    busy.value = false;
  }
}

function returnToName(): void {
  if (busy.value) return;
  phase.value = "name";
}

async function handoffToDashboard(): Promise<void> {
  if (isPreview.value || isHandingOff.value) return;

  isHandingOff.value = true;
  try {
    // The studio gate reads this in-memory snapshot. Refresh it before changing
    // routes so a just-completed onboarding session cannot bounce back here.
    await fetchBuilderData({ force: true, silent: true });
    await router.replace("/dashboard");
  } finally {
    isHandingOff.value = false;
  }
}

async function enterStudio(): Promise<void> {
  await handoffToDashboard();
}

onMounted(async () => {
  window.addEventListener("resize", fitTitle);

  if (isPreview.value) {
    siteName.value =
      typeof route.query.name === "string" && route.query.name.trim()
        ? route.query.name.trim()
        : "Aria Studio";
    decodedTitle.value = siteName.value;
    phase.value = previewPhase.value;
    await nextTick();
    fitTitle();
    if (phase.value === "installing") {
      completedSteps.value = steps.value.map((step) => step.id);
      activeStepId.value = null;
    }
    return;
  }

  const { data, error } = await actions.onboarding.getState();
  if (error || !data) return;
  siteName.value = data.siteName;
  decodedTitle.value = data.siteName;
  await nextTick();
  fitTitle();

  if (data.status === "complete") {
    await handoffToDashboard();
  } else if (data.status === "named" || data.status === "installing") {
    phase.value = "foundation";
  }
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", fitTitle);
});
</script>

<template>
  <main class="onboarding-shell" :data-phase="phase">
    <DbDotGridBackdrop />

    <section class="onboarding-content flex flex-col items-center" aria-live="polite">
      <div class="onboarding-identity w-full max-w-md">
        <form
          v-show="phase === 'name' || phase === 'locking'"
          class="onboarding-name-form"
          :class="phase === 'locking' && 'is-locking'"
          @submit.prevent="lockName"
        >
          <label for="onboarding-site-name">Site name</label>
          <Input
            id="onboarding-site-name"
            v-model="siteName"
            autocomplete="organization"
            autofocus
            class="onboarding-input"
            placeholder="Site name"
            :disabled="busy"
          />
          <Button class="mt-5 font-medium!" size="lg" :disabled="!siteName.trim() || busy" type="submit">
            Continue
          </Button>
        </form>

        <div v-show="phase !== 'name'" class="onboarding-title-wrap">
          <h1 ref="titleElement" class="onboarding-title" :style="titleStyle" :aria-label="siteName">
            <span aria-hidden="true">{{ decodedTitle }}</span>
          </h1>
        </div>
      </div>

      <div v-if="phase === 'foundation'" class="onboarding-stage">
        <div>
          <h2>Choose your starting point</h2>
        </div>

        <div class="onboarding-choice-grid" role="radiogroup" aria-label="Foundation choice">
          <button
            class="onboarding-choice"
            :class="foundation === 'blank' && 'is-selected'"
            role="radio"
            :aria-checked="foundation === 'blank'"
            type="button"
            @click="foundation = 'blank'"
          >
            <span class="onboarding-choice__signal" aria-hidden="true" />
            <strong>Blank start</strong>
            <span>Start with a clean foundation.<br>Home, 404, layouts, and design — no demo content.</span>
          </button>
          <button
            class="onboarding-choice"
            :class="foundation === 'starter-content' && 'is-selected'"
            role="radio"
            :aria-checked="foundation === 'starter-content'"
            type="button"
            @click="foundation = 'starter-content'"
          >
            <span class="onboarding-choice__signal" aria-hidden="true" />
            <strong>Demo content</strong>
            <span>See how Aria works with some demo content.<br>Pages, CMS, Navigation and more.</span>
          </button>
        </div>

        <Button class="font-medium!" size="lg" :disabled="busy" @click="launchFoundation">
          Continue
        </Button>

        <div>
          <Button class="onboarding-back font-medium!" size="xs" variant="ghost" @click="returnToName">
            Start over
          </Button>
        </div>

      </div>

      <div v-else-if="phase === 'installing'" class="onboarding-stage onboarding-install">
        <div>
          <h2>Getting things ready...</h2>
        </div>
        <ol class="onboarding-install__list">
          <li v-for="step in steps" :key="step.id" :class="{
            'is-active': activeStepId === step.id,
            'is-complete': completedSteps.includes(step.id),
          }">
            <span class="onboarding-install__mark" aria-hidden="true" />
            <span>{{ step.label }}</span>
          </li>
        </ol>
      </div>

      <div v-else-if="phase === 'complete'" class="onboarding-complete">
        <h2>All set.</h2>
        <Button class="mt-7 font-medium! max-w-xs" size="lg" @click="enterStudio">
          Enter {{ siteName }}
        </Button>
      </div>

      <p v-if="errorMessage" class="onboarding-error" role="alert">
        {{ errorMessage }}
      </p>
    </section>
  </main>
</template>

<style scoped>
.onboarding-shell {
  position: relative;
  display: grid;
  min-height: 100%;
  place-items: center;
  overflow: hidden;
  background: var(--background);
  color: var(--foreground);
}

.onboarding-content {
  position: relative;
  z-index: 1;
  width: min(100% - 3rem, 680px);
  padding: 4rem 0;
  will-change: transform;
}

/* Adding the foundation panel changes the content's height. Counter the grid
   recentering first, then ease into the new composition instead of snapping. */
[data-phase="foundation"] .onboarding-content {
  animation: onboarding-foundation-settle .78s cubic-bezier(.16, 1, .3, 1) both;
}

.onboarding-kicker {
  margin: 0 0 .75rem;
  color: color-mix(in oklch, var(--muted-foreground) 80%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: .18em;
  text-transform: uppercase;
}

.onboarding-name-form {
  grid-area: 1 / 1;
  max-width: 440px;
  animation: onboarding-enter .55s cubic-bezier(.22, 1, .36, 1) both;
}

.onboarding-identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  min-height: 150px;
  width: 100%;
  max-width: 440px;
  margin: 0 auto;
}

.onboarding-name-form.is-locking {
  pointer-events: none;
  animation: onboarding-input-collapse .46s cubic-bezier(.22, 1, .36, 1) forwards;
}

.onboarding-name-form label {
  display: block;
  margin-bottom: .75rem;
  font-size: 15px;
  letter-spacing: .08em;
  font-weight: 400;
  padding-left: 0.25rem;
  user-select: none;
}

.onboarding-input {
  height: 52px !important;
  border-color: var(--border) !important;
  background: color-mix(in oklch, var(--input) 70%, transparent) !important;
  font-size: 18px !important;
  font-weight: 400 !important;
}

.onboarding-title-wrap {
  grid-area: 1 / 1;
  justify-self: center;
  width: max-content;
  min-height: 104px;
  opacity: 0;
  transform: translateY(12px) scale(.98);
  transform-origin: center;
}

[data-phase="locking"] .onboarding-title-wrap {
  animation: onboarding-title-in .72s cubic-bezier(.16, 1, .3, 1) both;
}

[data-phase="foundation"] .onboarding-title-wrap,
[data-phase="installing"] .onboarding-title-wrap,
[data-phase="complete"] .onboarding-title-wrap {
  opacity: 1;
  transform: none;
}

.onboarding-title {
  max-width: 100%;
  margin: 0;
  font-family: var(--font-sans);
  font-size: clamp(3.5rem, 8vw, 6rem);
  font-weight: 400;
  letter-spacing: -.06em;
  line-height: .9;
  text-align: center;
  white-space: nowrap;
}

[data-phase="locking"] .onboarding-title {
  animation: onboarding-title-decode .72s cubic-bezier(.16, 1, .3, 1) both;
}

.onboarding-title::after {
  display: inline-block;
  width: 2px;
  height: .7em;
  margin-left: .1em;
  background: var(--primary);
  content: "";
  opacity: 0;
  transform: translateY(.05em);
}

[data-phase="locking"] .onboarding-title::after {
  animation: onboarding-decoder-caret .72s steps(2, end) both;
}

.onboarding-stage,
.onboarding-complete {
  display: grid;
  place-items: center;
  gap: 1.75rem;
  margin-top: 3.5rem;
  animation: onboarding-enter .52s .16s cubic-bezier(.16, 1, .3, 1) both;
}

.onboarding-stage h2,
.onboarding-complete h2 {
  margin: 0;
  font-size: clamp(1.5rem, 3vw, 2.1rem);
  font-weight: 500;
  letter-spacing: -.04em;
}

.onboarding-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .75rem;
}

.onboarding-choice {
  position: relative;
  display: grid;
  min-height: 180px;
  gap: .75rem;
  padding: 1.25rem;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: .25rem;
  background: color-mix(in oklch, var(--card) 72%, transparent);
  color: var(--muted-foreground);
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  font-weight: 400;
  transition: border-color .2s ease, background .2s ease, color .2s ease, transform .2s ease;
}

.onboarding-choice:hover,
.onboarding-choice:focus-visible,
.onboarding-choice.is-selected {
  border-color: var(--primary);
  background: color-mix(in oklch, var(--primary) 9%, var(--card));
  color: var(--foreground);
  outline: none;
}

.onboarding-choice:active { transform: scale(.985); }
.onboarding-choice strong { align-self: end; color: var(--foreground); font-size: 15px; font-weight: 500; }
.onboarding-choice span:last-child { font-size: 12px; font-weight: 400; line-height: 1.55; }

.onboarding-choice__signal {
  width: 8px;
  height: 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
}
.onboarding-choice.is-selected .onboarding-choice__signal {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: 0 0 0 5px color-mix(in oklch, var(--primary) 18%, transparent);
}

.onboarding-install__list { display: grid; gap: .75rem; padding: 0; margin: 0; list-style: none; }
.onboarding-install__list li { display: flex; align-items: center; gap: .75rem; color: var(--muted-foreground); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; font-weight: 400; transition: color .2s ease; }
.onboarding-install__list li.is-active, .onboarding-install__list li.is-complete { color: var(--foreground); }
.onboarding-install__mark { width: 10px; height: 10px; border: 1px solid var(--border); border-radius: 50%; }
.is-active .onboarding-install__mark { border-color: var(--primary); box-shadow: 0 0 0 4px color-mix(in oklch, var(--primary) 16%, transparent); animation: onboarding-active 1s ease-in-out infinite; }
.is-complete .onboarding-install__mark { border-color: var(--primary); background: var(--primary); }

.onboarding-complete { animation: onboarding-complete .6s cubic-bezier(.22, 1, .36, 1) both; }
.onboarding-complete p { margin: -.9rem 0 0; color: var(--muted-foreground); font-weight: 400; animation: onboarding-enter .45s .12s both; }
.onboarding-error { margin-top: 1.5rem; color: var(--destructive); font-size: 13px; font-weight: 400; }
.onboarding-back { width: fit-content; margin: -0.5rem 0 -0.75rem; color: var(--muted-foreground); }

@keyframes onboarding-enter { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes onboarding-foundation-settle {
  from { transform: translateY(clamp(8rem, 11vh, 11rem)); }
  to { transform: translateY(0); }
}
@keyframes onboarding-input-collapse {
  45% { opacity: .55; transform: translateY(6px) scale(.96); }
  to { opacity: 0; filter: blur(2px); transform: translateY(20px) scaleX(.38) scaleY(.82); transform-origin: center; }
}
@keyframes onboarding-title-in {
  from { opacity: 0; transform: translateY(14px) scale(.97); }
  55% { opacity: 1; transform: translateY(0) scale(1.01); }
  to { opacity: 1; transform: none; }
}
@keyframes onboarding-title-decode {
  from { filter: blur(5px); letter-spacing: .01em; }
  55% { filter: blur(0); letter-spacing: -.045em; }
  to { filter: blur(0); letter-spacing: -.06em; }
}
@keyframes onboarding-decoder-caret {
  0%, 86% { opacity: 1; }
  100% { opacity: 0; }
}
@keyframes onboarding-active { 50% { box-shadow: 0 0 0 7px color-mix(in oklch, var(--primary) 5%, transparent); } }
@keyframes onboarding-complete { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 640px) {
  .onboarding-content { width: min(100% - 2rem, 680px); }
  .onboarding-choice-grid { grid-template-columns: 1fr; }
  .onboarding-choice { min-height: 136px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
}
</style>
