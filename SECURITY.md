# Security

Run Log parses untrusted binary files (FIT) and XML (GPX) in the browser, and
its privacy claims — activity data never leaves the machine — are part of the
product. A bug that breaks either is a security issue.

If you find one, please use GitHub's
[private vulnerability reporting](../../security/advisories/new) rather than a
public issue, and allow a reasonable window for a fix before disclosing.
In scope, especially:

- Any way run data reaches a server beyond the three documented opt-in paths
  (crash reports, weather, translation), or those paths carrying more than
  the README says they do.
- Memory-unsafety or prototype-pollution style bugs in the FIT/GPX parsers
  reachable from a crafted file.
- The visit counter (`functions/api/stats.ts`) doing more than counting.
