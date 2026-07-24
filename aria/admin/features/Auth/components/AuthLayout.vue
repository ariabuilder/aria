<script setup lang="ts">
import { computed, onMounted, ref, type Component } from "vue";
import { DbDotGridBackdrop } from "@/components/ui/db-dot-grid-backdrop";

/**
 * AuthLayout Component
 *
 * Shared layout for login and setup pages.
 * Two-column design with brand panel and form panel.
 *
 * @component
 */

interface Props {
  /** Main heading (can include HTML) */
  heading: string;
  tagline: string;
  formTitle: string;
  formDescription: string;
  formComponent: Component;
  animated?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  animated: false,
});

const entranceReady = ref(false);
const showAnimatedEntrance = computed(
  () => props.animated && entranceReady.value,
);

onMounted(() => {
  const startEntrance = () => {
    entranceReady.value = true;
  };
  const browserWindow = window as Window & {
    hideAriaPreloader?: () => void;
  };

  if (!props.animated || !document.getElementById("aria-preloader")) {
    startEntrance();
  } else {
    window.addEventListener("aria-preloader-hidden", startEntrance, {
      once: true,
    });
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => browserWindow.hideAriaPreloader?.());
  });
});
</script>

<template>
  <div
    class="relative grid h-full min-h-screen w-full grid-cols-1 overflow-hidden bg-background font-sans text-foreground lg:grid-cols-2"
    :class="{
      'auth-layout--awaiting-entrance': animated && !entranceReady,
      'auth-layout--animated': showAnimatedEntrance,
    }"
  >
    <DbDotGridBackdrop :animated="showAnimatedEntrance" />
    <!-- Left Panel - Brand -->
    <div
      class="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden z-1"
      :class="animated ? 'auth-setup-hero' : 'db-hero'"
    >
      <!-- Logo -->
      <div class="auth-setup-logo flex items-center gap-3 z-1 relative">
        <svg
          class="h-12 w-auto fill-foreground"
          viewBox="0 0 727 621"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform="matrix(3.040039,0,0,3.040039,-1199.199655,-483.005411)">
            <path
              d="M414.732,338.7C442.022,309.726 452.417,298.214 500.646,253.658C512.365,242.832 523.508,234.73 513.564,239.686C500.707,246.094 500.657,245.764 487.46,251.41C470,258.88 461.944,263.285 464.958,258.731C469.373,252.058 512.107,173.735 516.155,166.315C518.494,162.028 520.3,156.021 522.635,160.418C530.999,176.165 582.223,266.793 581.907,268.613C581.52,270.842 559.235,275.253 510.245,305.078C453.735,339.482 431.962,362.56 425.5,362.599C396.026,362.777 394.261,363.97 394.484,361.498C394.527,361.022 412.163,341.452 414.732,338.7Z"
            />
          </g>
          <g transform="matrix(3.040039,0,0,3.040039,-1199.199655,-483.005411)">
            <path
              d="M586.593,339.432C573.418,319.82 558.933,300.218 559.359,298.438C559.65,297.221 582.442,286.66 588.389,284.234C591.726,282.872 591.39,285.149 606.332,311.59C608.533,315.486 633.154,359.057 633.453,360.512C633.903,362.709 632.325,362.608 605.5,362.595C600.629,362.592 601.571,360.517 586.593,339.432Z"
            />
          </g>
        </svg>
      </div>

      <!-- Brand Content -->
      <div class="auth-setup-copy z-1 relative mx-auto select-none">
        <h2
          class="text-5xl lg:text-5xl font-sans font-medium leading-tight tracking-tight text-foreground mb-6"
          v-html="heading"
        />
        <p
          class="text-lg font-sans leading-relaxed text-muted-foreground text-balanced max-w-md"
          v-html="tagline"
        />
      </div>

      <!-- Footer -->
      <p class="auth-setup-footer text-xs text-muted-foreground z-1 relative select-none">
        © 2026 Statice Origins Inc. Built for creators.
      </p>
    </div>

    <!-- Right Panel - Form -->
    <div
      class="flex items-center justify-center relative z-1"
      :class="animated ? 'auth-setup-panel' : 'db-pages-card'"
    >
      <div
        class="frame auth-setup-card w-full max-w-md bg-background backdrop-blur-xs p-10 login-card"
      >
        <div class="corner corner-tl"></div>
        <div class="corner corner-tr"></div>
        <div class="corner corner-bl"></div>
        <div class="corner corner-br"></div>
        <!-- Form Header -->
        <div class="auth-setup-form-header mb-8 space-y-2 select-none">
          <h1 class="text-3xl font-sans font-medium text-foreground mt-0 mb-0">
            {{ formTitle }}
          </h1>
          <p class="text-sm text-muted-foreground">
            {{ formDescription }}
          </p>
        </div>

        <!-- Form Content -->
        <div class="auth-setup-form-content">
          <component :is="formComponent" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-card {
  position: relative;
  overflow: visible;
}

.auth-layout--animated .auth-setup-logo {
  animation: auth-fade-up 480ms cubic-bezier(0.16, 1, 0.3, 1) 140ms both;
}

.auth-layout--animated .auth-setup-copy {
  animation: auth-fade-up 520ms cubic-bezier(0.16, 1, 0.3, 1) 240ms both;
}

.auth-layout--animated .auth-setup-footer {
  animation: auth-fade-up 440ms cubic-bezier(0.16, 1, 0.3, 1) 340ms both;
}

.auth-layout--animated .auth-setup-card {
  animation: auth-fade-up 560ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
}

.auth-layout--animated .auth-setup-form-header {
  animation: auth-fade-up 420ms cubic-bezier(0.16, 1, 0.3, 1) 330ms both;
}

.auth-layout--animated .auth-setup-form-content {
  animation: auth-fade-up 460ms cubic-bezier(0.16, 1, 0.3, 1) 410ms both;
}

@keyframes auth-fade-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.auth-layout--awaiting-entrance .auth-setup-logo,
.auth-layout--awaiting-entrance .auth-setup-copy,
.auth-layout--awaiting-entrance .auth-setup-footer,
.auth-layout--awaiting-entrance .auth-setup-card {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .auth-layout--animated .auth-setup-logo,
  .auth-layout--animated .auth-setup-copy,
  .auth-layout--animated .auth-setup-footer,
  .auth-setup-panel,
  .auth-layout--animated .auth-setup-card,
  .auth-layout--animated .auth-setup-form-header,
  .auth-layout--animated .auth-setup-form-content {
    animation: none;
    opacity: 1;
    transform: none;
  }
}
</style>
