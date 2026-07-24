/* Aria Navigation runtime — lean submenu + mobile drawer behavior */
(function () {
  const OPEN_CLASS = "aria-nav-open";
  const SUBMENU_OPEN_CLASS = "aria-nav-submenu-open";
  const ACTIVE_ITEM_CLASS = "aria-nav-active";

  function parseDelay(value) {
    const parsed = Number.parseInt(String(value ?? "0"), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  }

  function closestNavRoot(node) {
    return node instanceof Element
      ? node.closest('[data-aria-nav="root"]')
      : null;
  }

  function navItemsLists(root) {
    return Array.from(root.querySelectorAll(':scope > [data-aria-nav="items"]'));
  }

  function submenuItemsForItem(item) {
    return item.querySelector(':scope > [data-aria-nav="items"]');
  }

  function closeAllSubmenus(root, exceptItem) {
    root.querySelectorAll('[data-aria-nav="item"]').forEach((item) => {
      if (exceptItem && item === exceptItem) return;
      item.classList.remove(SUBMENU_OPEN_CLASS);
      const toggle = item.querySelector(
        ':scope > [data-aria-nav="toggle"], :scope > button[data-aria-submenu-toggle]',
      );
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    });
  }

  function ensureSubmenuToggle(item, label) {
    let toggle = item.querySelector(
      ':scope > button[data-aria-submenu-toggle]',
    );
    if (toggle) return toggle;

    const submenu = submenuItemsForItem(item);
    if (!submenu) return null;

    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.setAttribute("data-aria-submenu-toggle", "true");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", `${label || "Menu"} submenu`);
    toggle.className = "aria-nav-submenu-toggle";
    toggle.innerHTML =
      '<span aria-hidden="true" class="aria-nav-submenu-toggle-icon"></span>';

    const link = item.querySelector(':scope > a');
    if (link && link.parentNode === item) {
      link.insertAdjacentElement("afterend", toggle);
    } else {
      item.insertBefore(toggle, submenu);
    }

    return toggle;
  }

  function bindSubmenuItem(root, item, config) {
    const submenu = submenuItemsForItem(item);
    if (!submenu) return;

    const link = item.querySelector(":scope > a");
    const label = link?.textContent?.trim() || "Menu";
    const toggle = ensureSubmenuToggle(item, label);
    const trigger = config.submenuTrigger;
    let openTimer = null;
    let closeTimer = null;

    const open = () => {
      window.clearTimeout(closeTimer);
      closeAllSubmenus(root, item);
      item.classList.add(SUBMENU_OPEN_CLASS);
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    };

    const close = () => {
      if (config.builderKeepOpen) return;
      item.classList.remove(SUBMENU_OPEN_CLASS);
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    };

    const scheduleOpen = () => {
      window.clearTimeout(closeTimer);
      openTimer = window.setTimeout(open, config.openDelay);
    };

    const scheduleClose = () => {
      window.clearTimeout(openTimer);
      closeTimer = window.setTimeout(close, config.closeDelay);
    };

    if (trigger === "hover" || trigger === "both") {
      item.addEventListener("mouseenter", scheduleOpen);
      item.addEventListener("mouseleave", scheduleClose);
      submenu.addEventListener("mouseenter", () =>
        window.clearTimeout(closeTimer),
      );
      submenu.addEventListener("mouseleave", scheduleClose);
    }

    if (trigger === "click" || trigger === "both") {
      const onToggle = (event) => {
        event.preventDefault();
        if (item.classList.contains(SUBMENU_OPEN_CLASS)) {
          close();
        } else {
          open();
        }
      };
      if (toggle) toggle.addEventListener("click", onToggle);
      if (trigger === "click" && link) {
        link.addEventListener("click", (event) => {
          if (submenu) {
            event.preventDefault();
            onToggle(event);
          }
        });
      }
    }

    if (config.builderKeepOpen) {
      item.classList.add(SUBMENU_OPEN_CLASS);
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    }
  }

  function readNavConfig(root) {
    return {
      submenuTrigger: root.getAttribute("data-submenu-trigger") || "hover",
      openDelay: parseDelay(root.getAttribute("data-submenu-open-delay")),
      closeDelay: parseDelay(root.getAttribute("data-submenu-close-delay")),
      mobileEnabled: root.getAttribute("data-mobile-enabled") !== "false",
      mobileBreakpoint: root.getAttribute("data-mobile-breakpoint") || "md",
      mobileMode: root.getAttribute("data-mobile-mode") || "drawer",
      mobileDrawerSide:
        root.getAttribute("data-mobile-drawer-side") || "left",
      builderKeepOpen: root.getAttribute("data-builder-keep-open") === "true",
    };
  }

  function bindMobileNav(root, config) {
    if (!config.mobileEnabled) return;

    const openToggle = root.querySelector(
      '[data-aria-nav="toggle"][data-nav-toggle-variant="open"]',
    );
    const closeToggle = root.querySelector(
      '[data-aria-nav="toggle"][data-nav-toggle-variant="close"]',
    );
    const itemGroups = navItemsLists(root);
    if (itemGroups.length === 0) return;

    let overlay = root.querySelector(".aria-nav-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "aria-nav-overlay";
      overlay.hidden = true;
      root.appendChild(overlay);
    }

    const open = () => {
      root.classList.add(OPEN_CLASS);
      root.setAttribute("data-aria-nav-state", "open");
      overlay.hidden = false;
      document.documentElement.classList.add("aria-nav-body-lock");
    };

    const close = () => {
      root.classList.remove(OPEN_CLASS);
      root.setAttribute("data-aria-nav-state", "closed");
      overlay.hidden = true;
      document.documentElement.classList.remove("aria-nav-body-lock");
      closeAllSubmenus(root);
    };

    openToggle?.addEventListener("click", open);
    closeToggle?.addEventListener("click", close);
    overlay.addEventListener("click", close);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });

    root.setAttribute("data-mobile-breakpoint", config.mobileBreakpoint);
    root.setAttribute("data-mobile-mode", config.mobileMode);
    root.setAttribute("data-mobile-drawer-side", config.mobileDrawerSide);
  }

  function initNavigation(root) {
    const config = readNavConfig(root);
    root.querySelectorAll('[data-aria-nav="item"]').forEach((item) => {
      bindSubmenuItem(root, item, config);
    });
    bindMobileNav(root, config);
  }

  function initAll() {
    document
      .querySelectorAll('[data-aria-nav="root"]')
      .forEach((root) => initNavigation(root));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll, { once: true });
  } else {
    initAll();
  }
})();
