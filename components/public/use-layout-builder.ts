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
//
// Units standing on their own (lib/free-units) sit beside the chain in the
// draft, each with its own place on the floor. They share the layout's size
// limit, and an edit to the chain that grows into one moves it out of the way
// rather than being refused.
import { useMemo, useReducer } from 'react'
import {
  addAtEnd,
  addFrontSpur,
  flipEntry,
  hostEntryIdForSpur,
  removeEntry,
  replaceEntry,
  replaceFrontSpur,
  turnEntry,
  type ChainLimits,
  type EditRefusal,
  type EditResult,
} from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import {
  commitPlacement,
  layoutPieceCount,
  type ChainEnd,
  type CornerBackSide,
  type FloorVector,
  type ChainEntry,
  type FrontSpur,
  type PieceDefinition,
  type PlacedPiece,
} from '@/modules/modular-configurator-for-shop/lib/chain-geometry'
import {
  canStandFree,
  chainLimitsBeside,
  fitsAt,
  freeUnitFromSpot,
  placeFreeUnit,
  placeFreeUnits,
  settleFreeUnits,
  snapFloorPoint,
  spotForFreeUnit,
  turnedFreeUnit,
  type FreeUnit,
  type FreeUnitSpot,
} from '@/modules/modular-configurator-for-shop/lib/free-units'
import type { OptionSelection } from '@/modules/shop-variations/lib/selection-logic'

export interface LayoutDraft {
  chain: ChainEntry[]
  /** Units standing on their own, away from the chain. */
  free: FreeUnit[]
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
        turned?: boolean
        cornered?: CornerBackSide
        front?: { pieceId: string; choices?: OptionSelection }
      }>
      /** Units standing on their own, where the chain's first unit is at the origin facing forward. */
      free?: ReadonlyArray<{ pieceId: string; choices?: OptionSelection; spot: FreeUnitSpot }>
      byShopper: boolean
    }
  /** `roundCorner`: lay the table at that end as a corner and send the new unit off round it. */
  | { type: 'add'; end: ChainEnd; pieceId: string; roundCorner?: boolean }
  /** `select`: open the new unit's panel - yes from a unit's own panel, no from a dashed space, like an end. */
  | { type: 'add-front-spur'; hostEntryId: string; pieceId: string; select: boolean }
  /** A unit standing on its own, put somewhere clear. */
  | { type: 'add-free'; pieceId: string }
  /** A unit standing on its own, moved to stand with its middle at `centre`. */
  | { type: 'move-free'; entryId: string; centre: FloorVector }
  /** A unit standing on its own, turned one step further round. */
  | { type: 'turn-free'; entryId: string }
  | { type: 'remove'; entryId: string }
  | { type: 'swap'; entryId: string; pieceId: string }
  | { type: 'flip'; entryId: string }
  | { type: 'turn'; entryId: string }
  | { type: 'set-unit-choice'; entryId: string; optionId: string; valueId: string | null }
  | { type: 'select'; entryId: string | null }
  | { type: 'undo' }
  | { type: 'clear' }
  | { type: 'dismiss-refusal' }

const HISTORY_LIMIT = 40
const EMPTY_DRAFT: LayoutDraft = { chain: [], free: [], unitChoices: {} }

function entryIdFor(number: number): string {
  return `u${number}`
}

function entryIdsInLayout(draft: Pick<LayoutDraft, 'chain' | 'free'>): string[] {
  return [
    ...draft.chain.flatMap((entry) => [entry.entryId, ...(entry.frontSpur ? [entry.frontSpur.entryId] : [])]),
    ...draft.free.map((unit) => unit.entryId),
  ]
}

function keepChoicesFor(draft: Pick<LayoutDraft, 'chain' | 'free'>, unitChoices: Record<string, OptionSelection>): Record<string, OptionSelection> {
  const kept: Record<string, OptionSelection> = {}
  for (const entryId of entryIdsInLayout(draft)) {
    const choices = unitChoices[entryId]
    if (choices && Object.keys(choices).length > 0) kept[entryId] = choices
  }
  return kept
}

export function useLayoutBuilder(definitions: ReadonlyMap<string, PieceDefinition>, limits: ChainLimits) {
  const reducer = useMemo(() => createReducer(definitions, limits), [definitions, limits])
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  // The chain's units and the ones standing on their own, in list order: what
  // the views draw, and what the layout's size is measured round.
  const allPlaced = useMemo(
    () => [...state.placed, ...placeFreeUnits(state.draft.free, definitions)],
    [state.placed, state.draft.free, definitions],
  )
  return { ...state, allPlaced, dispatch, canUndo: state.history.length > 0 }
}

function initialState(): BuilderState {
  return { draft: EMPTY_DRAFT, placed: [], history: [], selectedEntryId: null, nextEntryNumber: 1, refusal: null, editCount: 0 }
}

