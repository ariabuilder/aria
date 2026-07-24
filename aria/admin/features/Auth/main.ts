import { createApp, type Component } from "vue";

import setupAstroVueApp from "../../astro-vue-app";

const AUTH_PAGE_LOADERS = {
  forgot: () => import("./pages/ForgotPasswordPage.vue"),
  login: () => import("./pages/LoginPage.vue"),
  reset: () => import("./pages/ResetPasswordPage.vue"),
  setup: () => import("./pages/SetupPage.vue"),
} as const;

type AuthPage = keyof typeof AUTH_PAGE_LOADERS;

function isAuthPage(value: string | undefined): value is AuthPage {
  return Boolean(value && value in AUTH_PAGE_LOADERS);
}

async function mountAuthPage(): Promise<void> {
  const root = document.getElementById("aria-auth-app");
  if (!(root instanceof HTMLElement)) {
    throw new Error("Auth application mount point was not found");
  }

  const page = root.dataset.authPage;
  if (!isAuthPage(page)) {
    throw new Error(`Unknown auth page: ${page ?? "missing"}`);
  }

  const pageModule = await AUTH_PAGE_LOADERS[page]();
  const props =
    page === "reset" ? { token: root.dataset.authToken ?? "" } : undefined;
  const app = createApp(pageModule.default as Component, props);

  app.use({ install: setupAstroVueApp });
  app.mount(root);
}

void mountAuthPage();
