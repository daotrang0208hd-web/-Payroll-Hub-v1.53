# Design QA

## Scope

- Selected-DIV outline and in-context computed-style readout.
- Compact live editor for font family, weight/style/decoration, alignment,
  font size/line height, width/height, padding, margin, colors, border and radius.
- Full DIV editor mirrors the same computed values and editable properties.

## Reference images

- `9b199c75-eb4c-437d-985b-0346a9fe7399.png` — typography controls on the selected DIV.
- `160c5553-ec2b-48bd-8959-fff828a07d7c.png` — width and height controls.
- `8446e461-eabf-4505-a0f1-e94e1fbf49fe.png` and
  `56591fd5-3568-49b7-9b2e-fbf1712e64df.png` — padding and margin controls.

## Automated checks

- Production build: passed.
- ESLint on changed TypeScript/TSX files: passed.
- Timesheet helper checks for time parsing, L07 filename mapping and MKT HP exclusion: passed.
- `git diff --check`: passed.

## Browser-rendered comparison

Blocked: the local Vite server ran successfully on loopback, but the cloud
browser blocks loopback and cannot reach `terminal.local` in this workspace.
No honest browser-rendered comparison screenshot is available.

final result: blocked
