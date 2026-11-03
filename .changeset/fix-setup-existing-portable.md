---
"funnel": patch
---

Fix re-running `funnel setup` and `funnel uninstall` over an existing portable installation. An empty value in `funnel.env` is now read as empty, so `FUNNEL_URL=` no longer resolves to the next comment line (which opened a bogus `# 32-byte encryption secret .../onboarding` URL on Windows). Setup stops the previous process before writing the new manifest, so the port is actually released, and reports the process log when the replacement exits immediately instead of waiting 45 seconds for a health check. Uninstall now finds processes still running the installed image when the manifest PID is missing, retries and moves aside a binary that Windows still has mapped (instead of failing with `EFAULT`), and leaves locked leftovers for the next run. The browser opener also refuses non-HTTP values.
