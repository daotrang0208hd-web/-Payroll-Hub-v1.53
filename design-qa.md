# Design QA

## Scope

- Compact selected-DIV style editor with in-context current-style readout and live preview.
- Audit table title/header layout.
- Audit footer search control removal.
- Distinct themed backgrounds for `THÔNG TIN CHUNG` and `CHI TIẾT GIỜ LÀM TA` headers/cells.
- Audit source cards driven by the user's primary theme color.
- Website background-image upload controls removed from UI settings.

## Reference images

- `2634734b-666a-4194-a3ec-8f3e7d28d6bc.png` — compact editing toolbar.
- `305f55b6-0453-4141-b0e2-729243809de1.png` — Audit title/table/footer layout.
- `0841a60c-b731-469a-8f3b-2ce6f3055f51.png` — Audit source cards.

## Automated checks

- Production build: passed.
- ESLint on changed TypeScript/TSX files: passed.
- Repository-wide ESLint: blocked by the existing 4 GB Node heap limit (process exited with an out-of-memory error).
- `git diff --check`: passed.

## Browser-rendered comparison

Blocked: the local Vite server can run on loopback, but this workspace does not permit binding the preview to the network interface required by the cloud browser. The browser therefore could not open the local implementation, so no honest browser-rendered comparison screenshot is available.

final result: blocked
