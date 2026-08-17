/**
 * The page a share link lands on.
 *
 * There is no separate build for this: it serves the same single-page app the
 * front door does, and the app reads the id out of the address and the key out
 * of the fragment. What this handler adds is the two things only a server can
 * do — say the right thing to a crawler, and say it before any JavaScript runs.
 *
 * **Shared runs are not indexed.** A share link is meant for the people it was
 * sent to. It is unguessable, so it will not be found by accident, but a link
 * pasted into a public forum would otherwise be crawled from there and end up
 * in a search result — turning "I sent this to my club" into "this is on the
 * internet". So every response here carries `noindex` as a header *and* as a
 * meta tag, and `robots.txt` disallows the whole path.
 *
 * **The preview is deliberately generic.** A link unfurling in a chat window
 * shows "A shared run" and nothing else — no distance, no date, no map. That is
 * not a gap to be filled in later: the run is encrypted and this server cannot
 * read it, which is the entire point. Generating a real preview would mean
 * either sending the key here or storing a readable copy of the run's figures,
 * and both would give away the thing the encryption was for. The person opening
 * the link sees everything a moment later; the chat server that relays it does
 * not.
 */

interface Env {
  /** Pages' static asset store: the built `dist/` this function sits beside. */
  ASSETS: { fetch(request: Request | string): Promise<Response> };
}

interface Context {
  request: Request;
  env: Env;
}

const TITLE = "A shared run — Run Log";
const DESCRIPTION =
  "Someone shared a run with you. It opens in your browser: the charts, the splits, the map and whatever they noted along the way.";

/** Rewrites one `content` attribute wherever the tag appears. */
class SetContent {
  constructor(private readonly value: string) {}

  element(element: { setAttribute(name: string, value: string): void }): void {
    element.setAttribute("content", this.value);
  }
}

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const url = new URL(request.url);
  const page = await env.ASSETS.fetch(new URL("/index.html", url).toString());

  // The app is what matters; if the shell cannot be fetched there is nothing
  // useful to substitute, so the failure is passed along as it came.
  if (!page.ok) return page;

  const rewritten = new HTMLRewriter()
    .on("title", {
      element(element) {
        element.setInnerContent(TITLE);
      },
    })
    .on('meta[name="robots"]', new SetContent("noindex, nofollow"))
    .on('meta[name="description"]', new SetContent(DESCRIPTION))
    .on('meta[property="og:title"]', new SetContent(TITLE))
    .on('meta[property="og:description"]', new SetContent(DESCRIPTION))
    .on('meta[name="twitter:title"]', new SetContent(TITLE))
    .on('meta[name="twitter:description"]', new SetContent(DESCRIPTION))
    // The canonical on the front page names the site root. Left pointing there
    // a share would tell a crawler "index the home page instead", which is
    // harmless — but this page should not be claiming a canonical at all, and
    // the honest way to say that is to name itself and refuse indexing.
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute("href", url.origin + url.pathname);
      },
    })
    .transform(page);

  return new Response(rewritten.body, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      // The shell is the same bytes for every share; the run it will show is
      // fetched separately. Cached briefly so a link doing the rounds does not
      // re-run the rewriter each time, and briefly enough that a deploy reaches
      // shared links about as fast as it reaches the front page.
      "Cache-Control": "public, max-age=300",
    },
  });
}
