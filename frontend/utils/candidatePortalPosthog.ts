import posthog from 'posthog-js';
import { DEFAULT_POSTHOG_HOST } from '../services/publishingApi';

const RECORDING_ALLOWED_PREFIXES = ['/candidate-portal/profile'];

let initialized = false;
let recordingActive = false;

function envPosthogKey(): string {
  return String(
    import.meta.env.VITE_CANDIDATE_PORTAL_POSTHOG_KEY
      || import.meta.env.VITE_POSTHOG_KEY
      || '',
  ).trim();
}

function envPosthogHost(): string {
  return String(
    import.meta.env.VITE_CANDIDATE_PORTAL_POSTHOG_HOST
      || import.meta.env.VITE_POSTHOG_HOST
      || DEFAULT_POSTHOG_HOST,
  ).trim();
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

export function isCandidatePortalRecordingRoute(pathname: string): boolean {
  return RECORDING_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function ensurePosthogInit(): boolean {
  if (initialized || typeof window === 'undefined') return initialized;

  const key = envPosthogKey();
  if (!key) {
    if (import.meta.env.DEV) {
      console.info('[PostHog candidate-portal] disabled — set VITE_POSTHOG_KEY or VITE_CANDIDATE_PORTAL_POSTHOG_KEY');
    }
    return false;
  }

  try {
    const host = normalizePosthogApiHost(envPosthogHost());
    posthog.init(key, {
      api_host: host,
      ui_host: host.includes('eu.i.posthog.com') ? 'https://eu.posthog.com' : 'https://us.posthog.com',
      person_profiles: 'identified_only',
      capture_pageview: false,
      capture_pageleave: true,
      autocapture: false,
      persistence: 'sessionStorage',
      disable_session_recording: true,
      session_recording: {
        maskAllInputs: true,
      },
      ...(import.meta.env.DEV ? { debug: true } : {}),
    });
    initialized = true;
  } catch (err) {
    console.warn('[PostHog candidate-portal] init failed', err);
  }

  return initialized;
}

export function startCandidatePortalRecording(ctx?: {
  candidateId?: string | null;
  userId?: string | null;
  email?: string | null;
}) {
  if (!isCandidatePortalRecordingRoute(window.location.pathname)) return;
  if (!ensurePosthogInit()) return;

  try {
    const distinctId = ctx?.candidateId || ctx?.userId || ctx?.email;
    if (distinctId) {
      posthog.identify(String(distinctId), {
        candidate_id: ctx?.candidateId ? String(ctx.candidateId) : undefined,
        user_id: ctx?.userId ? String(ctx.userId) : undefined,
        email: ctx?.email || undefined,
        portal_area: 'candidate_profile',
      });
    }
    posthog.register({
      portal_area: 'candidate_profile',
      app_surface: 'candidate_portal',
    });
    if (!recordingActive) {
      posthog.startSessionRecording();
      recordingActive = true;
    }
    posthog.capture('candidate_profile_viewed', {
      candidate_id: ctx?.candidateId ? String(ctx.candidateId) : '',
      path: window.location.pathname,
    });
  } catch (err) {
    console.warn('[PostHog candidate-portal] start recording failed', err);
  }
}

export function stopCandidatePortalRecording() {
  if (!initialized || !recordingActive) return;
  try {
    posthog.stopSessionRecording();
    recordingActive = false;
  } catch (err) {
    console.warn('[PostHog candidate-portal] stop recording failed', err);
  }
}
