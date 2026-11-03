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

  /* Mobile navigation disclosure */

  var navTrigger = document.querySelector("[data-nav-toggle]");
  var navPanel = document.getElementById("mobile-nav");

  if (navTrigger && navPanel) {
    var labelElement = navTrigger.querySelector(".nav-trigger-label");
    var currentLabel = labelElement ? labelElement.textContent.replace(/\s+/g, " ").trim() : "Overview";

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
        if (firstLink) {
          firstLink.focus();
        }
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

  /* Copy the token snippet with inline feedback */

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
          copyButton.focus();
          succeeded();
        } catch (error) {
          copyButton.focus();
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
