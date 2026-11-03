(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "t128n-theme";
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function byId(id) {
    return document.getElementById(id);
  }

  /* Theme */

  function readStoredTheme() {
    try {
      var stored = window.localStorage.getItem(THEME_KEY);
      return stored === "light" || stored === "dark" ? stored : null;
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#161616" : "#FFFFFF");
    }
  }

  var themeToggle = byId("theme-toggle");

  function updateThemeControl(theme) {
    if (!themeToggle) {
      return;
    }
    var next = theme === "dark" ? "light" : "dark";
    var label = "Switch to " + next + " theme";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
  }

  if (themeToggle) {
    var initialTheme = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
    applyTheme(initialTheme);
    updateThemeControl(initialTheme);

    themeToggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";

      try {
        if (next === systemTheme()) {
          window.localStorage.removeItem(THEME_KEY);
        } else {
          window.localStorage.setItem(THEME_KEY, next);
        }
      } catch (error) {}

      applyTheme(next);
      updateThemeControl(next);
    });
  }

  function handleSystemThemeChange() {
    if (!readStoredTheme()) {
      var theme = systemTheme();
      applyTheme(theme);
      updateThemeControl(theme);
    }
  }

  if (darkQuery) {
    if (typeof darkQuery.addEventListener === "function") {
      darkQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof darkQuery.addListener === "function") {
      darkQuery.addListener(handleSystemThemeChange);
    }
  }

  window.addEventListener("storage", function (event) {
    if (event.key === THEME_KEY) {
      var theme = readStoredTheme() || systemTheme();
      applyTheme(theme);
      updateThemeControl(theme);
    }
  });

  /* Data */

  var projects = [
    { name: "API gateway", slug: "api-gateway", environment: "Production", updated: "2026-10-31" },
    { name: "Billing worker", slug: "billing-worker", environment: "Production", updated: "2026-10-31" },
    { name: "Customer portal", slug: "customer-portal", environment: "Staging", updated: "2026-10-30" },
    { name: "Docs site", slug: "docs-site", environment: "Production", updated: "2026-10-29" },
    { name: "Event ingest", slug: "event-ingest", environment: "Production", updated: "2026-10-29" },
    { name: "Image pipeline", slug: "image-pipeline", environment: "Staging", updated: "2026-10-27" },
    { name: "Search index", slug: "search-index", environment: "Production", updated: "2026-10-26" },
    { name: "Web app", slug: "web-app", environment: "Preview", updated: "2026-10-25" }
  ];

  var list = byId("project-list");
  var search = byId("project-search");
  var searchForm = byId("search-form");
  var clearButton = byId("clear-search");
  var resultCount = byId("result-count");
  var emptyState = byId("empty-state");
  var emptyQuery = byId("empty-query");
  var emptyClear = byId("empty-clear");
  var status = byId("status");
  var newButton = byId("new-project");
  var newForm = byId("new-project-form");
  var nameInput = byId("new-project-name");
  var nameError = byId("new-project-error");
  var nameErrorText = byId("new-project-error-text");
  var cancelButton = byId("cancel-new-project");

  var query = "";
  var statusTimer = 0;
  var openTimer = 0;

  var CHECK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
  var ALERT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';
  var ARROW_ICON = '<svg class="icon project__arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m9 18 6-6-6-6"/></svg>';

  /* Rendering */

  function visibleProjects() {
    var needle = query.trim().toLowerCase();
    if (!needle) {
      return projects.slice();
    }
    return projects.filter(function (project) {
      return project.name.toLowerCase().indexOf(needle) !== -1 ||
        project.slug.toLowerCase().indexOf(needle) !== -1;
    });
  }

  function createRow(project) {
    var item = document.createElement("li");
    var button = document.createElement("button");
    button.type = "button";
    button.className = "project";
    button.dataset.slug = project.slug;
    button.setAttribute("aria-label", project.name + ", " + project.slug + ", " + project.environment + ", updated " + project.updated);
    button.title = project.slug;

    var main = document.createElement("span");
    main.className = "project__main";

    var name = document.createElement("span");
    name.className = "project__name";
    name.textContent = project.name;

    var slug = document.createElement("span");
    slug.className = "project__slug";
    slug.textContent = project.slug;

    main.appendChild(name);
    main.appendChild(slug);

    var meta = document.createElement("span");
    meta.className = "project__meta";
    meta.textContent = project.environment + " · " + project.updated;

    button.appendChild(main);
    button.appendChild(meta);
    button.insertAdjacentHTML("beforeend", ARROW_ICON);
    item.appendChild(button);
    return item;
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (query.trim()) {
      params.set("q", query);
    }
    if (!newForm.hidden) {
      params.set("new", "1");
    }
    var queryString = params.toString();
    var next = window.location.pathname + (queryString ? "?" + queryString : "") + window.location.hash;
    try {
      window.history.replaceState(null, "", next);
    } catch (error) {}
  }

  function applyUrlState() {
    var params = new URLSearchParams(window.location.search);
    query = params.get("q") || "";
    search.value = query;
    if (params.get("new") === "1") {
      if (newForm.hidden) {
        openNewProject(false);
      }
    } else if (!newForm.hidden) {
      closeNewProject(false);
    }
    render();
  }

  function render() {
    var visible = visibleProjects();
    var count = visible.length;

    list.textContent = "";
    visible.forEach(function (project) {
      list.appendChild(createRow(project));
    });

    resultCount.textContent = count + (count === 1 ? " project" : " projects");
    clearButton.hidden = query.trim() === "";
    list.hidden = count === 0;
    emptyState.hidden = count !== 0;

    if (count === 0) {
      emptyQuery.textContent = query.trim();
    }

    syncUrl();
  }

  function setStatus(message, tone, duration) {
    window.clearTimeout(statusTimer);
    status.classList.toggle("inline-status--success", tone === "success");
    status.classList.toggle("inline-status--error", tone === "error");
    status.innerHTML = "";

    if (!message) {
      return;
    }

    if (tone === "success" || tone === "error") {
      status.innerHTML = tone === "error" ? ALERT_ICON : CHECK_ICON;
    }
    status.appendChild(document.createTextNode(message));

    if (duration) {
      statusTimer = window.setTimeout(function () {
        setStatus("");
      }, duration);
    }
  }

  function clearSearch(focusSearch) {
    query = "";
    search.value = "";
    render();
    if (focusSearch) {
      search.focus();
    }
  }

  /* Search */

  search.addEventListener("input", function () {
    query = search.value;
    render();
  });

  search.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault();
      var first = list.querySelector(".project");
      if (first) {
        first.click();
      }
    } else if (event.key === "ArrowDown") {
      var firstRow = list.querySelector(".project");
      if (firstRow) {
        event.preventDefault();
        firstRow.focus();
      }
    } else if (event.key === "Escape" && query) {
      event.preventDefault();
      clearSearch(true);
    }
  });

  if (searchForm) {
    searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
    });
  }

  clearButton.addEventListener("click", function () {
    clearSearch(true);
  });

  emptyClear.addEventListener("click", function () {
    clearSearch(true);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    var target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
      return;
    }
    event.preventDefault();
    search.focus();
  });

  /* Rows */

  list.addEventListener("click", function (event) {
    var button = event.target.closest(".project");
    if (!button) {
      return;
    }
    var project = projects.find(function (item) {
      return item.slug === button.dataset.slug;
    });
    if (project) {
      openProject(project);
    }
  });

  list.addEventListener("keydown", function (event) {
    var rows = Array.prototype.slice.call(list.querySelectorAll(".project"));
    var index = rows.indexOf(document.activeElement);
    if (index === -1) {
      return;
    }

    var next = null;
    if (event.key === "ArrowDown") {
      next = rows[index + 1];
    } else if (event.key === "ArrowUp") {
      next = index === 0 ? search : rows[index - 1];
    } else if (event.key === "Home") {
      next = rows[0];
    } else if (event.key === "End") {
      next = rows[rows.length - 1];
    } else if (event.key === "Escape") {
      search.focus();
      return;
    }

    if (next) {
      event.preventDefault();
      next.focus();
    }
  });

  function openProject(project) {
    window.clearTimeout(openTimer);
    setStatus("Opening " + project.name + "…");
    openTimer = window.setTimeout(function () {
      setStatus(project.name + " opened.", "success", 6000);
    }, 500);
  }

  /* New project */

  function setNameError(message) {
    if (!message) {
      nameError.hidden = true;
      nameErrorText.textContent = "";
      nameInput.removeAttribute("aria-invalid");
      return;
    }
    nameError.hidden = false;
    nameErrorText.textContent = message;
    nameInput.setAttribute("aria-invalid", "true");
  }

  function openNewProject(shouldFocus) {
    newForm.hidden = false;
    newButton.hidden = true;
    newButton.setAttribute("aria-expanded", "true");
    nameInput.value = "";
    setNameError("");
    syncUrl();
    if (shouldFocus !== false) {
      nameInput.focus();
    }
  }

  function closeNewProject(returnFocus) {
    newForm.hidden = true;
    newButton.hidden = false;
    newButton.setAttribute("aria-expanded", "false");
    setNameError("");
    syncUrl();
    if (returnFocus) {
      newButton.focus();
    }
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project";
  }

  function uniqueSlug(value) {
    var base = slugify(value);
    var slug = base;
    var suffix = 2;
    while (projects.some(function (project) { return project.slug === slug; })) {
      slug = base + "-" + suffix;
      suffix += 1;
    }
    return slug;
  }

  newButton.addEventListener("click", function () {
    openNewProject(true);
  });

  cancelButton.addEventListener("click", function () {
    closeNewProject(true);
  });

  nameInput.addEventListener("input", function () {
    if (!nameError.hidden) {
      setNameError(nameInput.value.trim() ? "" : "Enter a project name to continue.");
    }
  });

  nameInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeNewProject(true);
    }
  });

  newForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = nameInput.value.trim();

    if (!name) {
      setNameError("Enter a project name to continue.");
      nameInput.focus();
      return;
    }

    var slug = uniqueSlug(name);
    projects.unshift({
      name: name,
      slug: slug,
      environment: "Preview",
      updated: "2026-11-01"
    });

    closeNewProject(false);
    query = "";
    search.value = "";
    render();

    var created = list.querySelector('[data-slug="' + slug + '"]');
    if (created) {
      created.focus();
    }
    setStatus("Project created.", "success", 6000);
  });

  window.addEventListener("popstate", applyUrlState);

  applyUrlState();
})();
