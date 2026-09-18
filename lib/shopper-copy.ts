// The builder's words for the shopper, in one place: why an edit was refused,
// why a unit cannot be bought as it stands. Written from the shopper's side of
// the screen - arms and seats, never chains and faces.
import type { EditRefusal } from '@/modules/modular-configurator-for-shop/lib/chain-editing'
import type { UnitProblem } from '@/modules/modular-configurator-for-shop/lib/layout-pricing'

export function refusalSentence(refusal: EditRefusal, maxPieces: number): string {
  switch (refusal) {
    case 'end-is-closed':
      return 'That end finishes with an arm, so nothing can join on there.'
    case 'layout-is-closed':
      return 'Your layout joins up all the way round, so there is no end left to add to.'
    case 'cannot-flip':
      return 'Only a curved or wedge-shaped unit with no back can be turned the other way round.'
    case 'cannot-turn':
      return 'Only a unit with no back can be turned.'
    case 'cannot-corner':
      return 'Only a table made to sit in a corner can have a row go off round it.'
    case 'piece-closed-on-joining-side':
      return 'Its arm would face into the layout. Try it on the other end.'
    case 'would-overlap':
      return 'There is no room there - it would sit on top of another unit.'
    case 'too-many-pieces':
      return `A layout can have up to ${maxPieces} units.`
    case 'neighbours-cannot-join':
      return 'Those two units cannot sit side by side - an arm would be in the way.'
    case 'front-units-not-offered':
      return 'This range is not made to stand one unit in front of another.'
    case 'cannot-stand-free':
      return 'Only a table, stool or armchair can stand on its own, away from the layout.'
    case 'unknown-entry':
    case 'unknown-piece':
      return 'That unit is not available any more.'
  }
}

/** Short reason shown under a refused choice in the "add a unit" list. */
export function refusalHint(refusal: EditRefusal, maxPieces: number): string {
  switch (refusal) {
    case 'end-is-closed':
      return 'This end already finishes with an arm'
    case 'layout-is-closed':
      return 'The layout already joins up all the way round'
    case 'cannot-flip':
      return 'Only a curve or wedge with no back turns round'
    case 'cannot-turn':
      return 'Only a unit with no back turns'
    case 'cannot-corner':
      return 'That end cannot turn a corner'
    case 'piece-closed-on-joining-side':
      return 'Its arm would face into the layout'
    case 'would-overlap':
      return 'No room - it would overlap'
    case 'too-many-pieces':
      return `Up to ${maxPieces} units`
    case 'neighbours-cannot-join':
      return 'An arm would be in the way'
    case 'front-units-not-offered':
      return 'Not made to stand in front of another unit'
    case 'cannot-stand-free':
      return 'Only joins a layout'
    case 'unknown-entry':
    case 'unknown-piece':
      return 'No longer available'
  }
}

export function unitProblemSentence(problem: UnitProblem): string {
  switch (problem) {
    case 'needs-choice':
      return 'Choose the options below first'
    case 'unavailable':
      return 'Not made in this combination'
    case 'out-of-stock':
      return 'Out of stock in this combination'
  }
}
