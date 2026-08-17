/**
 * Reading and withdrawing one share.
 *
 * `GET` hands back the sealed bytes to anybody who asks for a valid id, which
 * is correct: the bytes are useless without the key, and the key is in the
 * fragment of a link this server never sees. There is nothing to authenticate
 * against here, and pretending otherwise — a login, an allowlist — would be
 * security theatre over a payload that is already unreadable.
 *
 * `DELETE` is the one operation that needs proof, because withdrawing somebody
 * else's share is a real thing to want to stop. The proof is the token minted
 * when the share was made, of which this bucket holds only a hash.
 */

import {
  digestsMatch,
  hashToken,
  isShareId,
  payloadKey,
  problem,
  type Env,
} from "../../../server/share";

interface Context {
  request: Request;
  env: Env;
  params: { id: string | string[] };
}

function idFrom(params: Context["params"]): string {
  return Array.isArray(params.id) ? params.id[0] : params.id;
}

export async function onRequestGet({ env, params }: Context): Promise<Response> {
  const id = idFrom(params);
  if (!isShareId(id)) return problem(404, "No such share.");

  const object = await env.SHARES.get(payloadKey(id));
  if (!object) return problem(404, "No such share.");

  return new Response(object.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(object.size),
      // A share's bytes never change: the id names this exact sealed payload,
      // and withdrawing one deletes it rather than replacing it. So it can be
      // cached hard — which is also what keeps a link doing the rounds in a
      // group chat from costing a read apiece.
      "Cache-Control": "public, max-age=3600, s-maxage=86400, immutable",
      // Nothing here is a credential and the payload is opaque, but there is
      // also no reason for another site to be reading it through a browser.
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestDelete({ request, env, params }: Context): Promise<Response> {
  const id = idFrom(params);
  if (!isShareId(id)) return problem(404, "No such share.");

  const token = request.headers.get("X-Share-Token") ?? "";
  if (token.length === 0) return problem(403, "That share is not yours to withdraw.");

  const object = await env.SHARES.get(payloadKey(id));
  if (!object) {
    // Already gone. To the person pressing "withdraw" that is success, and
    // saying "no such share" instead would only invite them to press it again.
    return new Response(null, { status: 204 });
  }

  const stored = object.customMetadata?.tokenHash ?? "";
  if (!digestsMatch(stored, await hashToken(token))) {
    return problem(403, "That share is not yours to withdraw.");
  }

  await env.SHARES.delete(payloadKey(id));
  return new Response(null, { status: 204 });
}
