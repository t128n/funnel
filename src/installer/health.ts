export interface HealthResult {
  ok: boolean;
  status?: number;
  detail?: string;
}

export interface ReadinessResult extends HealthResult {
  body?: unknown;
}

async function request(
  url: string,
  timeoutMs: number,
): Promise<{ response?: Response; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return { response };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function waitForHealth(
  port: number,
  timeoutMs = 45_000,
): Promise<HealthResult> {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${port}/healthz`;
  let lastError = "timed out";
  while (Date.now() < deadline) {
    const { response, error } = await request(url, 2_000);
    if (response?.ok) return { ok: true, status: response.status };
    if (response) lastError = `HTTP ${response.status}`;
    if (error) lastError = error;
    await Bun.sleep(500);
  }
  return { ok: false, detail: lastError };
}

export async function checkReadiness(
  port: number,
  timeoutMs = 5_000,
): Promise<ReadinessResult> {
  const url = `http://127.0.0.1:${port}/readyz`;
  const { response, error } = await request(url, timeoutMs);
  if (!response) return { ok: false, detail: error };
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = undefined;
  }
  return {
    ok: response.ok,
    status: response.status,
    body,
    detail: response.ok ? undefined : `HTTP ${response.status}`,
  };
}

export function onboardingUrl(port: number, publicUrl = ""): string {
  return publicUrl
    ? `${publicUrl.replace(/\/$/, "")}/onboarding`
    : `http://127.0.0.1:${port}/onboarding`;
}
