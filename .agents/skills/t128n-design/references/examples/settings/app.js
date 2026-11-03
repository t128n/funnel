(function () {
  "use strict";

  var root = document.documentElement;
  var THEME_KEY = "t128n-theme";
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function byId(id) {
    return document.getElementById(id);
  }

  function themeName(theme) {
    return theme === "dark" ? "Dark" : "Light";
  }

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

  var themeToggle = byId("theme-toggle");
  var themeStatus = byId("theme-status");
  var themeMeta = document.querySelector('meta[name="theme-color"]');

  function updateThemeControl(theme) {
    if (!themeToggle) {
      return;
    }
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
    updateThemeControl(theme);
  }

  if (themeToggle) {
    applyTheme(root.getAttribute("data-theme") === "dark" ? "dark" : "light");

    themeToggle.addEventListener("click", function () {
      var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
      var next = current === "dark" ? "light" : "dark";
      var followsSystem = next === systemTheme();

      try {
        if (followsSystem) {
          window.localStorage.removeItem(THEME_KEY);
        } else {
          window.localStorage.setItem(THEME_KEY, next);
        }
      } catch (error) {
        /* Storage may be unavailable from file://; the resolved theme still applies. */
      }

      applyTheme(next);

      if (themeStatus) {
        themeStatus.textContent = followsSystem
          ? themeName(next) + " theme. Following system preference."
          : themeName(next) + " theme.";
      }
    });
  }

  function handleSystemThemeChange() {
    if (!readStoredTheme()) {
      applyTheme(systemTheme());
    }
  }

  if (darkQuery) {
    if (typeof darkQuery.addEventListener === "function") {
      darkQuery.addEventListener("change", handleSystemThemeChange);
    } else if (typeof darkQuery.addListener === "function") {
      darkQuery.addListener(handleSystemThemeChange);
    }
  }

  /* Navigation drawer */
  var sidebar = byId("sidebar");
  var menuButton = byId("menu-button");
  var navBackdrop = byId("nav-backdrop");
  var main = byId("main");
  var narrowQuery = window.matchMedia ? window.matchMedia("(max-width: 1023px)") : null;
  var drawerOpen = false;
  var backdropTimer = 0;
  var focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

  function isNarrow() {
    return narrowQuery ? narrowQuery.matches : false;
  }

  function focusableIn(container) {
    if (!container) {
      return [];
    }
    return Array.prototype.slice.call(container.querySelectorAll(focusableSelector)).filter(function (element) {
      return element.getClientRects().length > 0 && !element.closest("[hidden]");
    });
  }

  function openDrawer() {
    if (!isNarrow() || drawerOpen || !sidebar || !menuButton) {
      return;
    }

    drawerOpen = true;

    if (main) {
      main.inert = true;
    }

    sidebar.removeAttribute("inert");
    sidebar.removeAttribute("aria-hidden");
    sidebar.classList.add("is-open");
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "Close navigation");
    menuButton.title = "Close navigation";
    document.body.classList.add("nav-open");

    if (navBackdrop) {
      window.clearTimeout(backdropTimer);
      navBackdrop.hidden = false;
      window.requestAnimationFrame(function () {
        navBackdrop.classList.add("is-visible");
      });
    }

    var firstFocus = focusableIn(sidebar)[0];
    if (firstFocus) {
      firstFocus.focus();
    }
  }

  function closeDrawer(options) {
    var settings = options || {};

    if (!drawerOpen || !sidebar) {
      return;
    }

    drawerOpen = false;
    sidebar.classList.remove("is-open");

    if (main) {
      main.inert = false;
    }
    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open navigation");
      menuButton.title = "Open navigation";
    }

    document.body.classList.remove("nav-open");

    if (navBackdrop) {
      navBackdrop.classList.remove("is-visible");
      window.clearTimeout(backdropTimer);
      backdropTimer = window.setTimeout(function () {
        if (!drawerOpen) {
          navBackdrop.hidden = true;
        }
      }, 180);
    }

    if (isNarrow()) {
      sidebar.setAttribute("aria-hidden", "true");
      sidebar.setAttribute("inert", "");
    }

    if (settings.restoreFocus !== false && menuButton) {
      menuButton.focus();
    }
  }

  function syncNavigation() {
    if (!sidebar) {
      return;
    }

    if (isNarrow()) {
      if (!drawerOpen) {
        sidebar.setAttribute("aria-hidden", "true");
        sidebar.setAttribute("inert", "");
      }
      return;
    }

    if (drawerOpen) {
      closeDrawer({ restoreFocus: false });
    }

    sidebar.removeAttribute("aria-hidden");
    sidebar.removeAttribute("inert");

    if (menuButton) {
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", "Open navigation");
      menuButton.title = "Open navigation";
    }
    if (navBackdrop) {
      navBackdrop.classList.remove("is-visible");
      navBackdrop.hidden = true;
    }

    document.body.classList.remove("nav-open");
  }

  if (menuButton) {
    menuButton.addEventListener("click", function () {
      if (drawerOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (navBackdrop) {
    navBackdrop.addEventListener("click", function () {
      closeDrawer();
    });
  }

  if (sidebar) {
    Array.prototype.forEach.call(sidebar.querySelectorAll("a"), function (link) {
      link.addEventListener("click", function (event) {
        if (link.hasAttribute("data-placeholder")) {
          event.preventDefault();
        }
        if (isNarrow()) {
          closeDrawer();
        }
      });
    });
  }

  if (narrowQuery) {
    if (typeof narrowQuery.addEventListener === "function") {
      narrowQuery.addEventListener("change", syncNavigation);
    } else if (typeof narrowQuery.addListener === "function") {
      narrowQuery.addListener(syncNavigation);
    }
  }

  document.addEventListener("keydown", function (event) {
    var dialog = byId("delete-dialog");

    if (!drawerOpen || (dialog && dialog.open)) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeDrawer();
      return;
    }

    if (event.key !== "Tab" || !sidebar) {
      return;
    }

    var items = focusableIn(sidebar);
    if (!items.length) {
      return;
    }

    var first = items[0];
    var last = items[items.length - 1];

    if (!sidebar.contains(document.activeElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  syncNavigation();

  /* Settings form */
  var form = byId("settings-form");
  var saveButton = byId("save-button");
  var saveLabel = byId("save-label");
  var saveSpinner = byId("save-spinner");
  var discardButton = byId("discard-button");
  var formStatus = byId("form-status");
  var formStatusText = byId("form-status-text");
  var formStatusErrorIcon = formStatus ? formStatus.querySelector(".form-status__icon--error") : null;
  var formStatusSuccessIcon = formStatus ? formStatus.querySelector(".form-status__icon--success") : null;
  var isSaving = false;

  function makeField(inputId, errorId) {
    var input = byId(inputId);
    var error = byId(errorId);
    return {
      input: input,
      error: error,
      errorText: error ? error.querySelector(".field__error-text") : null,
      helpId: input ? input.getAttribute("aria-describedby") : "",
      hasError: false
    };
  }

  var displayNameField = makeField("display-name", "display-name-error");
  var emailField = makeField("email", "email-error");
  var currentPasswordField = makeField("current-password", "current-password-error");
  var newPasswordField = makeField("new-password", "new-password-error");
  var confirmPasswordField = makeField("confirm-password", "confirm-password-error");
  var passwordFields = [currentPasswordField, newPasswordField, confirmPasswordField];
  var timezoneInput = byId("timezone");
  var jobTitleInput = byId("job-title");

  function setFieldError(field, message) {
    if (!field || !field.input || !field.error) {
      return;
    }

    if (message) {
      if (field.errorText) {
        field.errorText.textContent = message;
      }
      field.error.hidden = false;
      field.input.setAttribute("aria-invalid", "true");
      field.input.setAttribute(
        "aria-describedby",
        [field.helpId, field.error.id].filter(Boolean).join(" ")
      );
      field.hasError = true;
      return;
    }

    if (field.errorText) {
      field.errorText.textContent = "";
    }
    field.error.hidden = true;
    field.input.removeAttribute("aria-invalid");

    if (field.helpId) {
      field.input.setAttribute("aria-describedby", field.helpId);
    } else {
      field.input.removeAttribute("aria-describedby");
    }

    field.hasError = false;
  }

  function displayNameMessage() {
    return displayNameField.input && displayNameField.input.value.trim()
      ? ""
      : "Enter your display name.";
  }

  function emailMessage() {
    if (!emailField.input) {
      return "";
    }

    var value = emailField.input.value.trim();
    if (!value) {
      return "Enter your email address.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return "Enter a valid email address, like name@example.com.";
    }
    return "";
  }

  function passwordChangeRequested() {
    return Boolean(
      (newPasswordField.input && newPasswordField.input.value.length) ||
      (confirmPasswordField.input && confirmPasswordField.input.value.length)
    );
  }

  function passwordMessages() {
    if (!passwordChangeRequested()) {
      return null;
    }

    var currentValue = currentPasswordField.input.value;
    var newValue = newPasswordField.input.value;
    var confirmValue = confirmPasswordField.input.value;
    var messages = { current: "", newPassword: "", confirmPassword: "" };

    if (!currentValue) {
      messages.current = "Enter your current password to set a new one.";
    }

    if (!newValue) {
      messages.newPassword = "Enter a new password.";
    } else if (newValue.length < 12) {
      messages.newPassword = "Use at least 12 characters for your new password.";
    }

    if (!confirmValue) {
      messages.confirmPassword = "Re-enter your new password.";
    } else if (newValue !== confirmValue) {
      messages.confirmPassword = "The passwords don't match. Check both fields.";
    }

    return messages;
  }

  function validatePasswordGroup() {
    var messages = passwordMessages();

    if (!messages) {
      passwordFields.forEach(function (field) {
        setFieldError(field, "");
      });
      return true;
    }

    setFieldError(currentPasswordField, messages.current);
    setFieldError(newPasswordField, messages.newPassword);
    setFieldError(confirmPasswordField, messages.confirmPassword);

    return !messages.current && !messages.newPassword && !messages.confirmPassword;
  }

  function setFormStatus(type, message) {
    if (!formStatus || !formStatusText) {
      return;
    }

    formStatus.hidden = false;
    formStatus.className = "form-status" + (type ? " form-status--" + type : "");
    formStatusText.textContent = message;

    if (formStatusErrorIcon) {
      formStatusErrorIcon.hidden = type !== "error";
    }
    if (formStatusSuccessIcon) {
      formStatusSuccessIcon.hidden = type !== "success";
    }
  }

  function clearFormStatus() {
    if (!formStatus || !formStatusText) {
      return;
    }

    formStatus.hidden = true;
    formStatus.className = "form-status";
    formStatusText.textContent = "";

    if (formStatusErrorIcon) {
      formStatusErrorIcon.hidden = true;
    }
    if (formStatusSuccessIcon) {
      formStatusSuccessIcon.hidden = true;
    }
  }

  function readProfileValues() {
    return {
      displayName: displayNameField.input ? displayNameField.input.value : "",
      email: emailField.input ? emailField.input.value : "",
      timezone: timezoneInput ? timezoneInput.value : "",
      jobTitle: jobTitleInput ? jobTitleInput.value : ""
    };
  }

  var savedValues = readProfileValues();

  function restoreProfileValues(values) {
    if (displayNameField.input) {
      displayNameField.input.value = values.displayName;
    }
    if (emailField.input) {
      emailField.input.value = values.email;
    }
    if (timezoneInput) {
      timezoneInput.value = values.timezone;
    }
    if (jobTitleInput) {
      jobTitleInput.value = values.jobTitle;
    }
  }

  function finishSaving() {
    isSaving = false;

    if (saveButton) {
      saveButton.removeAttribute("aria-busy");
      saveButton.removeAttribute("aria-disabled");
      saveButton.removeAttribute("aria-label");
      saveButton.style.width = "";
    }
    if (saveLabel) {
      saveLabel.textContent = "Save Changes";
    }
    if (saveSpinner) {
      saveSpinner.hidden = true;
    }
    if (discardButton) {
      discardButton.disabled = false;
    }

    savedValues = readProfileValues();

    passwordFields.forEach(function (field) {
      if (field.input) {
        field.input.value = "";
      }
      setFieldError(field, "");
    });

    setFormStatus("success", "Settings saved.");
  }

  function startSaving() {
    if (isSaving || !saveButton) {
      return;
    }

    isSaving = true;

    var width = saveButton.getBoundingClientRect().width;
    saveButton.style.width = width + "px";
    saveButton.setAttribute("aria-busy", "true");
    saveButton.setAttribute("aria-disabled", "true");
    saveButton.setAttribute("aria-label", "Save Changes");

    if (discardButton) {
      discardButton.disabled = true;
    }
    if (saveLabel) {
      saveLabel.textContent = "Saving…";
    }
    if (saveSpinner) {
      saveSpinner.hidden = false;
    }

    setFormStatus("neutral", "Saving changes…");
    window.setTimeout(finishSaving, 700);
  }

  if (saveButton) {
    saveButton.addEventListener("click", function (event) {
      if (isSaving) {
        event.preventDefault();
      }
    });
  }

  function isDirty() {
    var current = readProfileValues();
    if (
      current.displayName !== savedValues.displayName ||
      current.email !== savedValues.email ||
      current.timezone !== savedValues.timezone ||
      current.jobTitle !== savedValues.jobTitle
    ) {
      return true;
    }
    return passwordFields.some(function (field) {
      return field.input && field.input.value.length > 0;
    });
  }

  window.addEventListener("beforeunload", function (event) {
    if (!isSaving && isDirty()) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  if (form) {
    form.addEventListener("input", clearFormStatus);
    form.addEventListener("change", clearFormStatus);

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (isSaving) {
        return;
      }

      var invalidFields = [];

      var nameError = displayNameMessage();
      setFieldError(displayNameField, nameError);
      if (nameError) {
        invalidFields.push(displayNameField);
      }

      var mailError = emailMessage();
      setFieldError(emailField, mailError);
      if (mailError) {
        invalidFields.push(emailField);
      }

      if (!validatePasswordGroup()) {
        passwordFields.forEach(function (field) {
          if (field.hasError) {
            invalidFields.push(field);
          }
        });
      }

      if (invalidFields.length) {
        var count = invalidFields.length;
        setFormStatus(
          "error",
          count + " " + (count === 1 ? "field needs" : "fields need") +
            " attention. Check the highlighted " + (count === 1 ? "field." : "fields.")
        );
        invalidFields[0].input.focus();
        return;
      }

      if (displayNameField.input) {
        displayNameField.input.value = displayNameField.input.value.trim();
      }
      if (emailField.input) {
        emailField.input.value = emailField.input.value.trim();
      }
      if (jobTitleInput) {
        jobTitleInput.value = jobTitleInput.value.trim();
      }

      startSaving();
    });
  }

  if (discardButton) {
    discardButton.addEventListener("click", function () {
      if (isSaving) {
        return;
      }

      restoreProfileValues(savedValues);

      passwordFields.forEach(function (field) {
        if (field.input) {
          field.input.value = "";
        }
        setFieldError(field, "");
      });

      setFieldError(displayNameField, "");
      setFieldError(emailField, "");
      setFormStatus("neutral", "Changes discarded.");
    });
  }

  if (form) {
    displayNameField.input.addEventListener("blur", function () {
      setFieldError(displayNameField, displayNameMessage());
    });

    displayNameField.input.addEventListener("input", function () {
      if (displayNameField.hasError) {
        setFieldError(displayNameField, displayNameMessage());
      }
    });

    emailField.input.addEventListener("blur", function () {
      setFieldError(emailField, emailMessage());
    });

    emailField.input.addEventListener("input", function () {
      if (emailField.hasError) {
        setFieldError(emailField, emailMessage());
      }
    });

    passwordFields.forEach(function (field) {
      field.input.addEventListener("blur", function () {
        validatePasswordGroup();
      });

      field.input.addEventListener("input", function () {
        var anyError = passwordFields.some(function (passwordField) {
          return passwordField.hasError;
        });

        if (anyError) {
          validatePasswordGroup();
        } else if (!passwordChangeRequested()) {
          passwordFields.forEach(function (passwordField) {
            setFieldError(passwordField, "");
          });
        }
      });
    });
  }

  /* Members */
  var membersList = byId("members-list");
  var memberCount = byId("member-count");
  var membersEmpty = byId("members-empty");
  var membersHeading = byId("members-heading");
  var membersStatus = byId("members-status");
  var inviteMemberButton = byId("invite-member");
  var memberRows = membersList
    ? Array.prototype.slice.call(membersList.querySelectorAll(".member"))
    : [];
  var removeDialog = byId("remove-dialog");
  var removeDialogTitle = byId("remove-dialog-title");
  var removeDialogDescription = byId("remove-dialog-description");
  var removeCancel = byId("remove-cancel");
  var removeConfirm = byId("remove-confirm");
  var memberToRemove = null;
  var pendingMemberFocus = null;
  var membersStatusTimer = 0;

  var CHECK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>';
  var ALERT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';

  function setMembersStatus(message, tone, duration) {
    if (!membersStatus) {
      return;
    }
    window.clearTimeout(membersStatusTimer);
    membersStatus.classList.toggle("section-status--success", tone === "success");
    membersStatus.classList.toggle("section-status--error", tone === "error");
    membersStatus.innerHTML = message ? (tone === "error" ? ALERT_ICON : CHECK_ICON) + "<span></span>" : "";
    if (message) {
      membersStatus.querySelector("span").textContent = message;
    }
    if (message && duration) {
      membersStatusTimer = window.setTimeout(function () {
        setMembersStatus("");
      }, duration);
    }
  }

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
    var field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
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
    return copied;
  }

  function updateMemberSummary() {
    var visible = memberRows.filter(function (row) {
      return !row.hidden;
    }).length;

    if (memberCount) {
      memberCount.textContent = visible + " " + (visible === 1 ? "member" : "members");
    }
    if (membersEmpty) {
      membersEmpty.hidden = visible !== 0;
    }
    if (membersList) {
      membersList.hidden = visible === 0;
    }
  }

  function openRemoveDialog(button) {
    if (!removeDialog || typeof removeDialog.showModal !== "function") {
      return;
    }
    var row = button.closest(".member");
    if (!row || row.hidden) {
      return;
    }
    var name = row.querySelector(".member__name").textContent;
    memberToRemove = { row: row, button: button, name: name };
    pendingMemberFocus = null;
    removeDialogTitle.textContent = "Remove " + name + "?";
    removeDialogDescription.textContent = name + " will lose access to the Personal workspace. You can add them again later.";
    removeDialog.showModal();
    document.body.classList.add("dialog-open");
    if (removeCancel) {
      removeCancel.focus();
    }
  }

  if (membersList) {
    membersList.addEventListener("click", function (event) {
      var button = event.target.closest("[data-member-remove]");
      if (button) {
        openRemoveDialog(button);
      }
    });
  }

  if (removeCancel) {
    removeCancel.addEventListener("click", function () {
      if (removeDialog) {
        removeDialog.close("cancel");
      }
    });
  }

  if (removeConfirm) {
    removeConfirm.addEventListener("click", function () {
      if (!memberToRemove || !removeDialog) {
        return;
      }
      var row = memberToRemove.row;
      var button = memberToRemove.button;
      var name = memberToRemove.name;
      var visibleButtons = memberRows
        .filter(function (memberRow) {
          return !memberRow.hidden;
        })
        .map(function (memberRow) {
          return memberRow.querySelector("[data-member-remove]");
        })
        .filter(Boolean);
      var index = visibleButtons.indexOf(button);
      pendingMemberFocus = visibleButtons[index + 1] || visibleButtons[index - 1] || membersHeading;
      memberToRemove = null;
      row.hidden = true;
      updateMemberSummary();
      removeDialog.close("confirm");
      setMembersStatus(name + " removed.", "success");
    });
  }

  if (removeDialog) {
    removeDialog.addEventListener("cancel", function () {
      pendingMemberFocus = null;
    });

    removeDialog.addEventListener("close", function () {
      document.body.classList.remove("dialog-open");
      var restore = memberToRemove ? memberToRemove.button : pendingMemberFocus;
      memberToRemove = null;
      pendingMemberFocus = null;
      if (restore && document.contains(restore)) {
        restore.focus();
      }
    });

    removeDialog.addEventListener("click", function (event) {
      if (event.target !== removeDialog) {
        return;
      }
      var rect = removeDialog.getBoundingClientRect();
      var outside = event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;
      if (outside) {
        removeDialog.close("backdrop");
      }
    });
  }

  if (inviteMemberButton) {
    inviteMemberButton.addEventListener("click", function () {
      copyText("https://t128n.app/invite/personal").then(function (copied) {
        setMembersStatus(
          copied ? "Invite link copied." : "Couldn't copy the invite link. Try again.",
          copied ? "success" : "error",
          copied ? 2000 : 0
        );
      });
    });
  }

  updateMemberSummary();

  /* Delete dialog */
  var deleteButton = byId("delete-workspace-button");
  var deleteDialog = byId("delete-dialog");
  var dialogCancel = byId("dialog-cancel");
  var dialogConfirm = byId("dialog-confirm");
  var deleteStatus = byId("delete-status");
  var deleteStatusText = byId("delete-status-text");
  var dialogTrigger = null;
  var deleteConfirmed = false;

  if (deleteButton && deleteDialog && typeof deleteDialog.showModal === "function") {
    deleteButton.addEventListener("click", function () {
      if (deleteDialog.open) {
        return;
      }

      dialogTrigger = deleteButton;
      deleteConfirmed = false;
      deleteDialog.showModal();
      document.body.classList.add("dialog-open");

      if (dialogCancel) {
        dialogCancel.focus();
      }
    });

    if (dialogCancel) {
      dialogCancel.addEventListener("click", function () {
        deleteDialog.close("cancel");
      });
    }

    if (dialogConfirm) {
      dialogConfirm.addEventListener("click", function () {
        deleteConfirmed = true;
        deleteDialog.close("confirm");
      });
    }

    deleteDialog.addEventListener("cancel", function () {
      deleteConfirmed = false;
    });

    deleteDialog.addEventListener("close", function () {
      document.body.classList.remove("dialog-open");

      if (dialogTrigger && document.contains(dialogTrigger)) {
        dialogTrigger.focus();
      }
      dialogTrigger = null;

      if (deleteConfirmed) {
        deleteConfirmed = false;

        if (deleteStatus && deleteStatusText) {
          deleteStatusText.textContent = "Deletion requested. The Personal workspace, its projects, deployments, and members will be permanently deleted.";
          deleteStatus.hidden = false;
        }
      }
    });

    deleteDialog.addEventListener("click", function (event) {
      if (event.target !== deleteDialog) {
        return;
      }

      var rect = deleteDialog.getBoundingClientRect();
      var outside = event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;

      if (outside) {
        deleteDialog.close("backdrop");
      }
    });

    deleteDialog.addEventListener("keydown", function (event) {
      if (event.key !== "Tab") {
        return;
      }

      var items = focusableIn(deleteDialog);
      if (!items.length) {
        return;
      }

      var first = items[0];
      var last = items[items.length - 1];

      if (!deleteDialog.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }
})();
