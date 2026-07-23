# Fixed Light Theme Design

## Goal

Change the research dashboard from a forced dark theme to a fixed light theme while preserving its existing shadcn/ui structure, emerald product accent, responsive layouts, accessibility, and all backtest and portfolio-comparison behavior.

## Scope

- Use a light zinc page background with white cards and popovers.
- Use dark zinc foreground text and medium zinc muted text.
- Keep emerald as the primary, focus-ring, selected-state, and positive-performance color.
- Update borders, inputs, secondary surfaces, destructive states, and chart colors for readable light-theme contrast.
- Keep Geist Sans and Geist Mono.
- Apply the theme unconditionally. Do not add a theme toggle, system-theme detection, persistence, or a second inactive theme.

## Implementation

The theme remains centralized in `frontend/src/styles.css`:

- Replace the combined `:root, .dark` forced-dark token block with a light-only `:root` block.
- Set `color-scheme: light`.
- Use shadcn-compatible light tokens for background, card, popover, foreground, muted, border, input, and sidebar colors.
- Preserve the current emerald primary hue, with a light foreground suitable for primary buttons.
- Change the ECharts SVG text override from light gray to dark gray so labels remain readable on white cards.

Component markup, request orchestration, API schemas, and calculation code remain unchanged unless browser verification reveals a component-specific contrast defect.

## Testing

- Add a focused theme-contract test before implementation that proves the stylesheet declares a fixed light color scheme, does not merge `.dark` into the root token block, and uses dark chart label text.
- Run the focused test red, make the minimal token changes, and run it green.
- Run all frontend and root tests plus the production build.
- Verify strategy and portfolio workspaces in a browser at desktop and 390 px widths.
- Confirm there is no error overlay, console error, horizontal overflow, dark surface left behind, or unreadable chart/form text.

## Non-goals

- User-selectable dark mode.
- Automatic `prefers-color-scheme` behavior.
- Layout, component, business-logic, API, or calculation changes.
