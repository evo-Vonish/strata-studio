# Strata Studio

Strata Studio is a human–AI collaborative visual web creation engine built on real HTML, CSS, and JavaScript.

Its long-term architecture has three layers:

1. a live Stage/Canvas for direct manipulation;
2. Strata Blueprint as the structured visual source language;
3. an AI Agent that reads and changes the same project through explicit tools.

## Current milestone: E0 Element Extractor

The first deliverable is a browser-based element extractor that can:

- pick a real element from a page;
- capture its DOM subtree, applicable CSS, inherited context, and assets;
- reconstruct it in an isolated preview;
- support small, undoable edits;
- export a standalone HTML file and a versioned Strata Element Bundle.

This milestone becomes the first stage of the later HTML-to-Blueprint importer.

## Development status

The repository is in its research and architecture checkpoint. The first two upstream studies are documented in [docs/research/element-extractor-upstreams.md](docs/research/element-extractor-upstreams.md).

No upstream repository is vendored into this repository. Research clones live outside the project tree and are pinned by commit in the research notes.

