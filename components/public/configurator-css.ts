// The layout builder's storefront styles, mounted once per page by the tabs.
// Every colour is a theme token, so the builder follows the site's light and
// dark schemes. The tab bar and the builder panel carry data-cactus-unstyled (see
// ConfiguratorTabs), so core's site-wide button hover fill does not reach in and
// every :hover below is the builder's own; the individual panel is left alone.
//
// One big template string: no backticks anywhere inside it.
export const CONFIGURATOR_CSS = `
.mcf-tabs-root{display:grid;gap:1rem}
.mcf-tabs{display:flex;gap:.25rem;padding:.25rem;border:1px solid var(--color-border);border-radius:var(--radius-pill,999px);background:var(--color-bg-subtle)}
.mcf-tab{flex:1 1 0;min-height:2.75rem;padding:.5rem .875rem;border:0;border-radius:var(--radius-pill,999px);background:transparent;color:var(--color-text);font:inherit;font-weight:600;cursor:pointer}
.mcf-tab:hover{background:var(--color-primary-subtle)}
.mcf-tab[aria-selected="true"]{background:var(--color-primary);color:var(--color-on-primary)}
.mcf-tab:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-tab-panel{min-width:0}
.mcf-tab-panel[hidden],.mcf-stage-view[hidden],.mcf-stage-caption[hidden],.mcf-sselect-list[hidden]{display:none!important}
.mcf-start{display:grid;gap:.75rem;color:var(--color-text)}
.mcf-workspace{display:grid;gap:1rem;color:var(--color-text)}
.mcf-controls{display:grid;gap:1rem;min-width:0}
.mcf-sticky-view.svr-mstick{position:fixed;z-index:30;top:var(--spd-header-h,96px);margin:0;background:var(--color-page-bg,var(--color-bg));padding:8px 0;border-bottom:1px solid var(--color-border)}
.mcf-sticky-view.svr-mstick .mcf-stage{aspect-ratio:16/9;max-height:none}
.mcf-sticky-view.svr-mstick .mcf-stage-caption{display:none}
.mcf-stage{position:relative;width:100%;aspect-ratio:4/3;max-height:34rem;border:1px solid var(--color-border);border-radius:var(--radius-lg,12px);background:var(--color-bg-subtle);overflow:hidden}
.mcf-stage--fill{position:absolute;inset:0;aspect-ratio:auto;max-height:none;border:0;border-radius:0}
.mcf-stage--fill .mcf-stage-tools,.mcf-stage--expanded .mcf-stage-tools{justify-content:flex-end}
.mcf-stage-slot,.mcf-stage-host{display:contents}
.mcf-expand-backdrop{position:fixed;inset:0;z-index:2147482100;background:var(--color-bg)}
.mcf-stage--expanded{position:absolute;inset:0;width:100%;height:100dvh;aspect-ratio:auto;max-height:none;border:0;border-radius:0}
.mcf-stage--expanded .mcf-stage-tools{top:1rem;right:1rem;left:1rem}
.mcf-stage--expanded .mcf-stage-caption{left:1rem;bottom:1rem}
.mcf-stage-round{display:inline-grid;place-items:center;flex:none;width:2.25rem;height:2.25rem;margin-left:.25rem;padding:0;border:1px solid var(--color-border);border-radius:50%;background:var(--color-surface);color:var(--color-text);cursor:pointer;box-shadow:var(--shadow-subtle)}
.mcf-stage-round:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-stage-round:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-thumb-plan{display:block;width:100%;height:100%;padding:4px;box-sizing:border-box;background:var(--color-bg-subtle)}
.mcf-stage-view{position:absolute;inset:0}
.mcf-stage-plan{display:grid;place-items:center;padding:3.25rem .75rem 2.75rem}
.mcf-plan{display:block;width:100%;height:100%}
.mcf-ws-foot{display:grid;gap:.875rem;padding-top:1rem;border-top:1px solid var(--color-border)}
.mcf-card-intro{margin:0;color:var(--color-text-muted);font-size:.875rem;line-height:1.45}
.mcf-presets{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,8.5rem),1fr));gap:.5rem}
.mcf-preset{display:grid;gap:.375rem;align-content:start;padding:.625rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-bg);color:var(--color-text);text-align:left;cursor:pointer;font:inherit}
.mcf-preset:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-preset:focus-visible,.mcf-button:focus-visible,.mcf-chip:focus-visible,.mcf-icon-button:focus-visible,.mcf-swatch:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-preset-plan{display:block;width:100%;height:4.25rem}
.mcf-preset-name{font-weight:600;font-size:.875rem}
.mcf-preset-meta{color:var(--color-text-muted);font-size:.75rem;font-variant-numeric:tabular-nums}
.mcf-preset--own{place-content:center;justify-items:center;min-height:7.25rem;border-style:dashed;text-align:center}
.mcf-plus{display:grid;place-items:center;width:2rem;height:2rem;border-radius:50%;background:var(--color-primary-subtle);color:var(--color-primary);font-size:1.25rem;line-height:1}
.mcf-summary-lines{display:grid;gap:.2rem;min-width:0}
.mcf-price-block{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.mcf-price-block>*{white-space:nowrap}
.mcf-price-now{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:var(--spd-price-size,34px);color:var(--color-primary)}
.mcf-price-was{font-size:15px;color:var(--color-text-muted);text-decoration:line-through}
.mcf-price-rrp,.mcf-price-note{font-size:13px;color:var(--color-text-muted)}
.mcf-price-note{margin-left:-6px}
.mcf-reset{margin-left:auto;padding:0;border:0;background:none;color:var(--color-text-muted);font:inherit;font-size:.8125rem;font-weight:400;white-space:nowrap;text-decoration:underline;cursor:pointer}
.mcf-reset:hover{color:var(--color-text)}
.mcf-delivery{display:grid;gap:.375rem}
.mcf-delivery .scl-hints{gap:0.3375rem;margin-top:0.45rem}
.mcf-delivery .scl-hints-t{font-size:0.7313rem}
.mcf-delivery .scl-hint{font-size:0.7313rem;padding:0.225rem 0.5625rem}
.mcf-delivery .scl-hint-fee{margin-left:0.3938rem}
.mcf-delivery-total{margin:0;font-size:.8125rem;color:var(--color-text-muted);font-variant-numeric:tabular-nums}
.mcf-delivery-total strong{color:var(--color-text);font-weight:600}
.mcf-buy-row{display:flex;gap:14px;align-items:center;flex-wrap:wrap;container-type:inline-size}
.mcf-qty{display:inline-flex;align-items:center;height:52px;border:1px solid var(--color-border);border-radius:9999px;overflow:hidden;background:var(--color-surface)}
.mcf-qty button{width:46px;height:52px;border:0;background:transparent;color:var(--color-primary);font:inherit;font-size:20px;font-weight:600;cursor:pointer}
.mcf-qty button:hover:not(:disabled){background:var(--color-bg-subtle)}
.mcf-qty button:disabled{color:var(--color-border);cursor:not-allowed}
.mcf-qty-value{width:52px;text-align:center;font-weight:600;font-size:16px;color:var(--color-text);font-variant-numeric:tabular-nums}
.mcf-add{flex:1;min-width:200px;height:52px;border:0;border-radius:9999px;background:var(--btn-bg,var(--color-primary));color:var(--btn-text-color,var(--color-on-primary));font:inherit;font-weight:600;font-size:16px;cursor:pointer}
.mcf-add:hover:not(:disabled){background:var(--btn-hover-bg,var(--color-primary-hover,var(--color-primary)));color:var(--btn-hover-text,var(--btn-text-color,var(--color-on-primary)))}
.mcf-add:active:not(:disabled){transform:scale(.99)}
.mcf-add:disabled{opacity:.55;cursor:not-allowed}
.mcf-add:focus-visible,.mcf-qty button:focus-visible,.mcf-reset:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
@media (pointer:coarse){.mcf-delivery .scl-hint{padding:0.45rem 0.7875rem}}
@container (max-width:359.98px){.mcf-qty{display:flex;width:100%}.mcf-qty-value{flex:1;width:auto}}
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
.mcf-ready{display:flex;align-items:center;flex-wrap:wrap;gap:.25rem .75rem;margin:0;padding:.625rem .875rem;border:1px solid var(--color-success-border);border-radius:10px;background:var(--color-success-bg);color:var(--color-success);font-size:.875rem;font-weight:600;line-height:1.35}
.mcf-ready svg{flex:none}
.mcf-ready-text{display:flex;align-items:center;gap:.5rem;flex:1 1 auto;min-width:0}
.mcf-ready .mcf-reset,.mcf-ready .mcf-reset:hover{color:inherit}
.mcf-ready .mcf-reset:hover{text-decoration-thickness:2px}
.mcf-status-row{display:flex;align-items:baseline;flex-wrap:wrap;gap:.25rem .75rem}
.mcf-status-row .mcf-status{flex:1 1 auto;min-width:0}

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
.mcf-chip[data-unavailable="true"]{text-decoration:line-through}
.mcf-icon-button{display:inline-grid;place-items:center;width:2.25rem;height:2.25rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-surface);color:var(--color-text);font:inherit;font-size:1.125rem;cursor:pointer}
.mcf-icon-button:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-icon-button:disabled{opacity:.45;cursor:not-allowed}
.mcf-section{display:grid;gap:.5rem}
.mcf-section-head{display:flex;align-items:baseline;justify-content:space-between;gap:.5rem}
.mcf-section-title{margin:0;font-size:.875rem;font-weight:700}
.mcf-section-note{margin:0;color:var(--color-text-muted);font-size:.8125rem}
.mcf-row{display:flex;flex-wrap:wrap;gap:.375rem}
.mcf-plan-unit{fill:var(--color-surface);stroke:var(--color-border-strong,var(--color-text-muted));stroke-width:1.5;vector-effect:non-scaling-stroke}
.mcf-plan-back{fill:var(--color-text-muted)}
.mcf-plan-arm{fill:var(--color-text-secondary,var(--color-text-muted))}
.mcf-plan-number{fill:var(--color-text);font-weight:700;text-anchor:middle;dominant-baseline:central}
.mcf-plan-hit{cursor:pointer;outline:none}
.mcf-plan-hit:hover .mcf-plan-unit{fill:var(--color-primary-subtle)}
.mcf-plan-hit[aria-pressed="true"] .mcf-plan-unit{fill:var(--color-primary-subtle);stroke:var(--color-primary);stroke-width:3}
.mcf-plan-hit:focus-visible .mcf-plan-unit,.mcf-plan-hit:focus-visible .mcf-plan-ghost{stroke:var(--color-border-focus,var(--color-primary));stroke-width:3}
.mcf-plan-hit--movable{cursor:move;touch-action:none}
.mcf-plan-hit--dragging{cursor:grabbing}
.mcf-plan-hit--dragging .mcf-plan-unit{fill:var(--color-primary-subtle);stroke:var(--color-primary);stroke-width:3}
.mcf-plan-hit--blocked,.mcf-plan-hit--blocked:hover{cursor:not-allowed}
.mcf-plan-hit--blocked .mcf-plan-unit,.mcf-plan-hit--blocked:hover .mcf-plan-unit{fill:color-mix(in srgb,var(--color-danger) 14%,var(--color-surface));stroke:var(--color-danger);stroke-width:3}
.mcf-plan-ghost{fill:var(--color-primary-subtle);fill-opacity:.55;stroke:var(--color-primary);stroke-width:1.5;stroke-dasharray:6 4;vector-effect:non-scaling-stroke}
.mcf-plan-ghost-plus{fill:var(--color-primary);font-weight:700;text-anchor:middle;dominant-baseline:central}
.mcf-plan-dimension{fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:central;font-variant-numeric:tabular-nums}
.mcf-plan-dimension-line{stroke:var(--color-text-muted);stroke-width:1;vector-effect:non-scaling-stroke}
.mcf-plan-empty{fill:var(--color-text-muted);text-anchor:middle;dominant-baseline:central}
.mcf-units{display:flex;flex-wrap:wrap;gap:.375rem;margin:0;padding:0;list-style:none}
.mcf-unit{display:flex;min-width:0;max-width:100%}
.mcf-unit-select{display:inline-flex;align-items:center;gap:.5rem;min-width:0;max-width:100%;min-height:2.75rem;padding:.3rem .875rem .3rem .3rem;border:1px solid var(--color-border);border-radius:var(--radius-pill,999px);background:var(--color-surface);color:var(--color-text);font:inherit;text-align:left;cursor:pointer}
.mcf-unit-select:hover{border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-unit-select:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-unit[data-problem="true"] .mcf-unit-select{border-color:var(--color-error)}
.mcf-unit[data-selected="true"] .mcf-unit-select{border-color:var(--color-primary);background:var(--color-primary-subtle);box-shadow:inset 0 0 0 1px var(--color-primary)}
.mcf-unit-number{flex:none;display:grid;place-items:center;width:1.75rem;height:1.75rem;border-radius:50%;background:var(--color-bg-subtle);color:var(--color-text);font-size:.75rem;font-weight:700;font-variant-numeric:tabular-nums}
.mcf-unit[data-selected="true"] .mcf-unit-number,.mcf-unit-body-title .mcf-unit-number{background:var(--color-primary);color:var(--color-on-primary)}
.mcf-unit-text{display:grid;gap:.05rem;min-width:0}
.mcf-unit-name{font-weight:600;font-size:.875rem}
.mcf-unit-detail{color:var(--color-text-muted);font-size:.75rem;overflow-wrap:anywhere}
.mcf-unit-detail--problem{color:var(--color-error)}
.mcf-unit-price{font-size:.8125rem;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.mcf-unit-body{display:grid;gap:.625rem;min-width:0;padding:.75rem;border:1px solid var(--color-primary);border-radius:var(--radius-md,8px);background:var(--color-surface);box-shadow:inset 0 0 0 1px var(--color-primary)}
.mcf-unit-body-title{display:flex;align-items:center;gap:.5rem;margin:0;font-size:.875rem;font-weight:600}
.mcf-unit-editor{display:grid;gap:.625rem;padding-top:.625rem;border-top:1px solid var(--color-border)}
.mcf-swatches{display:flex;flex-wrap:wrap;gap:.375rem}
.mcf-swatch{position:relative;display:grid;place-items:center;width:2.5rem;height:2.5rem;padding:0;border:2px solid var(--color-border);border-radius:50%;background:var(--color-bg-subtle);background-size:cover;background-position:center;cursor:pointer;overflow:hidden}
.mcf-swatch:hover{border-color:var(--color-primary)}
.mcf-swatch[aria-pressed="true"]{border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-surface),0 0 0 4px var(--color-primary)}
.mcf-swatch:disabled{opacity:.4;cursor:not-allowed}
.mcf-swatch[data-unavailable="true"]::after{content:"";position:absolute;inset:0;background:linear-gradient(to top right,transparent calc(50% - 2.5px),var(--color-surface) calc(50% - 2.5px),var(--color-surface) calc(50% - 1px),var(--color-text) calc(50% - 1px),var(--color-text) calc(50% + 1px),var(--color-surface) calc(50% + 1px),var(--color-surface) calc(50% + 2.5px),transparent calc(50% + 2.5px));pointer-events:none}
.mcf-visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.mcf-swatch-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.mcf-peek-wrap{position:relative;display:inline-flex}
.mcf-peek{position:absolute;bottom:calc(100% + 6px);left:50%;z-index:20;display:grid;justify-items:center;gap:4px;padding:4px;transform:translateX(-50%);border:1px solid var(--color-border);border-radius:8px;background:var(--color-surface);color:var(--color-text);box-shadow:var(--shadow-lg);font-size:var(--text-xs,.75rem);white-space:nowrap;pointer-events:none}
.mcf-peek-picture{display:block;width:200px;height:200px;border-radius:4px;background-size:contain;background-position:center;background-repeat:no-repeat}
.mcf-peek-colour{display:block;width:160px;height:90px;border:1px solid var(--color-border);border-radius:4px}
.mcf-peek-name{display:grid;justify-items:center;padding:0 4px 2px;line-height:1.3}
.mcf-peek-struck{text-decoration:line-through}
.mcf-peek-reason{max-width:180px;color:var(--color-text-muted);font-weight:600;text-align:center;white-space:normal}
.mcf-sselect{position:relative;min-width:0}
.mcf-sselect-button{display:flex;align-items:center;gap:.5rem;width:100%;min-height:2.5rem;padding:.35rem .625rem;border:1px solid var(--field-border,var(--color-border));border-radius:var(--radius-sm,6px);background:var(--field-bg,var(--color-surface));color:var(--field-text,var(--color-text));font:inherit;font-size:.8125rem;text-align:left;cursor:pointer}
.mcf-sselect-button:hover{border-color:var(--color-primary)}
.mcf-sselect-button:focus-visible{outline:2px solid var(--color-border-focus,var(--color-primary));outline-offset:2px}
.mcf-sselect-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcf-sselect-caret{flex:none;width:.5rem;height:.5rem;margin:0 .125rem .2rem;border-right:2px solid var(--color-text-muted);border-bottom:2px solid var(--color-text-muted);transform:rotate(45deg)}
.mcf-sselect-button[aria-expanded="true"] .mcf-sselect-caret{margin-top:.3rem;margin-bottom:0;transform:rotate(-135deg)}
.mcf-sselect-swatch{flex:none;width:1.5rem;height:1.5rem;border:1px solid var(--color-border);border-radius:50%;background-color:var(--color-bg-subtle);background-size:cover;background-position:center}
.mcf-sselect-list{position:absolute;z-index:20;top:calc(100% + .25rem);left:0;right:0;max-height:16rem;margin:0;padding:.25rem;overflow-y:auto;overscroll-behavior:contain;list-style:none;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-surface);box-shadow:var(--shadow-elevated)}
.mcf-sselect-option{display:flex;align-items:center;gap:.5rem;min-height:2.5rem;padding:.3rem .5rem;border-radius:var(--radius-sm,6px);color:var(--color-text);font-size:.8125rem;cursor:pointer}
.mcf-sselect-option[data-active="true"]{background:var(--color-primary-subtle)}
.mcf-sselect-option[aria-selected="true"]{font-weight:600}
.mcf-sselect-option[aria-disabled="true"]{color:var(--color-text-muted);cursor:not-allowed}
.mcf-sselect-option[aria-disabled="true"] .mcf-sselect-label,.mcf-sselect-button[data-unavailable="true"] .mcf-sselect-label{text-decoration:line-through}
.mcf-picker{display:grid;gap:.5rem;padding:.75rem;border:1px solid var(--color-primary);border-radius:var(--radius-md,8px);background:var(--color-surface);box-shadow:var(--shadow-elevated)}
.mcf-picker-list{display:grid;gap:.375rem;margin:0;padding:0;list-style:none}
.mcf-picker-option{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.5rem;align-items:center;width:100%;min-height:2.75rem;padding:.5rem .625rem;border:1px solid var(--color-border);border-radius:var(--radius-md,8px);background:var(--color-bg);color:var(--color-text);font:inherit;text-align:left;cursor:pointer}
.mcf-picker-option:hover:not(:disabled){border-color:var(--color-primary);background:var(--color-primary-subtle)}
.mcf-picker-option:disabled{cursor:not-allowed;color:var(--color-text-muted)}
.mcf-picker-reason{grid-column:1/-1;font-size:.75rem;color:var(--color-text-muted)}
.mcf-notice{display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;padding:.5rem .75rem;border:1px solid var(--color-warning-border,var(--color-border));border-radius:var(--radius-md,8px);background:var(--color-warning-bg,var(--color-bg-subtle));color:var(--color-text);font-size:.8125rem}

@media (max-width:640px){
  .mcf-stage{aspect-ratio:1/1}
  .mcf-button--wide{flex-basis:100%}
}
@media (prefers-reduced-motion:no-preference){
  .mcf-tab,.mcf-preset,.mcf-chip,.mcf-stage-round,.mcf-unit-select,.mcf-swatch,.mcf-button,.mcf-picker-option{transition:background-color .15s ease,border-color .15s ease,box-shadow .15s ease}
}
`
