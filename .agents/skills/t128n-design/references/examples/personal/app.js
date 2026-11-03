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
})();
