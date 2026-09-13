'use client'

// Asks the basket what delivering the layout would be (see lib/layout-delivery)
// and keeps the answer for as long as the layout's variations stay the same.
//
// Only the variations and how many of each matter to the answer, so edits that
// change neither - selecting a unit, rearranging identical ones - never ask
// again, and each distinct set is asked about once per visit. A shop with no
// delivery services, a closed shop, or a failed request all simply mean "no
// delivery picker", never an error in front of a shopper.
import { useEffect, useMemo, useState } from 'react'
import {
  combineLayoutDelivery,
  commonServices,
  plainTrialLines,
  serviceTrialLines,
  ValidateResponseSchema,
  type DeliveryUnitLine,
  type LayoutDelivery,
  type TrialLineRequest,
  type ValidatedLine,
} from '@/modules/modular-configurator-for-shop/lib/layout-delivery'

const VALIDATE_URL = '/api/m/shop/public/cart/validate'
/** Comfortably inside the basket's 200-line ceiling per request. */
const LINES_PER_REQUEST = 150
const ASK_AFTER_MS = 250

interface DeliveryAnswer {
  plain: ValidatedLine[]
  trial: ValidatedLine[]
}

const answers = new Map<string, Promise<DeliveryAnswer | null>>()

async function validate(lines: readonly TrialLineRequest[]): Promise<ValidatedLine[]> {
  const out: ValidatedLine[] = []
  for (let start = 0; start < lines.length; start += LINES_PER_REQUEST) {
    const response = await fetch(VALIDATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: lines.slice(start, start + LINES_PER_REQUEST) }),
    })
    if (!response.ok) throw new Error(`Basket check answered ${response.status}`)
    out.push(...ValidateResponseSchema.parse(await response.json()).lines)
  }
  return out
}

async function askBasket(lines: readonly DeliveryUnitLine[]): Promise<DeliveryAnswer | null> {
  const plain = await validate(plainTrialLines(lines))
  const services = commonServices(plain)
  if (!services) return { plain, trial: [] }
  return { plain, trial: await validate(serviceTrialLines(lines, services.metaKey, services.values)) }
}

function answerFor(key: string, lines: readonly DeliveryUnitLine[]): Promise<DeliveryAnswer | null> {
  let answer = answers.get(key)
  if (!answer) {
    answer = askBasket(lines).catch(() => {
      // Not kept: a blip should not cost this layout its delivery picker for the visit.
      answers.delete(key)
      return null
    })
    answers.set(key, answer)
  }
  return answer
}

/**
 * `lines` should keep its identity while its content does (memoise it): the
 * answer is cached by content, but a fresh array each render would reset the
 * short wait before asking.
 */
export function useLayoutDelivery(
  lines: readonly DeliveryUnitLine[],
  chosenValue: string | null,
  currencySymbol: string,
): { delivery: LayoutDelivery | null; checking: boolean } {
  const key = [...lines].sort((a, b) => a.productId.localeCompare(b.productId)).map((line) => `${line.productId}x${line.quantity}`).join(',')
  const [settled, setSettled] = useState<{ key: string; answer: DeliveryAnswer | null } | null>(null)

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      void answerFor(key, lines).then((answer) => {
        if (!cancelled) setSettled({ key, answer })
      })
    }, ASK_AFTER_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key, lines])

  const answer = settled && settled.key === key ? settled.answer : null
  const delivery = useMemo(
    () => (answer ? combineLayoutDelivery(lines, answer.plain, answer.trial, chosenValue, currencySymbol) : null),
    [answer, lines, chosenValue, currencySymbol],
  )
  return { delivery, checking: Boolean(key) && settled?.key !== key }
}
