/**
 * Creating a share.
 *
 * `POST /api/share` with a sealed blob as the body and a revocation token in a
 * header. Answers with the id the blob was stored under; the client turns that
 * into a link by adding the key, which never comes here.
 *
 * This handler does not know what a run is. It checks a size, counts the
 * request against a daily allowance, writes bytes and returns a name for them.
 * That is the entire server side of sharing, and keeping it that small is what
 * lets the privacy page say what it says.
 */

import {
  MAX_SEALED_BYTES,
  hashToken,
  json,
  newShareId,
  payloadKey,
  problem,
  withinRateLimit,
  type Env,
} from "../../../server/share";

interface Context {
  request: Request;
  env: Env;
}

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  const token = request.headers.get("X-Share-Token") ?? "";
  // The token is what will later prove the share is the sharer's to withdraw.
  // A share created without one could never be taken down by the person who
  // made it, so it is refused rather than stored unrevocable.
  if (token.length < 16 || token.length > 128) {
    return problem(400, "A share needs a revocation token.");
  }

  // Checked before reading the body, so an oversized upload is refused on the
  // header rather than after it has all arrived.
  const declared = Number.parseInt(request.headers.get("Content-Length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_SEALED_BYTES) {
    return problem(413, "That run is too large to share.");
  }

  const address = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!(await withinRateLimit(env.SHARES, address))) {
    return problem(429, "Too many shares from this connection today.");
  }

  const sealed = await request.arrayBuffer();
  // A chunked upload has no Content-Length, so the real check is here.
  if (sealed.byteLength > MAX_SEALED_BYTES) {
    return problem(413, "That run is too large to share.");
  }
  if (sealed.byteLength < 32) {
    return problem(400, "That is not a sealed run.");
  }

  const id = newShareId();
  await env.SHARES.put(payloadKey(id), sealed, {
    customMetadata: {
      tokenHash: await hashToken(token),
      createdAt: new Date().toISOString(),
    },
    httpMetadata: { contentType: "application/octet-stream" },
  });

  return json({ id }, 201);
}
