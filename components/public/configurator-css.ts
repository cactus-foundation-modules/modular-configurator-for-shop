// The layout builder's storefront styles, mounted once per page by the card.
// Every colour is a theme token, so the builder follows the site's light and
// dark schemes. The root carries data-cactus-unstyled (see ConfiguratorCard), so
// core's site-wide button hover fill does not reach in here and every :hover
// below is the builder's own.
//
// One big template string: no backticks anywhere inside it.
export const CONFIGURATOR_CSS = `
.mcf-card{display:grid;gap:.875rem;padding:1rem;border:1px solid var(--color-border);border-radius:var(--radius-lg,12px);background:var(--color-surface);color:var(--color-text)}
.mcf-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.75rem}
.mcf-card-title{margin:0;font-family:var(--font-heading,inherit);font-size:1.0625rem;font-weight:700;line-height:1.3;text-wrap:balance}
.mcf-card-intro{margin:.25rem 0 0;color:var(--color-text-muted);font-size:.875rem;line-height:1.45}
.mcf-badge{flex:none;padding:.2rem .55rem;border-radius:var(--radius-pill,999px);background:var(--color-primary-subtle);color:var(--color-text);font-size:.75rem;font-weight:600;white-space:nowrap}
.mcf-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr));gap:.5rem}
.mcf-preset{display:grid;gap:.375rem;align-content:start;padding:.625rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-bg);color:var(--color-text);text-align:left;cursor:pointer;font:inherit}
.mcf-preset:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-preset:focus-visible,.mcf-button:focus-visible,.mcf-chip:focus-visible,.mcf-icon-button:focus-visible,.mcf-swatch:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-preset-plan{display:block;width:100%;height:4.25rem}
.mcf-preset-name{font-weight:600;font-size:.875rem}
.mcf-preset-meta{color:var(--color-text-muted);font-size:.75rem;font-variant-numeric:tabular-nums}
.mcf-preset--own{place-content:center;justify-items:center;min-height:7.25rem;border-style:dashed;text-align:center}
.mcf-plus{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--color-primary-subtle);color:var(--color-primary);font-size:1.25rem;line-height:1}
.mcf-summary{display:grid;grid-template-columns:minmax(0,9rem) minmax(0,1fr);gap:.875rem;align-items:center}
.mcf-summary-plan{display:block;width:100%;height:6.5rem;border-radius:var(--radius-md,8px);background:var(--color-bg-subtle)}
.mcf-summary-lines{display:grid;gap:.2rem;min-width:0}
.mcf-summary-shape{font-weight:700}
.mcf-summary-detail{color:var(--color-text-muted);font-size:.8125rem;overflow-wrap:anywhere}
.mcf-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem .5rem;font-variant-numeric:tabular-nums}
.mcf-price-total{font-family:var(--font-heading,inherit);font-size:1.5rem;font-weight:700;color:var(--color-text)}
.mcf-price-note{color:var(--color-text-muted);font-size:.8125rem}
.mcf-price-was{color:var(--color-text-muted);font-size:.8125rem;text-decoration:line-through}
.mcf-actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
.mcf-button{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;min-height:2.75rem;padding:.55rem 1rem;border:1px solid var(--color-primary);border-radius:var(--radius-md,8px);background:var(--color-primary);color:var(--color-on-primary);font:inherit;font-weight:600;cursor:pointer}
.mcf-button:hover{background:var(--color-primary-hover,var(--color-primary));border-color:var(--color-primary-hover,var(--color-primary))}
.mcf-button:disabled{opacity:.55;cursor:not-allowed}
.mcf-button--quiet{background:var(--color-surface);color:var(--color-text);border-color:var(--color-border-strong,var(--color-border))}
.mcf-button--quiet:hover{background:var(--color-primary-subtle);border-color:var(--color-primary);color:var(--color-text)}
.mcf-button--wide{flex:1 1 12rem}
.mcf-link-button{padding:0;border:0;background:none;color:var(--color-link,var(--color-primary));font:inherit;font-size:.8125rem;text-decoration:underline;cursor:pointer}
.mcf-link-button:hover{color:var(--color-link-hover,var(--color-primary-hover,var(--color-primary)))}
.mcf-link-button:disabled{color:var(--color-text-disabled,var(--color-text-muted));text-decoration:none;cursor:not-allowed}
.mcf-status{margin:0;font-size:.8125rem;color:var(--color-text-muted)}
.mcf-status--good{color:var(--color-success)}
.mcf-status--problem{color:var(--color-error)}

.mcf-dialog{width:min(1180px,calc(100vw - 2rem));max-width:none;height:min(820px,calc(100dvh - 2rem));max-height:none;padding:0;border:1px solid var(--color-border);border-radius:var(--radius-lg,12px);background:var(--color-surface);color:var(--color-text);box-shadow:var(--shadow-elevated);overflow:hidden}
.mcf-dialog::backdrop{background:var(--color-overlay)}
.mcf-workspace{display:grid;grid-template-rows:auto minmax(0,1fr) auto;height:100%}
.mcf-ws-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.75rem 1rem;border-bottom:1px solid var(--color-border)}
.mcf-ws-title{margin:0;font-family:var(--font-heading,inherit);font-size:1.0625rem;font-weight:700}
.mcf-ws-subtitle{margin:0;color:var(--color-text-muted);font-size:.8125rem}
.mcf-ws-body{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(20rem,1fr);min-height:0}
.mcf-stage{position:relative;min-height:0;background:var(--color-bg-subtle);border-right:1px solid var(--color-border)}
.mcf-stage-canvas{display:block;width:100%;height:100%;touch-action:none;outline:none}
.mcf-stage-tools{position:absolute;top:.75rem;left:.75rem;right:.75rem;display:flex;flex-wrap:wrap;gap:.375rem;pointer-events:none}
.mcf-stage-tools>*{pointer-events:auto}
.mcf-stage-caption{position:absolute;left:.75rem;bottom:.75rem;right:.75rem;margin:0;padding:.35rem .6rem;width:fit-content;max-width:calc(100% - 1.5rem);border-radius:var(--radius-sm,6px);background:var(--color-surface);color:var(--color-text);font-size:.8125rem;box-shadow:var(--shadow-subtle)}
.mcf-stage-fallback{display:grid;place-items:center;height:100%;padding:1.5rem;text-align:center;color:var(--color-text-muted);font-size:.875rem}
.mcf-dimension{position:absolute;top:0;left:0;padding:.15rem .4rem;border-radius:var(--radius-sm,6px);background:var(--color-surface);color:var(--color-text);font-size:.75rem;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;box-shadow:var(--shadow-subtle)}
.mcf-chip{display:inline-flex;align-items:center;gap:.35rem;min-height:2.25rem;padding:.35rem .75rem;border:1px solid var(--color-border);border-radius:var(--radius-pill,999px);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:.8125rem;font-weight:600;cursor:pointer}
.mcf-chip:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-chip[aria-pressed="true"]{border-color:var(--color-primary);background:var(--color-primary);color:var(--color-on-primary)}
.mcf-chip:disabled{opacity:.5;cursor:not-allowed}
.mcf-icon-button{display:inline-grid;place-items:center;width:2.25rem;height:2.25rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:1.125rem;cursor:pointer}
.mcf-icon-button:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-icon-button:disabled{opacity:.45;cursor:not-allowed}
.mcf-panel{display:grid;align-content:start;gap:1.125rem;min-height:0;padding:1rem;overflow-y:auto;overscroll-behavior:contain}
.mcf-section{display:grid;gap:.5rem}
.mcf-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.mcf-section-title{margin:0;font-size:.875rem;font-weight:700}
.mcf-section-note{margin:0;color:var(--color-text-muted);font-size:.8125rem}
.mcf-row{display:flex;flex-wrap:wrap;gap:.375rem}
.mcf-plan-wrap{position:relative;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-bg-subtle)}
.mcf-plan{display:block;width:100%;height:13rem}
.mcf-plan-unit{fill:var(--color-surface);stroke:var(--color-border-strong,var(--color-text-muted));stroke-width:1.5;vector-effect:non-scaling-stroke}
.mcf-plan-back{fill:var(--color-text-muted)}
.mcf-plan-arm{fill:var(--color-text-secondary,var(--color-text-muted))}
.mcf-plan-number{fill:var(--color-text);font-weight:700;text-anchor:middle;dominant-baseline:central}
.mcf-plan-hit{cursor:pointer;outline:none}
.mcf-plan-hit:hover .mcf-plan-unit{fill:var(--color-primary-subtle)}
.mcf-plan-hit[aria-pressed="true"] .mcf-plan-unit{fill:var(--color-primary-subtle);stroke:var(--color-primary);stroke-width:3}
.mcf-plan-hit:focus-visible .mcf-plan-unit,.mcf-plan-hit:focus-visible .mcf-plan-ghost{stroke:var(--color-border-focus,var(--color-primary));stroke-width:3}
.mcf-plan-ghost{fill:var(--color-primary-subtle);fill-opacity:.55;stroke:var(--color-primary);stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
.mcf-plan-ghost-plus{fill:var(--color-primary);font-weight:700;text-anchor:middle;dominant-baseline:central}
.mcf-plan-dimension{fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:central;font-variant-numeric:tabular-nums}
.mcf-plan-dimension-line{stroke:var(--color-text-muted);stroke-width:1;vector-effect:non-scaling-stroke}
.mcf-plan-empty{fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:central}
.mcf-units{display:grid;gap:.375rem;margin:0;padding:0;list-style:none}
.mcf-unit{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:.625rem;align-items:center;padding:.5rem .625rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-surface)}
.mcf-unit[data-selected="true"]{border-color:var(--color-primary);box-shadow:inset 0 0 0 1px var(--color-primary)}
.mcf-unit-number{display:grid;place-items:center;width:1.625rem;height:1.625rem;border-radius:50%;background:var(--color-bg-subtle);font-size:.75rem;font-weight:700;font-variant-numeric:tabular-nums}
.mcf-unit-select{display:grid;gap:.1rem;min-width:0;padding:0;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mcf-unit-name{font-weight:600;font-size:.875rem}
.mcf-unit-detail{color:var(--color-text-muted);font-size:.75rem;overflow-wrap:anywhere}
.mcf-unit-detail--problem{color:var(--color-error)}
.mcf-unit-price{font-size:.8125rem;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.mcf-unit-editor{display:grid;gap:.625rem;padding:.75rem;border:1px solid var(--color-primary-border,var(--color-primary));border-radius:var(--radius-md,8px);background:var(--color-primary-subtle)}
.mcf-unit-editor-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
.mcf-swatches{display:flex;flex-wrap:wrap;gap:.375rem}
.mcf-swatch{position:relative;display:grid;place-items:center;width:2.5rem;height:2.5rem;padding:0;border:2px solid var(--color-border);border-radius:50%;background:var(--color-bg-subtle);background-size:cover;background-position:center;cursor:pointer;overflow:hidden}
.mcf-swatch:hover{border-color:var(--color-primary)}
.mcf-swatch[aria-pressed="true"]{border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-surface),0 0 0 4px var(--color-primary)}
.mcf-swatch:disabled{opacity:.4;cursor:not-allowed}
.mcf-swatch-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.mcf-select{min-height:2.25rem;padding:.35rem .5rem;border:1px solid var(--field-border,var(--color-border));border-radius:var(--radius-sm,6px);background:var(--field-bg,var(--color-surface));color:var(--field-text,var(--color-text));font:inherit;font-size:.8125rem}
.mcf-picker{display:grid;gap:.5rem;padding:.75rem;border:1px solid var(--color-primary);border-radius:var(--radius-md,8px);background:var(--color-surface);box-shadow:var(--shadow-elevated)}
.mcf-picker-list{display:grid;gap:.375rem;margin:0;padding:0;list-style:none}
.mcf-picker-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:center;width:100%;min-height:2.75rem;padding:.5rem .625rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-bg);color:var(--color-text);font:inherit;text-align:left;cursor:pointer}
.mcf-picker-option:hover:not(:disabled){border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-picker-option:disabled{cursor:not-allowed;color:var(--color-text-muted)}
.mcf-picker-reason{grid-column:1/-1;font-size:.75rem;color:var(--color-text-muted)}
.mcf-notice{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;padding:.5rem .75rem;border:1px solid var(--color-warning-border,var(--color-border));border-radius:var(--radius-md,8px);background:var(--color-warning-bg,var(--color-bg-subtle));color:var(--color-text);font-size:.8125rem}
.mcf-ws-foot{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.75rem 1rem;padding:.75rem 1rem;border-top:1px solid var(--color-border);background:var(--color-surface)}
.mcf-stepper{display:inline-flex;align-items:center;border:1px solid var(--color-border);border-radius:var(--radius-md,8px)}
.mcf-stepper .mcf-icon-button{border:0}
.mcf-stepper-value{min-width:2rem;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}

@media (max-width:820px){
  .mcf-dialog{width:100vw;height:100dvh;border:0;border-radius:0}
  .mcf-ws-body{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(15rem,42dvh) minmax(0,1fr)}
  .mcf-stage{border-right:0;border-bottom:1px solid var(--color-border)}
  .mcf-summary{grid-template-columns:minmax(0,1fr)}
  .mcf-button--wide{flex-basis:100%}
}
@media (prefers-reduced-motion:no-preference){
  .mcf-preset,.mcf-chip,.mcf-swatch,.mcf-button,.mcf-picker-option{transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease}
}
`
