/**
 * Aria Motion runtime
 * Exposes window.AriaMotion for scroll reveal, stagger, and text effects.
 */
(function () {
  "use strict";

  var REDUCED =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Dynamic Motion values must not become element style attributes. Keep them
  // in one constructable stylesheet, keyed by an internal data attribute.
  // This preserves clean rendered markup while allowing scroll updates to use
  // the same CSS custom properties as before.
  var runtimeStyleSheet = null;
  var runtimeStyleRules = Object.create(null);
  var runtimeStyleId = 0;
  var runtimeStylesDirty = false;

  function getRuntimeStyleSheet() {
    if (runtimeStyleSheet) return runtimeStyleSheet;
    if (
      typeof CSSStyleSheet !== "function" ||
      !document ||
      !("adoptedStyleSheets" in document)
    ) {
      return null;
    }

    try {
      var sheet = new CSSStyleSheet();
      if (typeof sheet.replaceSync !== "function") return null;
      var adopted = Array.prototype.slice.call(document.adoptedStyleSheets);
      adopted.push(sheet);
      document.adoptedStyleSheets = adopted;
      runtimeStyleSheet = sheet;
      return runtimeStyleSheet;
    } catch (_error) {
      return null;
    }
  }

  function getRuntimeStyleId(el) {
    var id = el.getAttribute("data-aria-motion-runtime-id");
    if (id) return id;

    runtimeStyleId += 1;
    id = String(runtimeStyleId);
    el.setAttribute("data-aria-motion-runtime-id", id);
    return id;
  }

  function setRuntimeStyle(el, property, value) {
    if (!getRuntimeStyleSheet()) return;

    var id = getRuntimeStyleId(el);
    var declarations = runtimeStyleRules[id] || {};
    declarations[property] = value;
    runtimeStyleRules[id] = declarations;
    runtimeStylesDirty = true;
  }

  function flushRuntimeStyles() {
    if (!runtimeStylesDirty || !runtimeStyleSheet) return;

    var rules = Object.keys(runtimeStyleRules).map(function (id) {
      var declarations = runtimeStyleRules[id];
      var css = Object.keys(declarations)
        .map(function (property) {
          return property + ": " + declarations[property] + ";";
        })
        .join(" ");
      return '[data-aria-motion-runtime-id="' + id + '"] { ' + css + " }";
    });

    try {
      runtimeStyleSheet.replaceSync(rules.join("\n"));
      runtimeStylesDirty = false;
    } catch (_error) {
      // Do not fall back to element.style: clean markup is the contract.
    }
  }

  function revealElements(root) {
    if (REDUCED) {
      root.querySelectorAll(".aria-motion").forEach(function (el) {
        el.classList.add("aria-motion-in");
      });
      return;
    }

    var targets = root.querySelectorAll(
      ".aria-motion.aria-motion-reveal, .aria-motion.aria-motion-now",
    );

    if (!("IntersectionObserver" in window)) {
      targets.forEach(function (el) {
        el.classList.add("aria-motion-in");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("aria-motion-in");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );

    targets.forEach(function (el) {
      if (el.classList.contains("aria-motion-now")) {
        el.classList.add("aria-motion-in");
        return;
      }
      observer.observe(el);
    });
  }

  /**
   * /** Apply child stagger for. aria-motion-stagger parents.
   */
  function staggerElements(root) {
    var groups = root.querySelectorAll(".aria-motion-stagger");
    groups.forEach(function (group) {
      var interval = parseInt(
        group.getAttribute("data-aria-motion-stagger") || "90",
        10,
      );

      // Collect the parent's motion effect/settings classes to propagate
      // to children (skip structural/trigger classes that belong on the
      // parent only).
      var skip = {
        "aria-motion": true,
        "aria-motion-stagger": true,
        "aria-motion-reveal": true,
        "aria-motion-now": true,
        "aria-motion-hover": true,
        "aria-motion-click": true,
        "aria-motion-scrub": true,
        "aria-motion-in": true,
        "aria-motion-magnetic": true,
        "aria-motion-words": true,
        "aria-motion-chars": true,
      };
      var parentClasses = [];
      group.classList.forEach(function (cls) {
        if (cls.indexOf("aria-motion-") === 0 && !skip[cls]) {
          parentClasses.push(cls);
        }
      });

      // Apply motion to every direct child so stagger delays take effect.
      // Children created in the builder do not carry their own .aria-motion
      // class unless motion is individually enabled — the stagger parent
      // should drive their animation.
      var children = group.querySelectorAll(":scope > *");
      var childCount = 0;
      children.forEach(function (child) {
        if (child.nodeType !== 1) return;

        child.classList.add("aria-motion");
        parentClasses.forEach(function (cls) {
          child.classList.add(cls);
        });
        setRuntimeStyle(
          child,
          "--aria-motion-delay",
          String(childCount * interval) + "ms",
        );
        childCount++;
      });

      flushRuntimeStyles();

      // When the parent is revealed (aria-motion-in added by the
      // IntersectionObserver), propagate .aria-motion-in to children so
      // each child transitions in with its own staggered delay.
      var prevObserver = group._ariaStaggerObserver;
      if (prevObserver) {
        prevObserver.disconnect();
      }
      var observer = new MutationObserver(function () {
        if (group.classList.contains("aria-motion-in")) {
          var allChildren = group.querySelectorAll(":scope > *");
          allChildren.forEach(function (child) {
            if (child.nodeType === 1) {
              child.classList.add("aria-motion-in");
            }
          });
          observer.disconnect();
          group._ariaStaggerObserver = null;
        }
      });
      group._ariaStaggerObserver = observer;
      observer.observe(group, {
        attributes: true,
        attributeFilter: ["class"],
      });

      // If the parent is already revealed (e.g. aria-motion-now trigger
      // or reduced motion), propagate immediately.
      if (group.classList.contains("aria-motion-in")) {
        children.forEach(function (child) {
          if (child.nodeType === 1) {
            child.classList.add("aria-motion-in");
          }
        });
        observer.disconnect();
        group._ariaStaggerObserver = null;
      }
    });
  }

  /**
   * Split text content of .aria-motion-words and .aria-motion-chars elements
   * into individual word/character spans with staggered animation delays.
   */
  /**
   * Scroll scrub — animate element properties in direct proportion
   * to scroll position, for a parallax-style scroll-linked effect.
   */
  function scrubElements(root) {
    var elements = root.querySelectorAll(".aria-motion-scrub");
    if (elements.length === 0) return;

    function update() {
      var viewH = window.innerHeight;
      elements.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var travel = parseInt(
          el.getAttribute("data-aria-motion-scrub") || "200",
          10,
        );

        // Progress: 0 when element bottom is at viewport bottom + travel,
        // 1 when element top is at viewport top - travel
        var start = viewH + travel;
        var end = -rect.height - travel;
        var scrollRange = start - end;
        var currentPos = start - rect.top;
        var progress = Math.max(0, Math.min(1, currentPos / scrollRange));

        setRuntimeStyle(el, "--aria-motion-progress", String(progress));

        // Sync aria-motion-in at completion so text-split children also finish
        if (progress >= 1) {
          el.classList.add("aria-motion-in");
        } else {
          el.classList.remove("aria-motion-in");
        }
      });

      flushRuntimeStyles();
    }

    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();
  }

  /**
   * Aria Parallax — full parallax scroll engine with speed, direction,
   * easing, multi-property effects, pin, velocity, and layer groups.
   */
  function initParallax(root) {
    var elements = root.querySelectorAll(".aria-parallax");
    if (elements.length === 0) return;

    var lastScrollY = typeof window !== "undefined" ? window.scrollY || 0 : 0;
    var ticking = false;

    function applyEasing(t, name) {
      switch (name) {
        case "ease-in":
          return t * t;
        case "ease-out":
          return t * (2 - t);
        case "ease-in-out":
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        case "spring":
          // Spring-like overshoot: damped oscillation
          var c4 = (2 * Math.PI) / 3;
          return t === 0
            ? 0
            : t === 1
              ? 1
              : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
        default:
          return t; // linear
      }
    }

    function updateParallax() {
      var viewH = window.innerHeight;
      var currentScrollY = window.scrollY || 0;
      var scrollVelocity = currentScrollY - lastScrollY;
      lastScrollY = currentScrollY;

      elements.forEach(function (el) {
        var speed = parseFloat(
          el.getAttribute("data-aria-parallax-speed") || "1",
        );
        var travel = parseInt(
          el.getAttribute("data-aria-parallax-travel") || "200",
          10,
        );
        var anchor = el.getAttribute("data-aria-parallax-anchor") || "center";
        var easing = el.getAttribute("data-aria-parallax-easing") || "linear";
        var isVelocity =
          el.getAttribute("data-aria-parallax-velocity") === "true";

        // Anchor point mapping: 0=top, 0.5=center, 1=bottom
        var anchorMap = { top: 0, center: 0.5, bottom: 1 };
        var anchorPoint =
          anchorMap[anchor] !== undefined ? anchorMap[anchor] : 0.5;

        var rect = el.getBoundingClientRect();

        // Calculate progress based on anchor
        var start = viewH + travel * (1 - anchorPoint);
        var end = -rect.height - travel * anchorPoint;
        var scrollRange = start - end;

        if (scrollRange <= 0) {
          setRuntimeStyle(el, "--aria-parallax-progress", "0");
          setRuntimeStyle(el, "--aria-parallax-speed", String(speed));
          setRuntimeStyle(el, "--aria-parallax-velocity-offset", "0px");
          return;
        }

        var currentPos = start - rect.top;
        var rawProgress = Math.max(0, Math.min(1, currentPos / scrollRange));

        var easedProgress = applyEasing(rawProgress, easing);
        var scaledProgress = easedProgress;

        setRuntimeStyle(
          el,
          "--aria-parallax-progress",
          String(scaledProgress),
        );
        setRuntimeStyle(el, "--aria-parallax-speed", String(speed));

        // Velocity mode: apply momentum as a CSS variable so the direction
        // transform remains stylesheet-owned.
        if (isVelocity) {
          var velocityOffset = scrollVelocity * speed * 0.02;
          setRuntimeStyle(
            el,
            "--aria-parallax-velocity-offset",
            String(velocityOffset * speed) + "px",
          );
        } else {
          setRuntimeStyle(el, "--aria-parallax-velocity-offset", "0px");
        }
      });

      flushRuntimeStyles();

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        window.requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    updateParallax();
  }

  function splitText(root) {
    if (!root) return;

    var elements = root.querySelectorAll(
      ".aria-motion-words, .aria-motion-chars",
    );

    elements.forEach(function (el) {
      // Skip if already processed
      if (el.getAttribute("data-aria-motion-split") === "true") return;
      el.setAttribute("data-aria-motion-split", "true");

      var isWords = el.classList.contains("aria-motion-words");

      var interval = parseInt(
        el.getAttribute("data-aria-motion-text-stagger") || "0",
        10,
      );
      if (!interval || isNaN(interval)) {
        interval = isWords ? 80 : 30;
      }

      // Collect motion effect classes to apply to children (skip structural ones)
      var effectClasses = [];
      var skip = {
        "aria-motion": true,
        "aria-motion-words": true,
        "aria-motion-chars": true,
        "aria-motion-reveal": true,
        "aria-motion-now": true,
        "aria-motion-hover": true,
        "aria-motion-click": true,
        "aria-motion-scrub": true,
        "aria-motion-in": true,
        "aria-motion-stagger": true,
        "aria-motion-magnetic": true,
      };
      el.classList.forEach(function (cls) {
        if (!skip[cls] && cls.indexOf("aria-motion-") === 0) {
          effectClasses.push(cls);
        }
      });

      var text = el.textContent;
      el.innerHTML = "";

      if (isWords) {
        // Split by whitespace, creating spans for words and whitespace separately
        var parts = text.split(/(\s+)/);
        var wordIndex = 0;
        parts.forEach(function (part) {
          if (part.length === 0) return;
          var span = document.createElement("span");
          if (/^\s+$/.test(part)) {
            // Whitespace — preserve but don't animate
            span.className = "aria-motion-word-space";
            span.textContent = part;
          } else {
            span.className = "aria-motion-word " + effectClasses.join(" ");
            setRuntimeStyle(
              span,
              "--aria-motion-delay",
              String(wordIndex * interval) + "ms",
            );
            span.textContent = part;
            wordIndex++;
          }
          el.appendChild(span);
        });
      } else {
        // Split into individual characters
        var chars = Array.from(text);
        chars.forEach(function (char, index) {
          var span = document.createElement("span");
          span.className = "aria-motion-char " + effectClasses.join(" ");
          setRuntimeStyle(
            span,
            "--aria-motion-delay",
            String(index * interval) + "ms",
          );
          span.textContent = char;
          el.appendChild(span);
        });
      }
    });

    flushRuntimeStyles();
  }

  function init(container) {
    var root = container || document;
    staggerElements(root);
    scrubElements(root);
    splitText(root);
    revealElements(root);
    initParallax(root);

    root
      .querySelectorAll(".aria-motion.aria-motion-click")
      .forEach(function (el) {
        el.addEventListener("click", function () {
          el.classList.toggle("aria-motion-in");
        });
      });
  }

  var AriaMotion = {
    init: init,
    reveal: revealElements,
    stagger: staggerElements,
    splitText: splitText,
    scrub: scrubElements,
    parallax: initParallax,
    pointer: function () {},
    confetti: function () {},
  };

  if (typeof window !== "undefined") {
    window.AriaMotion = AriaMotion;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init(document);
      });
    } else {
      init(document);
    }
  }
})();
