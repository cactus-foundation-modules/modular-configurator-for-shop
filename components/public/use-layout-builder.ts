'use client'

// The layout the shopper is building, and every edit to it.
//
// Pattern: a reducer over an immutable draft (the chain of units plus each
// unit's own choices), with an undo stack. Every edit goes through the pure
// rules in lib/chain-editing, so a refused edit leaves the draft untouched and
// raises a notice saying why - the builder can never hold a layout it could not
// draw, price or sell. Placement is re-walked after each edit and anchored on
// the units that were already there, so nothing the shopper has already placed
// jumps (see anchorLayout).
import { useMemo, useReducer } from 'react'
import {
  addAtEnd,
  addFrontSpur,
  flipEntry,
  hostEntryIdForSpur,
  removeEntry,
  replaceEntry,
  replaceFrontSpur,
  type ChainLimits,
  type EditRefusal,
  type EditResult,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  commitPlacement,
  layoutPieceCount,
  type ChainEnd,
  type ChainEntry,
  type FrontSpur,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'

export interface LayoutDraft {
  chain: ChainEntry[]
  /** Choices a unit makes differently from the rest of the layout, by entry id. */
  unitChoices: Record<string, OptionSelection>
}

interface BuilderState {
  draft: LayoutDraft
  placed: PlacedPiece[]
  history: LayoutDraft[]
  selectedEntryId: string | null
  nextEntryNumber: number
  refusal: EditRefusal | null
  /** Bumped by every edit the shopper makes, so the address bar is only written after one. */
  editCount: number
}

export type BuilderAction =
  | {
      type: 'start-from'
      units: ReadonlyArray<{
        pieceId: string
        choices?: OptionSelection
        flipped?: boolean
        front?: { pieceId: string; choices?: OptionSelection }
      }>
      byShopper: boolean
    }
  | { type: 'add'; end: ChainEnd; pieceId: string }
  | { type: 'add-front-spur'; hostEntryId: string; pieceId: string }
  | { type: 'remove'; entryId: string }
  | { type: 'swap'; entryId: string; pieceId: string }
  | { type: 'flip'; entryId: string }
  | { type: 'set-unit-choice'; entryId: string; optionId: string; valueId: string | null }
  | { type: 'select'; entryId: string | null }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'dismiss-refusal' }

const HISTORY_LIMIT = 40
const EMPTY_DRAFT: LayoutDraft = { chain: [], unitChoices: {} }

function entryIdFor(number: number): string {
  return `u${number}`
}

function entryIdsInLayout(chain: readonly ChainEntry[]): string[] {
  return chain.flatMap((entry) => [entry.entryId, ...(entry.frontSpur ? [entry.frontSpur.entryId] : [])])
}

function keepChoicesFor(chain: readonly ChainEntry[], unitChoices: Record<string, OptionSelection>): Record<string, OptionSelection> {
  const kept: Record<string, OptionSelection> = {}
  for (const entryId of entryIdsInLayout(chain)) {
    const choices = unitChoices[entryId]
    if (choices && Object.keys(choices).length > 0) kept[entryId] = choices
  }
  return kept
}

export function useLayoutBuilder(definitions: ReadonlyMap<string, PieceDefinition>, limits: ChainLimits) {
  const reducer = useMemo(() => createReducer(definitions, limits), [definitions, limits])
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  return { ...state, dispatch, canUndo: state.history.length > 0 }
}

function initialState(): BuilderState {
  return { draft: EMPTY_DRAFT, placed: [], history: [], selectedEntryId: null, nextEntryNumber: 1, refusal: null, editCount: 0 }
}

