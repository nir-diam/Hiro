import posthog from 'posthog-js';
import { DEFAULT_POSTHOG_HOST, type PosthogAnalyticsConfig } from '../services/publishingApi';

type LandingEventContext = {
  jobId: string;
  companyId?: string | null;
  src?: string | null;
};

let initialized = false;
let activeConfig: PosthogAnalyticsConfig | null = null;

const APPLICATION_STARTED_PREFIX = 'hiro_ph_application_started_';

function envPosthogKey(): string {
  return String(import.meta.env.VITE_POSTHOG_KEY || '').trim();
}

function envPosthogHost(): string {
  return String(import.meta.env.VITE_POSTHOG_HOST || DEFAULT_POSTHOG_HOST).trim();
}

function resolvePosthogKey(): string {
  return String(activeConfig?.key || envPosthogKey()).trim();
}

function normalizePosthogApiHost(raw: string): string {
  const host = String(raw || '').trim().replace(/\/$/, '');
  if (!host) return DEFAULT_POSTHOG_HOST;
  if (host.includes('eu.i.posthog.com') || host === 'https://eu.posthog.com') {
    return 'https://eu.i.posthog.com';
  }
  if (host.includes('us.i.posthog.com') || host === 'https://app.posthog.com') {
    return 'https://us.i.posthog.com';
  }
  return host;
}

function resolvePosthogHost(): string {
  return normalizePosthogApiHost(activeConfig?.host || envPosthogHost());
}

export function setLandingPostHogConfig(config?: PosthogAnalyticsConfig | null): void {
  const key = String(config?.key || '').trim();
  const host = String(config?.host || '').trim();
  activeConfig = key ? { key, host: host || DEFAULT_POSTHOG_HOST } : null;
}

export function isLandingPostHogConfigured(): boolean {
  return Boolean(resolvePosthogKey());
}

export function initLandingPostHog(): boolean {
  if (initialized || typeof window === 'undefined') return initialized;

  const key = resolvePosthogKey();
  if (!key) {
    if (import.meta.env.DEV) {
      console.info(
        '[PostHog] disabled — no project key. Save one in הגדרות חברה → PostHog, or set VITE_POSTHOG_KEY in .env.local',
      );
    }
    return false;
  }

  try {
    const host = resolvePosthogHost();
    posthog.init(key, {
      api_host: host,
      ui_host: host.includes('eu.i.posthog.com') ? 'https://eu.posthog.com' : 'https://us.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      persistence: 'sessionStorage',
      disable_session_recording: false,
      session_recording: {
        maskAllInputs: true,
      },
      loaded: (ph) => {
        try {
          ph.startSessionRecording();
        } catch {
          /* recording may be disabled in project settings */
        }
        if (import.meta.env.DEV) {
          console.info('[PostHog] loaded — events will be sent to', host);
        }
      },
      ...(import.meta.env.DEV ? { debug: true } : {}),
    });
    initialized = true;
    if (import.meta.env.DEV) {
      console.info('[PostHog] initialized', { host, keyPrefix: `${key.slice(0, 8)}…` });
    }
  } catch (err) {
    console.warn('[PostHog] init failed', err);
  }

  return initialized;
}

function baseProps(ctx: LandingEventContext): Record<string, string> {
  return {
    job_id: ctx.jobId,
    company_id: ctx.companyId ? String(ctx.companyId) : 'unknown',
    traffic_source: ctx.src || 'direct',
  };
}

function safeCapture(event: string, props: Record<string, string>) {
  if (!initialized) return;
  try {
    posthog.capture(event, props);
    if (import.meta.env.DEV) {
      console.info(`[PostHog] capture "${event}"`, props);
    }
  } catch (err) {
    console.warn(`[PostHog] capture ${event} failed`, err);
  }
}

export function registerLandingAnalyticsContext(ctx: LandingEventContext) {
  if (!initialized) return;
  try {
    posthog.register(baseProps(ctx));
  } catch (err) {
    console.warn('[PostHog] register failed', err);
  }
}

export function captureJobPageViewed(ctx: LandingEventContext) {
  if (!initLandingPostHog()) return;
  registerLandingAnalyticsContext(ctx);
  safeCapture('job_page_viewed', baseProps(ctx));
}

export function captureApplicationStarted(ctx: LandingEventContext) {
  if (!initLandingPostHog()) return;

  const storageKey = `${APPLICATION_STARTED_PREFIX}${ctx.jobId}`;
  try {
    if (sessionStorage.getItem(storageKey) === '1') return;
    sessionStorage.setItem(storageKey, '1');
  } catch {
    /* sessionStorage unavailable */
  }

  registerLandingAnalyticsContext(ctx);
  safeCapture('application_started', baseProps(ctx));
}

export function captureApplicationSubmittedSuccess(ctx: LandingEventContext) {
  if (!initLandingPostHog()) return;
  registerLandingAnalyticsContext(ctx);
  safeCapture('application_submitted_success', baseProps(ctx));
}

export function captureApplicationSubmittedFailed(
  ctx: LandingEventContext,
  errorReason: string,
) {
  if (!initLandingPostHog()) return;
  registerLandingAnalyticsContext(ctx);
  safeCapture('application_submitted_failed', {
    ...baseProps(ctx),
    error_reason: errorReason || 'unknown',
  });
}
