# Source library

- `manifest.json` is canonical and contains 43 verified-source records.
- `bibliography.csv` is a flat export for sorting and review.
- Citation IDs are stable; lessons point to them rather than embedding duplicate metadata.
- Source documents are not vendored. A public URL is not a redistribution license.

Run `npm run check:sources` from the repository root for the canonical manifest, bibliography-parity, topic, module, and downstream-citation audit. Run `npm run check:links` separately for network reachability; publisher anti-bot responses are surfaced as warnings rather than silently treated as successful content retrieval. `node sources/validate.mjs` remains a narrower manifest-only diagnostic.

The 15-source core is documented in `docs/sources/core-reading-path.md`; every manifest source is summarized in `docs/sources/annotated-bibliography.md`.
