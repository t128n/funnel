(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "t128n-theme";

  var projects = [
    {
      name: "API gateway",
      slug: "api-gateway",
      status: "ready",
      environment: "Production",
      owner: { name: "Mina Park", initials: "MP" },
      updated: "2026-10-31",
      id: "prj_01hq4a2f8m3k7v2x"
    },
    {
      name: "Billing worker",
      slug: "billing-worker",
      status: "building",
      environment: "Production",
      owner: { name: "Dev Patel", initials: "DP" },
      updated: "2026-10-31",
      id: "prj_01hq4b1c9n4p6w8z"
    },
    {
      name: "Customer portal",
      slug: "customer-portal",
      status: "ready",
      environment: "Staging",
      owner: { name: "Ana Souza", initials: "AS" },
      updated: "2026-10-30",
      id: "prj_01hq4c7d2r5t9y3a"
    },
    {
      name: "Docs site",
      slug: "docs-site",
      status: "ready",
      environment: "Production",
      owner: { name: "Mina Park", initials: "MP" },
      updated: "2026-10-29",
      id: "prj_01hq4d4e6s8u1b7c"
    },
    {
      name: "Event ingest",
      slug: "event-ingest",
      status: "failed",
      environment: "Production",
      owner: { name: "Jonas Weber", initials: "JW" },
      updated: "2026-10-29",
      id: "prj_01hq4e9f3t7v5c2d"
    },
    {
      name: "Image pipeline",
      slug: "image-pipeline",
      status: "paused",
      environment: "Staging",
      owner: { name: "Ana Souza", initials: "AS" },
      updated: "2026-10-27",
      id: "prj_01hq4f6g8u2w4d1e"
    },
    {
      name: "Search index",
      slug: "search-index",
      status: "ready",
      environment: "Production",
      owner: { name: "Dev Patel", initials: "DP" },
      updated: "2026-10-26",
      id: "prj_01hq4g3h5v9x6e8f"
    },
    {
      name: "Web app",
      slug: "web-app",
      status: "building",
      environment: "Preview",
      owner: { name: "Jonas Weber", initials: "JW" },
      updated: "2026-10-25",
      id: "prj_01hq4h7j2w4y9f5g"
    }
  ];

  var STATUS_META = {
    ready: { label: "Ready", icon: "circle-check", tone: "status--success" },
    building: { label: "Building", icon: "loader-circle", tone: "status--neutral" },
    failed: { label: "Failed", icon: "circle-x", tone: "status--error" },
    paused: { label: "Paused", icon: "circle-pause", tone: "status--muted" }
  };

  var ICONS = {
    "circle-check": '<circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path>',
    "circle-x": '<circle cx="12" cy="12" r="10"></circle><path d="m15 9-6 6"></path><path d="m9 9 6 6"></path>',
    "circle-pause": '<circle cx="12" cy="12" r="10"></circle><line x1="10" x2="10" y1="15" y2="9"></line><line x1="14" x2="14" y1="15" y2="9"></line>',
    "loader-circle": '<path d="M21 12a9 9 0 1 1-6.219-8.56"></path>',
    ellipsis: '<circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle>'
  };

  var state = {
    query: "",
    status: "all",
    sort: "descending"
  };

  var tbody = document.getElementById("projects-body");
  var searchInput = document.getElementById("project-search");
  var statusFilter = document.getElementById("status-filter");
  var filtersForm = document.getElementById("filters");
  var clearButton = document.getElementById("clear-filters");
  var resultCount = document.getElementById("result-count");
  var paginationSummary = document.getElementById("pagination-summary");
  var sortButton = document.getElementById("sort-updated");

  var themeToggle = document.getElementById("theme-toggle");
  var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");

  var navToggle = document.getElementById("nav-toggle");
  var sidebar = document.getElementById("sidebar");
  var backdrop = document.getElementById("backdrop");
  var main = document.getElementById("main");
  var drawerMedia = window.matchMedia("(max-width: 1023px)");
  var drawerOpen = false;

  var menu = document.getElementById("project-menu");
  var menuItems = Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]'));
  var menuTrigger = null;
  var activeProject = null;

  var tableStatus = document.getElementById("table-status");
  var statusTimer = null;

  var tableRegion = document.getElementById("table-region");
  var emptyState = document.getElementById("empty-state");
  var emptyClear = document.getElementById("empty-clear");
  var tableFooter = document.querySelector(".table-footer");
  var sortState = document.getElementById("sort-state");
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function createIcon(name, size) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.innerHTML = ICONS[name];
    return svg;
  }

  function isFilterActive() {
    return state.query.trim().length > 0 || state.status !== "all";
  }

  function readUrlState() {
    var params = new URLSearchParams(window.location.search);
    var query = params.get("q");
    var status = params.get("status");
    var sort = params.get("sort");
    state.query = query || "";
    state.status = ["ready", "building", "failed", "paused"].indexOf(status) !== -1 ? status : "all";
    state.sort = sort === "asc" ? "ascending" : "descending";
  }

  function syncUrl() {
    var params = new URLSearchParams();
    if (state.query.trim()) {
      params.set("q", state.query);
    }
    if (state.status !== "all") {
      params.set("status", state.status);
    }
    if (state.sort !== "descending") {
      params.set("sort", "asc");
    }
    var queryString = params.toString();
    var next = window.location.pathname + (queryString ? "?" + queryString : "") + window.location.hash;
    try {
      window.history.replaceState(null, "", next);
    } catch (error) {}
  }

  function syncSortControl() {
    sortButton.dataset.direction = state.sort;
    sortButton.closest("th").setAttribute("aria-sort", state.sort);
    sortButton.title = "Sort by updated date, currently " + state.sort;
    if (sortState) {
      sortState.textContent = ", sorted " + state.sort;
    }
  }

  function applyUrlState() {
    readUrlState();
    searchInput.value = state.query;
    statusFilter.value = state.status;
    syncSortControl();
    render();
  }

  function getVisibleProjects() {
    var query = state.query.trim().toLowerCase();
    var filtered = projects.filter(function (project) {
      var matchesQuery = !query ||
        project.name.toLowerCase().indexOf(query) !== -1 ||
        project.slug.toLowerCase().indexOf(query) !== -1;
      var matchesStatus = state.status === "all" || project.status === state.status;
      return matchesQuery && matchesStatus;
    });

    return filtered.slice().sort(function (a, b) {
      var comparison = a.updated.localeCompare(b.updated);
      return state.sort === "ascending" ? comparison : -comparison;
    });
  }

  function createRow(project) {
    var row = document.createElement("tr");
    row.dataset.slug = project.slug;

    var nameCell = document.createElement("td");
    var projectWrap = document.createElement("div");
    projectWrap.className = "project";
    var name = document.createElement("span");
    name.className = "project-name";
    name.textContent = project.name;
    var slug = document.createElement("span");
    slug.className = "project-slug";
    slug.textContent = project.slug;
    projectWrap.appendChild(name);
    projectWrap.appendChild(slug);
    nameCell.appendChild(projectWrap);

    var statusCell = document.createElement("td");
    var statusMeta = STATUS_META[project.status];
    var status = document.createElement("span");
    status.className = "status " + statusMeta.tone;
    status.appendChild(createIcon(statusMeta.icon, 16));
    status.appendChild(document.createTextNode(statusMeta.label));
    statusCell.appendChild(status);

    var environmentCell = document.createElement("td");
    var tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = project.environment;
    environmentCell.appendChild(tag);

    var ownerCell = document.createElement("td");
    var owner = document.createElement("div");
    owner.className = "owner";
    var avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = project.owner.initials;
    owner.appendChild(avatar);
    owner.appendChild(document.createTextNode(project.owner.name));
    ownerCell.appendChild(owner);

    var updatedCell = document.createElement("td");
    updatedCell.className = "cell-updated";
    var time = document.createElement("time");
    time.setAttribute("datetime", project.updated);
    time.textContent = project.updated;
    updatedCell.appendChild(time);

    var actionsCell = document.createElement("td");
    actionsCell.className = "col-actions";
    var actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "icon-button row-action";
    actionButton.setAttribute("aria-label", "Project actions for " + project.name);
    actionButton.setAttribute("aria-haspopup", "menu");
    actionButton.setAttribute("aria-expanded", "false");
    actionButton.setAttribute("aria-controls", "project-menu");
    actionButton.title = "Project actions";
    actionButton.appendChild(createIcon("ellipsis", 20));
    actionsCell.appendChild(actionButton);

    row.appendChild(nameCell);
    row.appendChild(statusCell);
    row.appendChild(environmentCell);
    row.appendChild(ownerCell);
    row.appendChild(updatedCell);
    row.appendChild(actionsCell);
    return row;
  }

  function render() {
    closeMenu(false);

    var visible = getVisibleProjects();
    var count = visible.length;
    var fragment = document.createDocumentFragment();

    visible.forEach(function (project) {
      fragment.appendChild(createRow(project));
    });

    tbody.replaceChildren(fragment);
    resultCount.textContent = count + (count === 1 ? " project" : " projects");
    paginationSummary.textContent = count === 0 ? "0 of 0" : "1–" + count + " of " + count;
    clearButton.hidden = !isFilterActive();
    tableRegion.hidden = count === 0;
    emptyState.hidden = count !== 0;
    tableFooter.hidden = count === 0;
    syncUrl();
  }

  function clearFilters(focusSearch) {
    state.query = "";
    state.status = "all";
    searchInput.value = "";
    statusFilter.value = "all";
    render();
    if (focusSearch) {
      searchInput.focus();
    }
  }

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value;
    render();
  });

  searchInput.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && searchInput.value !== "") {
      event.preventDefault();
      state.query = "";
      searchInput.value = "";
      render();
    }
  });

  statusFilter.addEventListener("change", function () {
    state.status = statusFilter.value;
    render();
  });

  filtersForm.addEventListener("submit", function (event) {
    event.preventDefault();
  });

  clearButton.addEventListener("click", function () {
    clearFilters(true);
  });

  emptyClear.addEventListener("click", function () {
    clearFilters(true);
  });

  sortButton.addEventListener("click", function () {
    state.sort = state.sort === "descending" ? "ascending" : "descending";
    syncSortControl();
    render();
  });

  tbody.addEventListener("click", function (event) {
    var trigger = event.target.closest(".row-action");
    if (!trigger) {
      return;
    }
    toggleMenu(trigger);
  });

  function positionMenu() {
    var triggerRect = menuTrigger.getBoundingClientRect();
    var menuRect = menu.getBoundingClientRect();
    var margin = 8;
    var gap = 4;
    var top = triggerRect.bottom + gap;

    if (top + menuRect.height > window.innerHeight - margin) {
      top = triggerRect.top - menuRect.height - gap;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - menuRect.height - margin));

    var left = triggerRect.right - menuRect.width;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuRect.width - margin));

    menu.style.top = top + "px";
    menu.style.left = left + "px";
  }

  function openMenu(trigger) {
    var row = trigger.closest("tr");
    if (!row) {
      return;
    }
    var project = projects.find(function (item) {
      return item.slug === row.dataset.slug;
    });
    if (!project) {
      return;
    }

    if (menuTrigger && menuTrigger !== trigger) {
      menuTrigger.setAttribute("aria-expanded", "false");
    }

    activeProject = project;
    menuTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    menu.setAttribute("aria-label", "Project actions for " + project.name);
    menu.hidden = false;
    positionMenu();
    menuItems[0].focus();
  }

  function closeMenu(restoreFocus, deferFocus) {
    if (!menuTrigger) {
      menu.hidden = true;
      return;
    }
    var trigger = menuTrigger;
    trigger.setAttribute("aria-expanded", "false");
    menu.hidden = true;
    menuTrigger = null;
    activeProject = null;
    if (restoreFocus) {
      if (deferFocus) {
        window.setTimeout(function () {
          if (document.contains(trigger)) {
            trigger.focus();
          }
        }, 0);
      } else {
        trigger.focus();
      }
    }
  }

  function toggleMenu(trigger) {
    if (!menu.hidden && menuTrigger === trigger) {
      closeMenu(true);
      return;
    }
    closeMenu(false);
    openMenu(trigger);
  }

  menu.addEventListener("keydown", function (event) {
    var index = menuItems.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      menuItems[(index + 1) % menuItems.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      menuItems[(index - 1 + menuItems.length) % menuItems.length].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      menuItems[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      menuItems[menuItems.length - 1].focus();
    } else if (event.key === "Tab") {
      var trigger = menuTrigger;
      closeMenu(false);
      if (trigger) {
        trigger.focus();
      }
    }
  });

  menu.addEventListener("click", function (event) {
    var item = event.target.closest(".menu__item");
    if (!item) {
      return;
    }
    var action = item.dataset.action;
    var project = activeProject;
    closeMenu(true);

    if (action === "copy" && project) {
      copyProjectId(project);
    }
  });

  document.addEventListener("pointerdown", function (event) {
    if (menu.hidden) {
      return;
    }
    if (menu.contains(event.target) || event.target.closest(".row-action")) {
      return;
    }
    var focusable = event.target.closest("a[href], button, input, select, textarea, [tabindex]:not([tabindex=\"-1\"])");
    if (focusable) {
      closeMenu(false);
    } else {
      closeMenu(true, true);
    }
  }, true);

  window.addEventListener("resize", function () {
    if (!menu.hidden) {
      closeMenu(false);
    }
  });

  window.addEventListener("scroll", function () {
    if (!menu.hidden) {
      closeMenu(false);
    }
  }, true);

  function copyText(value) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      }).catch(function () {
        return legacyCopy(value);
      });
    }
    return Promise.resolve(legacyCopy(value));
  }

  function legacyCopy(value) {
    var previouslyFocused = document.activeElement;
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.setAttribute("aria-hidden", "true");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    field.remove();
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
    return copied;
  }

  function copyProjectId(project) {
    copyText(project.id).then(function (copied) {
      if (copied) {
        showStatus("Project ID copied.", "success", 2000);
      } else {
        showStatus("Couldn't copy the project ID. Try again.", "error");
      }
    });
  }

  function showStatus(message, tone, duration) {
    window.clearTimeout(statusTimer);
    tableStatus.textContent = "";
    tableStatus.classList.toggle("inline-status--success", tone === "success");
    tableStatus.classList.toggle("inline-status--error", tone === "error");
    tableStatus.appendChild(createIcon(tone === "error" ? "circle-x" : "circle-check", 16));
    tableStatus.appendChild(document.createTextNode(message));

    if (tone !== "error") {
      statusTimer = window.setTimeout(function () {
        tableStatus.textContent = "";
        tableStatus.classList.remove("inline-status--success");
      }, duration || 6000);
    }
  }

  function updateThemeButton(theme) {
    var next = theme === "dark" ? "light" : "dark";
    var label = "Switch to " + next + " theme";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
  }

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    root.style.colorScheme = theme;
    if (themeMeta) {
      themeMeta.setAttribute("content", theme === "dark" ? "#161616" : "#FFFFFF");
    }
    updateThemeButton(theme);
  }

  function readStoredTheme() {
    try {
      var value = window.localStorage.getItem(THEME_KEY);
      return value === "light" || value === "dark" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function persistTheme(theme) {
    try {
      if ((theme === "dark") === prefersDark.matches) {
        window.localStorage.removeItem(THEME_KEY);
      } else {
        window.localStorage.setItem(THEME_KEY, theme);
      }
    } catch (error) {
      /* Storage can be unavailable on file://; the theme still applies for this session. */
    }
  }

  themeToggle.addEventListener("click", function () {
    var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    persistTheme(next);
  });

  function handleSchemeChange(event) {
    if (readStoredTheme() === null) {
      applyTheme(event.matches ? "dark" : "light");
    }
  }

  if (typeof prefersDark.addEventListener === "function") {
    prefersDark.addEventListener("change", handleSchemeChange);
  } else if (typeof prefersDark.addListener === "function") {
    prefersDark.addListener(handleSchemeChange);
  }

  applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

  function updateNavToggle(open) {
    var label = open ? "Close navigation" : "Open navigation";
    navToggle.setAttribute("aria-label", label);
    navToggle.title = label;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function openDrawer() {
    if (!drawerMedia.matches) {
      return;
    }
    closeMenu(false);
    drawerOpen = true;
    sidebar.removeAttribute("inert");
    sidebar.classList.add("is-open");
    backdrop.classList.add("is-open");
    main.setAttribute("inert", "");
    document.body.classList.add("nav-open");
    updateNavToggle(true);
    window.requestAnimationFrame(function () {
      var first = sidebar.querySelector(".nav__item");
      if (first) {
        first.focus();
      }
    });
  }

  function closeDrawer(restoreFocus) {
    if (!drawerOpen) {
      return;
    }
    drawerOpen = false;
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    main.removeAttribute("inert");
    document.body.classList.remove("nav-open");
    updateNavToggle(false);
    if (restoreFocus) {
      navToggle.focus();
    }
    if (drawerMedia.matches) {
      sidebar.setAttribute("inert", "");
    }
  }

  function syncDrawerMode() {
    if (drawerMedia.matches) {
      if (!drawerOpen) {
        sidebar.setAttribute("inert", "");
        main.removeAttribute("inert");
      }
      return;
    }

    drawerOpen = false;
    sidebar.classList.remove("is-open");
    backdrop.classList.remove("is-open");
    sidebar.removeAttribute("inert");
    main.removeAttribute("inert");
    document.body.classList.remove("nav-open");
    updateNavToggle(false);
  }

  navToggle.addEventListener("click", function () {
    if (drawerOpen) {
      closeDrawer(true);
    } else {
      openDrawer();
    }
  });

  backdrop.addEventListener("click", function () {
    closeDrawer(true);
  });

  sidebar.querySelectorAll(".nav__item").forEach(function (link) {
    link.addEventListener("click", function () {
      if (drawerOpen) {
        closeDrawer(true);
      }
    });
  });

  if (typeof drawerMedia.addEventListener === "function") {
    drawerMedia.addEventListener("change", syncDrawerMode);
  } else if (typeof drawerMedia.addListener === "function") {
    drawerMedia.addListener(syncDrawerMode);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (!menu.hidden) {
        event.preventDefault();
        closeMenu(true);
        return;
      }
      if (drawerOpen) {
        event.preventDefault();
        closeDrawer(true);
        return;
      }
    }

    if (event.key === "Tab" && drawerOpen && drawerMedia.matches) {
      var focusable = [navToggle].concat(
        Array.prototype.slice.call(
          sidebar.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')
        )
      );
      var first = focusable[0];
      var last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  window.addEventListener("popstate", applyUrlState);

  syncDrawerMode();
  applyUrlState();
})();
