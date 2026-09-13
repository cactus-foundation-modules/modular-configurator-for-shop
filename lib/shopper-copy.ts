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
      return 'Only a curved unit with no back can be turned the other way round.'
    case 'piece-closed-on-joining-side':
      return 'Its arm would face into the layout. Try it on the other end.'
    case 'would-overlap':
      return 'There is no room there - it would sit on top of another unit.'
    case 'too-many-pieces':
      return `A layout can have up to ${maxPieces} units.`
    case 'neighbours-cannot-join':
      return 'Those two units cannot sit side by side - an arm would be in the way.'
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
      return 'Only a curve with no back turns round'
    case 'piece-closed-on-joining-side':
      return 'Its arm would face into the layout'
    case 'would-overlap':
      return 'No room - it would overlap'
    case 'too-many-pieces':
      return `Up to ${maxPieces} units`
    case 'neighbours-cannot-join':
      return 'An arm would be in the way'
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