function createReducer(definitions: ReadonlyMap<string, PieceDefinition>, limits: ChainLimits) {
  /** Commits a new draft: re-walks, anchors, pushes the old one onto the undo stack. */
  function commit(state: BuilderState, draft: LayoutDraft, extra: Partial<BuilderState> = {}, movedEntryId: string | null = null): BuilderState {
    const placed = commitPlacement(draft.chain, definitions, state.placed, movedEntryId)
    const stillSelected = state.selectedEntryId !== null && entryIdsInLayout(draft.chain).includes(state.selectedEntryId)
    return {
      ...state,
      draft: { chain: draft.chain, unitChoices: keepChoicesFor(draft.chain, draft.unitChoices) },
      placed,
      history: [...state.history, state.draft].slice(-HISTORY_LIMIT),
      selectedEntryId: stillSelected ? state.selectedEntryId : null,
      refusal: null,
      editCount: state.editCount + 1,
      ...extra,
    }
  }

  function applyEdit(state: BuilderState, result: EditResult, extra: Partial<BuilderState> = {}): BuilderState {
    if (!result.ok) return { ...state, refusal: result.refusal }
    return commit(state, { chain: result.chain, unitChoices: state.draft.unitChoices }, extra, result.displacedEntryId)
  }

  return function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.type) {
      case 'start-from': {
        let number = state.nextEntryNumber
        const chain: ChainEntry[] = []
        const unitChoices: Record<string, OptionSelection> = {}
        action.units.forEach((unit) => {
          if (!definitions.has(unit.pieceId) || layoutPieceCount(chain) >= limits.maxPieces) return
          const entryId = entryIdFor(number)
          number += 1
          let entry: ChainEntry = unit.flipped ? { entryId, pieceId: unit.pieceId, flipped: true } : { entryId, pieceId: unit.pieceId }
          if (unit.choices) unitChoices[entryId] = unit.choices
          if (unit.front && definitions.has(unit.front.pieceId) && layoutPieceCount([...chain, entry]) < limits.maxPieces) {
            const spurId = entryIdFor(number)
            number += 1
            entry = { ...entry, frontSpur: { entryId: spurId, pieceId: unit.front.pieceId } }
            if (unit.front.choices) unitChoices[spurId] = unit.front.choices
          }
          chain.push(entry)
        })
        // A fresh start is not anchored on what was there before: a preset is a
        // new layout, not an edit of the old one.
        const fresh = { ...state, placed: [] }
        const next = commit(fresh, { chain, unitChoices }, { nextEntryNumber: number, selectedEntryId: null })
        return action.byShopper ? next : { ...next, history: [], editCount: state.editCount }
      }
      case 'add': {
        const entryId = entryIdFor(state.nextEntryNumber)
        const result = addAtEnd(state.draft.chain, action.end, { entryId, pieceId: action.pieceId }, definitions, limits)
        // The new unit is not selected: a shopper laying out a row adds several in
        // a go, and a unit panel opening after each one would be in their way.
        return applyEdit(state, result, { nextEntryNumber: state.nextEntryNumber + 1 })
      }
      case 'add-front-spur': {
        const spurId = entryIdFor(state.nextEntryNumber)
        const spur: FrontSpur = { entryId: spurId, pieceId: action.pieceId }
        const result = addFrontSpur(state.draft.chain, action.hostEntryId, spur, definitions, limits)
        return applyEdit(state, result, { nextEntryNumber: state.nextEntryNumber + 1, selectedEntryId: spurId })
      }
      case 'remove':
        return applyEdit(state, removeEntry(state.draft.chain, action.entryId, definitions, limits))
      case 'swap': {
        const spurHost = hostEntryIdForSpur(state.draft.chain, action.entryId)
        if (spurHost) {
          const result = replaceFrontSpur(state.draft.chain, spurHost, action.pieceId, definitions, limits)
          if (!result.ok) return { ...state, refusal: result.refusal }
          return commit(state, { chain: result.chain, unitChoices: state.draft.unitChoices }, { selectedEntryId: action.entryId })
        }
        const entryId = entryIdFor(state.nextEntryNumber)
        const result = replaceEntry(state.draft.chain, action.entryId, { entryId, pieceId: action.pieceId }, definitions, limits)
        if (!result.ok) return { ...state, refusal: result.refusal }
        // The swapped-in unit keeps the choices the old one had made for itself.
        const carried = state.draft.unitChoices[action.entryId]
        const unitChoices = carried ? { ...state.draft.unitChoices, [entryId]: carried } : state.draft.unitChoices
        return commit(state, { chain: result.chain, unitChoices }, { nextEntryNumber: state.nextEntryNumber + 1, selectedEntryId: entryId })
      }
      case 'flip':
        return applyEdit(state, flipEntry(state.draft.chain, action.entryId, definitions, limits))
      case 'set-unit-choice': {
        const current = { ...(state.draft.unitChoices[action.entryId] ?? {}) }
        if (action.valueId) current[action.optionId] = action.valueId
        else delete current[action.optionId]
        return commit(state, { chain: state.draft.chain, unitChoices: { ...state.draft.unitChoices, [action.entryId]: current } })
      }
      case 'select':
        return { ...state, selectedEntryId: action.entryId, refusal: null }
      case 'undo': {
        const previous = state.history[state.history.length - 1]
        if (!previous) return state
        return {
          ...state,
          draft: previous,
          placed: commitPlacement(previous.chain, definitions, state.placed),
          history: state.history.slice(0, -1),
          selectedEntryId: null,
          refusal: null,
          editCount: state.editCount + 1,
        }
      }
      case 'clear':
        return state.draft.chain.length === 0 ? state : commit(state, EMPTY_DRAFT, { selectedEntryId: null })
      case 'dismiss-refusal':
        return { ...state, refusal: null }
    }
  }
}
