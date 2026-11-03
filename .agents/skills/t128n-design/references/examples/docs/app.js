(function () {
  "use strict";

  var STORAGE_KEY = "t128n-theme";
  var root = document.documentElement;
  var colorQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var themeButton = document.querySelector("[data-theme-toggle]");
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function readStoredTheme() {
    try {
      var value = window.localStorage.getItem(STORAGE_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredTheme(value) {
    try {
      if (value === null) {
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        window.localStorage.setItem(STORAGE_KEY, value);
      }
    } catch (error) {}
  }

  function osTheme() {
    return colorQuery && colorQuery.matches ? "dark" : "light";
  }

  function currentTheme() {
    return readStoredTheme() || osTheme();
  }

  function syncThemeButton(theme) {
    if (!themeButton) {
      return;
    }
    var next = theme === "dark" ? "light" : "dark";
    var label = "Switch to " + next + " theme";
    themeButton.setAttribute("aria-label", label);
    themeButton.title = readStoredTheme() ? label : label + " (following system preference)";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#161616" : "#FFFFFF");
    }
    syncThemeButton(theme);
  }

  applyTheme(currentTheme());

  if (themeButton) {
    themeButton.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      if (next === osTheme()) {
        writeStoredTheme(null);
      } else {
        writeStoredTheme(next);
      }
      applyTheme(next);
    });
  }

  function handleSystemThemeChange() {
    if (!readStoredTheme()) {
      applyTheme(osTheme());
    }
  }

  if (colorQuery) {
    if (typeof colorQuery.addEventListener === "function") {
      colorQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof colorQuery.addListener === "function") {
      colorQuery.addListener(handleSystemThemeChange);
    }
  }

  window.addEventListener("storage", function (event) {
    if (event.key === STORAGE_KEY) {
      applyTheme(currentTheme());
    }
  });

  function focusElement(element, preventScroll) {
    if (!element) {
      return;
    }
    try {
      element.focus({ preventScroll: Boolean(preventScroll) });
    } catch (error) {
      element.focus();
    }
  }

  var prefersReducedMotion = function () {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  var skipLink = document.querySelector(".skip-link");
  var pageTitle = document.getElementById("color-title");
  if (skipLink && pageTitle) {
    skipLink.addEventListener("click", function (event) {
      event.preventDefault();
      focusElement(pageTitle, true);
      try {
        pageTitle.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: "nearest"
        });
      } catch (error) {
        pageTitle.scrollIntoView();
      }
      try {
        window.history.replaceState(null, "", "#main");
      } catch (error) {}
    });
  }

  /* Mobile navigation disclosure */

  var navTrigger = document.querySelector("[data-nav-toggle]");
  var navPanel = document.getElementById("mobile-nav");

  if (navTrigger && navPanel) {
    var currentLabelElement = navTrigger.querySelector(".nav-trigger-label");
    var currentLabel = currentLabelElement ? currentLabelElement.textContent.replace(/\s+/g, " ").trim() : "Foundations";

    var setNavState = function (open, returnFocus) {
      navPanel.hidden = !open;
      navTrigger.setAttribute("aria-expanded", open ? "true" : "false");
      navTrigger.setAttribute("aria-label", (open ? "Close" : "Open") + " navigation menu. Current page: " + currentLabel);
      if (returnFocus) {
        navTrigger.focus();
      }
    };

    setNavState(false);

    navTrigger.addEventListener("click", function (event) {
      var opening = navPanel.hidden;
      setNavState(opening);
      if (opening && event.detail === 0) {
        var firstLink = navPanel.querySelector("a");
        focusElement(firstLink, false);
      }
    });

    document.addEventListener("click", function (event) {
      if (navPanel.hidden || navPanel.contains(event.target) || navTrigger.contains(event.target)) {
        return;
      }
      setNavState(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !navPanel.hidden) {
        setNavState(false, true);
      }
    });

    navPanel.addEventListener("click", function (event) {
      if (event.target.closest("a")) {
        setNavState(false);
      }
    });

    var desktopQuery = window.matchMedia ? window.matchMedia("(min-width: 768px)") : null;
    if (desktopQuery) {
      var handleDesktopChange = function (event) {
        if (event.matches && !navPanel.hidden) {
          setNavState(false);
        }
      };
      if (typeof desktopQuery.addEventListener === "function") {
        desktopQuery.addEventListener("change", handleDesktopChange);
      } else if (typeof desktopQuery.addListener === "function") {
        desktopQuery.addListener(handleDesktopChange);
      }
    }
  }

  /* Table of contents: scroll spy and focus transfer */

  var tocLinks = Array.prototype.slice.call(document.querySelectorAll("[data-toc-link]"));
  var sections = Array.prototype.slice.call(document.querySelectorAll(".article-section"));
  var header = document.querySelector(".site-header");

  if (tocLinks.length && sections.length) {
    var activeId = null;

    var setActive = function (id) {
      if (id === activeId) {
        return;
      }
      activeId = id;
      tocLinks.forEach(function (link) {
        var isActive = link.getAttribute("href") === "#" + id;
        if (isActive) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    };

    var updateActive = function () {
      var limit = (header ? header.getBoundingClientRect().height : 48) + 32;
      var current = null;

      sections.forEach(function (section) {
        var heading = section.querySelector("h2");
        if (!heading) {
          return;
        }
        if (!current) {
          current = heading;
        }
        if (heading.getBoundingClientRect().top <= limit) {
          current = heading;
        }
      });

      if (current && window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 2) {
        var lastSection = sections[sections.length - 1];
        var lastHeading = lastSection ? lastSection.querySelector("h2") : null;
        if (lastHeading) {
          current = lastHeading;
        }
      }

      if (current) {
        setActive(current.id);
      }
    };

    updateActive();

    if ("IntersectionObserver" in window) {
      var observer = new IntersectionObserver(function () {
        updateActive();
      }, {
        root: null,
        rootMargin: "-25% 0px -60% 0px",
        threshold: 0
      });
      sections.forEach(function (section) {
        observer.observe(section);
      });
    }

    var resizeFrame = null;
    window.addEventListener("resize", function () {
      if (resizeFrame) {
        return;
      }
      resizeFrame = window.requestAnimationFrame(function () {
        resizeFrame = null;
        updateActive();
      });
    });

    var scrollFrame = null;
    window.addEventListener("scroll", function () {
      if (scrollFrame) {
        return;
      }
      scrollFrame = window.requestAnimationFrame(function () {
        scrollFrame = null;
        updateActive();
      });
    }, { passive: true });

    tocLinks.forEach(function (link) {
      link.addEventListener("click", function (event) {
        var href = link.getAttribute("href") || "";
        if (href.charAt(0) !== "#") {
          return;
        }
        var id = href.slice(1);
        var heading = document.getElementById(id);
        if (!heading) {
          return;
        }

        event.preventDefault();
        focusElement(heading, true);

        var reduceMotion = prefersReducedMotion();
        try {
          heading.scrollIntoView({
            behavior: reduceMotion ? "auto" : "smooth",
            block: "start"
          });
        } catch (error) {
          heading.scrollIntoView();
        }

        try {
          window.history.replaceState(null, "", "#" + id);
        } catch (error) {}

        setActive(id);
      });
    });

    var focusFromHash = function () {
      if (!window.location.hash) {
        return;
      }
      var heading = document.getElementById(window.location.hash.slice(1));
      if (heading && heading.tagName === "H2") {
        focusElement(heading, true);
        updateActive();
      }
    };

    window.addEventListener("hashchange", focusFromHash);
    focusFromHash();
  }

  /* Copy to clipboard with inline feedback */

  var copyButton = document.querySelector("[data-copy-target]");
  var copyFeedback = document.querySelector("[data-copy-feedback]");
  var feedbackTimer = null;

  function showCopyFeedback(text) {
    if (!copyFeedback) {
      return;
    }
    copyFeedback.textContent = text;
    if (feedbackTimer) {
      window.clearTimeout(feedbackTimer);
    }
    feedbackTimer = window.setTimeout(function () {
      copyFeedback.textContent = "";
    }, 2000);
  }

  function legacyCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);

    var copied = false;
    try {
      area.select();
      area.setSelectionRange(0, area.value.length);
      copied = document.execCommand("copy");
    } finally {
      if (area.parentNode) {
        area.parentNode.removeChild(area);
      }
    }

    if (!copied) {
      throw new Error("Copy command was rejected");
    }
  }

  if (copyButton) {
    copyButton.addEventListener("click", function () {
      var targetId = copyButton.getAttribute("data-copy-target");
      var source = targetId ? document.getElementById(targetId) : null;

      showCopyFeedback("");

      if (!source) {
        showCopyFeedback("Copy failed");
        return;
      }

      var text = source.textContent;
      var succeeded = function () {
        showCopyFeedback("Copied");
      };
      var viaLegacy = function () {
        try {
          legacyCopy(text);
          focusElement(copyButton, true);
          succeeded();
        } catch (error) {
          focusElement(copyButton, true);
          showCopyFeedback("Copy failed");
        }
      };

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(succeeded, viaLegacy);
      } else {
        viaLegacy();
      }
    });
  }
})();