function createReducer(definitions: ReadonlyMap<string, PieceDefinition>, limits: ChainLimits) {
  /** Commits a new draft: re-walks, anchors, pushes the old one onto the undo stack. */
  function commit(state: BuilderState, draft: LayoutDraft, extra: Partial<BuilderState> = {}, movedEntryId: string | null = null): BuilderState {
    const placed = commitPlacement(draft.chain, definitions, state.placed, movedEntryId)
    // Anything the chain has grown into is moved clear of it.
    const free = settleFreeUnits(placed, draft.free, definitions)
    const stillSelected = state.selectedEntryId !== null && entryIdsInLayout({ chain: draft.chain, free }).includes(state.selectedEntryId)
    return {
      ...state,
      draft: { chain: draft.chain, free, unitChoices: keepChoicesFor({ chain: draft.chain, free }, draft.unitChoices) },
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
    return commit(state, { ...state.draft, chain: result.chain }, extra, result.displacedEntryId)
  }

  /** The chain's edits work to the room the free units leave. */
  function chainLimits(state: BuilderState): ChainLimits {
    return chainLimitsBeside(state.draft.free, limits)
  }

  /** Everything on the floor now: the placed chain and every free unit. */
  function everythingPlaced(state: BuilderState): PlacedPiece[] {
    return [...state.placed, ...placeFreeUnits(state.draft.free, definitions)]
  }

  /** Commits the free units changed one way, or refuses when that would sit one on something. */
  function withFreeUnit(state: BuilderState, entryId: string, change: (unit: FreeUnit) => FreeUnit | null, extra: Partial<BuilderState> = {}): BuilderState {
    const current = state.draft.free.find((unit) => unit.entryId === entryId)
    if (!current) return { ...state, refusal: 'unknown-entry' }
    const next = change(current)
    if (!next) return { ...state, refusal: 'unknown-piece' }
    const definition = definitions.get(next.pieceId)
    if (!definition) return { ...state, refusal: 'unknown-piece' }
    const others = everythingPlaced(state).filter((piece) => piece.entry.entryId !== entryId)
    const piece = placeFreeUnit(next, definition)
    if (!fitsAt([...others, piece], entryId, piece.pose.centre)) return { ...state, refusal: 'would-overlap' }
    const free = state.draft.free.map((unit) => (unit.entryId === entryId ? next : unit))
    return commit(state, { ...state.draft, free }, extra)
  }

  return function builderReducer(state: BuilderState, action: BuilderAction): BuilderState {
    switch (action.type) {
      case 'start-from': {
        let number = state.nextEntryNumber
        const chain: ChainEntry[] = []
        const unitChoices: Record<string, OptionSelection> = {}
        const freeWanted = (action.free ?? []).filter((unit) => {
          const definition = definitions.get(unit.pieceId)
          return definition !== undefined && canStandFree(definition)
        })
        // The chain first: a link with more units than the range now allows keeps the layout, not the extras.
        action.units.forEach((unit) => {
          if (!definitions.has(unit.pieceId) || layoutPieceCount(chain) >= limits.maxPieces) return
          const entryId = entryIdFor(number)
          number += 1
          let entry: ChainEntry = {
            entryId,
            pieceId: unit.pieceId,
            ...(unit.flipped ? { flipped: true } : {}),
            ...(unit.turned ? { turned: true } : {}),
            ...(unit.cornered ? { cornered: unit.cornered } : {}),
          }
          if (unit.choices) unitChoices[entryId] = unit.choices
          // A layout written before the range stopped standing units in front
          // of one another - a shared link, say - still opens: the unit in
          // front is simply left off, rather than the whole layout refused.
          if (limits.frontUnits === true && unit.front && definitions.has(unit.front.pieceId) && layoutPieceCount([...chain, entry]) < limits.maxPieces) {
            const spurId = entryIdFor(number)
            number += 1
            entry = { ...entry, frontSpur: { entryId: spurId, pieceId: unit.front.pieceId } }
            if (unit.front.choices) unitChoices[spurId] = unit.front.choices
          }
          chain.push(entry)
        })
        const free: FreeUnit[] = []
        for (const unit of freeWanted) {
          if (layoutPieceCount(chain) + free.length >= limits.maxPieces || limits.freeUnits !== true) break
          const entryId = entryIdFor(number)
          number += 1
          free.push(freeUnitFromSpot(entryId, unit.pieceId, unit.spot))
          if (unit.choices) unitChoices[entryId] = unit.choices
        }
        // A fresh start is not anchored on what was there before: a preset is a
        // new layout, not an edit of the old one. So its first unit stands at
        // the origin facing forward, the frame free units are written in.
        const fresh = { ...state, placed: [] }
        const next = commit(fresh, { chain, free, unitChoices }, { nextEntryNumber: number, selectedEntryId: null })
        return action.byShopper ? next : { ...next, history: [], editCount: state.editCount }
      }
      case 'add': {
        const entryId = entryIdFor(state.nextEntryNumber)
        const result = addAtEnd(state.draft.chain, action.end, { entryId, pieceId: action.pieceId }, definitions, chainLimits(state), { roundCorner: action.roundCorner === true })
        // The new unit is not selected: a shopper laying out a row adds several in
        // a go, and a unit panel opening after each one would be in their way.
        return applyEdit(state, result, { nextEntryNumber: state.nextEntryNumber + 1 })
      }
      case 'add-front-spur': {
        const spurId = entryIdFor(state.nextEntryNumber)
        const spur: FrontSpur = { entryId: spurId, pieceId: action.pieceId }
        const result = addFrontSpur(state.draft.chain, action.hostEntryId, spur, definitions, chainLimits(state))
        return applyEdit(state, result, { nextEntryNumber: state.nextEntryNumber + 1, ...(action.select ? { selectedEntryId: spurId } : {}) })
      }
      case 'add-free': {
        const definition = definitions.get(action.pieceId)
        if (!definition) return { ...state, refusal: 'unknown-piece' }
        if (limits.freeUnits !== true || !canStandFree(definition)) return { ...state, refusal: 'cannot-stand-free' }
        if (layoutPieceCount(state.draft.chain) + state.draft.free.length >= limits.maxPieces) return { ...state, refusal: 'too-many-pieces' }
        const entryId = entryIdFor(state.nextEntryNumber)
        const centre = spotForFreeUnit(definition, entryId, everythingPlaced(state))
        const unit: FreeUnit = { entryId, pieceId: action.pieceId, centre, rotationY: 0 }
        // Not selected, as at an end: a shopper adding two tables adds them in a go.
        return commit(state, { ...state.draft, free: [...state.draft.free, unit] }, { nextEntryNumber: state.nextEntryNumber + 1 })
      }
      case 'move-free':
        return withFreeUnit(state, action.entryId, (unit) => ({ ...unit, centre: snapFloorPoint(action.centre) }))
      case 'turn-free':
        return withFreeUnit(state, action.entryId, turnedFreeUnit)
      case 'remove': {
        if (state.draft.free.some((unit) => unit.entryId === action.entryId)) {
          return commit(state, { ...state.draft, free: state.draft.free.filter((unit) => unit.entryId !== action.entryId) })
        }
        return applyEdit(state, removeEntry(state.draft.chain, action.entryId, definitions, chainLimits(state)))
      }
      case 'swap': {
        if (state.draft.free.some((unit) => unit.entryId === action.entryId)) {
          const definition = definitions.get(action.pieceId)
          if (!definition || !canStandFree(definition)) return { ...state, refusal: 'cannot-stand-free' }
          return withFreeUnit(state, action.entryId, (unit) => ({ ...unit, pieceId: action.pieceId }), { selectedEntryId: action.entryId })
        }
        const spurHost = hostEntryIdForSpur(state.draft.chain, action.entryId)
        if (spurHost) {
          const result = replaceFrontSpur(state.draft.chain, spurHost, action.pieceId, definitions, chainLimits(state))
          if (!result.ok) return { ...state, refusal: result.refusal }
          return commit(state, { ...state.draft, chain: result.chain }, { selectedEntryId: action.entryId })
        }
        const entryId = entryIdFor(state.nextEntryNumber)
        const result = replaceEntry(state.draft.chain, action.entryId, { entryId, pieceId: action.pieceId }, definitions, chainLimits(state))
        if (!result.ok) return { ...state, refusal: result.refusal }
        // The swapped-in unit keeps the choices the old one had made for itself.
        const carried = state.draft.unitChoices[action.entryId]
        const unitChoices = carried ? { ...state.draft.unitChoices, [entryId]: carried } : state.draft.unitChoices
        return commit(state, { ...state.draft, chain: result.chain, unitChoices }, { nextEntryNumber: state.nextEntryNumber + 1, selectedEntryId: entryId })
      }
      case 'flip':
        return applyEdit(state, flipEntry(state.draft.chain, action.entryId, definitions, chainLimits(state)))
      case 'turn':
        return applyEdit(state, turnEntry(state.draft.chain, action.entryId, definitions, chainLimits(state)))
      case 'set-unit-choice': {
        const current = { ...(state.draft.unitChoices[action.entryId] ?? {}) }
        if (action.valueId) current[action.optionId] = action.valueId
        else delete current[action.optionId]
        return commit(state, { ...state.draft, unitChoices: { ...state.draft.unitChoices, [action.entryId]: current } })
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
        return state.draft.chain.length === 0 && state.draft.free.length === 0 ? state : commit(state, EMPTY_DRAFT, { selectedEntryId: null })
      case 'dismiss-refusal':
        return { ...state, refusal: null }
    }
  }
}
