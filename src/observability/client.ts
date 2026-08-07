import {
  breadcrumbsIntegration,
  captureException,
  init,
  withScope,
} from "@sentry/react";
import { scrubBreadcrumb, scrubEvent } from "./scrub";

/**
 * The Sentry client itself, kept in a module nothing imports statically.
 *
 * Everything the SDK is asked for is named here rather than reached through a
 * namespace object, so the bundler can drop the parts of the SDK this project
 * does not use — session replay, user feedback, profiling and the rest are most
 * of its weight, and none of them belong in an app that promises the run stays
 * on the machine.
 */

export interface ClientOptions {
  dsn: string;
  release?: string;
  environment: string;
  tracesSampleRate: number;
  /**
   * Read at send time, not at start time, so a runner switching reporting off
   * in Settings stops it there and then rather than at the next reload.
   */
  isEnabled: () => boolean;
}

export function start(options: ClientOptions): void {
  init({
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,

    // Never attach an IP address, a cookie or a username. There is no account
    // to tie a report to and nothing to gain from identifying the reader.
    sendDefaultPii: false,

    tracesSampleRate: options.tracesSampleRate,

    integrations: (defaults) => [
      ...defaults.filter((integration) => integration.name !== "BrowserTracing"),
      // Replaces the default breadcrumbs integration: same name wins. Console
      // breadcrumbs are off rather than trusting that nothing logs a sample.
      breadcrumbsIntegration({ console: false }),
    ],

    // Errors thrown by an extension injected into the page are not this
    // project's to fix.
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],

    ignoreErrors: [
      // A benign browser notification, not a fault: the observer simply could
      // not settle within one animation frame.
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      // A tile fetch cancelled by panning away, or a lost connection.
      "AbortError",
      "NetworkError when attempting to fetch resource",
      "Failed to fetch",
    ],

    beforeSend: (event) => (options.isEnabled() ? scrubEvent(event) : null),
    beforeBreadcrumb: (breadcrumb) =>
      options.isEnabled() ? scrubBreadcrumb(breadcrumb) : null,
  });
}

/** Sends one error, tagged with what kind of failure it was. */
export function report(
  error: unknown,
  detail: { tags: Record<string, string>; context?: Record<string, unknown> },
): void {
  withScope((scope) => {
    for (const [key, value] of Object.entries(detail.tags)) scope.setTag(key, value);
    if (detail.context) scope.setContext("detail", detail.context);
    captureException(error);
  });
}
