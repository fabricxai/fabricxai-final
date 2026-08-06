'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert, Modal, Toast } from '@/components/fx/feedback'
import { TextInput } from '@/components/fx/forms'
import { useLocale, useT } from '@/components/fx/locale'
import { Badge, Button } from '@/components/fx/primitives'
import { Eyebrow } from '@/components/fx/signature'
import { actionErrorMessage } from '@/lib/action-error'
import { factoryToday } from '@/lib/dates'
import {
  convertLeadToBuyer,
  findConversionDuplicates,
  logLeadActivity,
  moveLeadStage,
} from '@/modules/buyers/actions'
import { leadStageMachine, type LeadStage } from '@/modules/buyers/buyers'

/** What the board hands over. A subset of `LeadCard` — the drawer needs no more. */
export interface DrawerLead {
  id: string
  companyName: string
  country: string | null
  stage: LeadStage
  website?: string | null
  daysQuiet: number
  lastActivity: { kind: string; summary: string; occurredAt: string } | null
}

type Duplicate = { kind: 'buyer' | 'lead'; id: string; name: string; similarity: number; domainMatch: boolean }

/**
 * The lead desk, made operable (plan 5.2, audit FE-B4).
 *
 * `moveLeadStage`, `logLeadActivity` and `convertLeadToBuyer` were written with 1.1 and had
 * zero importers. So the pipeline board showed leads that could not move, a quiet-lead
 * warning driven by an activity log nothing could write to, and a conversion path — the one
 * that turns a prospect into a buyer every order afterwards hangs off — reachable only from
 * a database console.
 *
 * ## The legal moves come from the machine
 *
 * `leadStageMachine` is pure and imports nothing but `defineStateMachine`, so the client can
 * read the same transition table the server enforces. Offering a move the server would
 * refuse is how somebody learns to distrust a board; offering only the legal ones means the
 * 409 is a race, not a routine.
 *
 * ## Losing needs a reason, and that is not a form nicety
 *
 * The service refuses `lost` without one. A pipeline full of bare "lost" rows has no answer
 * to "why are we losing" — and a 3% price loss and a 22% price loss are different problems.
 */
export function LeadDrawer({ lead, onClose }: { lead: DrawerLead | null; onClose: () => void }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [failure, setFailure] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [stage, setStage] = useState<LeadStage | ''>('')
  const [lostReason, setLostReason] = useState('')

  const [activityKind, setActivityKind] = useState<'call' | 'email' | 'meeting' | 'note'>('call')
  const [summary, setSummary] = useState('')

  const [converting, setConverting] = useState(false)
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null)
  const [buyerCode, setBuyerCode] = useState('')

  if (!lead) return null

  const legal = leadStageMachine.next(lead.stage)

  function flash(message: string) {
    setToast(message)
    setTimeout(() => setToast(null), 5200)
  }

  function move() {
    if (!lead || stage === '') return
    setFailure(null)

    startTransition(async () => {
      try {
        await moveLeadStage({
          leadId: lead.id,
          stage,
          ...(stage === 'lost' ? { lostReason: lostReason.trim() } : {}),
        })
        onClose()
        flash(t('ui.buyers.stage_moved', { stage: t(`ui.buyers.stage_${stage}`) }))
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, t('ui.buyers.stage_failed'), locale))
      }
    })
  }

  function log() {
    if (!lead || summary.trim() === '') return
    setFailure(null)

    startTransition(async () => {
      try {
        await logLeadActivity({
          leadId: lead.id,
          kind: activityKind,
          summary: summary.trim(),
          // The factory's today, not the browser's — the quiet clock is measured in
          // calendar days and a tablet on UTC would file the evening's call as yesterday.
          occurredAt: factoryToday(),
        })
        setSummary('')
        flash(t('ui.buyers.activity_logged'))
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, t('ui.buyers.activity_failed'), locale))
      }
    })
  }

  /** Step one of two: ask who this company might already be. */
  function beginConvert() {
    if (!lead) return
    setFailure(null)
    setDuplicates(null)
    setBuyerCode('')
    setConverting(true)

    startTransition(async () => {
      try {
        setDuplicates(
          await findConversionDuplicates({
            leadId: lead.id,
            name: lead.companyName,
            ...(lead.website ? { website: lead.website } : {}),
          }),
        )
      } catch (error) {
        // A failed duplicate check must not stop a conversion — it is advice, not a gate.
        // Reported so nobody reads an empty list as "no duplicates".
        setDuplicates([])
        setFailure(actionErrorMessage(error, t('ui.buyers.duplicates_unavailable'), locale))
      }
    })
  }

  function convert() {
    if (!lead || buyerCode.trim() === '') return
    setFailure(null)

    startTransition(async () => {
      try {
        const result = await convertLeadToBuyer({ leadId: lead.id, code: buyerCode.trim() })
        setConverting(false)
        onClose()
        // `created: false` is the idempotent path — the lead had already been converted, and
        // saying "converted" again would claim a buyer was made that was not.
        flash(result.created ? t('ui.buyers.converted') : t('ui.buyers.already_converted'))
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, t('ui.buyers.convert_failed'), locale))
      }
    })
  }

  return (
    <>
      <Modal open={!converting} onClose={onClose} title={lead.companyName}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Badge tone="info">{t(`ui.buyers.stage_${lead.stage}`)}</Badge>
            {lead.country ? <Badge>{lead.country}</Badge> : null}
            <span
              style={{
                font: "400 12px/1.3 var(--fx-font-mono)",
                color: 'var(--fx-text-tertiary)',
              }}
            >
              {lead.lastActivity
                ? t('ui.buyers.last_touch', {
                    kind: lead.lastActivity.kind,
                    on: lead.lastActivity.occurredAt,
                    days: lead.daysQuiet,
                  })
                : t('ui.buyers.never_touched', { days: lead.daysQuiet })}
            </span>
          </div>

          {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

          {/* ── Log what happened ────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow>{t('ui.buyers.log_activity')}</Eyebrow>
            <div
              className="fx-stack-tablet"
              style={{ display: 'grid', gridTemplateColumns: '140px minmax(0, 1fr)', gap: 10 }}
            >
              <select
                value={activityKind}
                onChange={(e) => setActivityKind(e.target.value as typeof activityKind)}
                style={selectStyle}
              >
                {(['call', 'email', 'meeting', 'note'] as const).map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`ui.buyers.kind_${kind}`)}
                  </option>
                ))}
              </select>
              <TextInput
                label=""
                placeholder={t('ui.buyers.activity_placeholder')}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                onClick={log}
                disabled={pending || summary.trim() === ''}
              >
                {t('ui.buyers.log_it')}
              </Button>
            </div>
          </section>

          {/* ── Move it ──────────────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow>{t('ui.buyers.move_stage')}</Eyebrow>
            {legal.length === 0 ? (
              // `won` is terminal. Saying so beats an empty dropdown somebody clicks twice.
              <InlineAlert tone="info">{t('ui.buyers.stage_terminal')}</InlineAlert>
            ) : (
              <>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value as LeadStage | '')}
                  style={selectStyle}
                >
                  <option value="">{t('ui.buyers.choose_stage')}</option>
                  {legal.map((next) => (
                    <option key={next} value={next}>
                      {t(`ui.buyers.stage_${next}`)}
                    </option>
                  ))}
                </select>

                {stage === 'lost' ? (
                  <TextInput
                    label={t('ui.buyers.lost_reason')}
                    hint={t('ui.buyers.lost_reason_hint')}
                    value={lostReason}
                    onChange={(e) => setLostReason(e.target.value)}
                  />
                ) : null}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="secondary"
                    onClick={move}
                    disabled={
                      pending || stage === '' || (stage === 'lost' && lostReason.trim() === '')
                    }
                  >
                    {t('ui.buyers.move_it')}
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* ── Make it a buyer ──────────────────────────────────────────── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Eyebrow>{t('ui.buyers.convert')}</Eyebrow>
            <span
              style={{ font: "400 13px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-secondary)' }}
            >
              {t('ui.buyers.convert_body')}
            </span>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" onClick={beginConvert} disabled={pending}>
                {t('ui.buyers.convert_start')}
              </Button>
            </div>
          </section>
        </div>
      </Modal>

      {/* ── Step two: who might this already be, and what is its code ───── */}
      <Modal
        open={converting}
        onClose={() => setConverting(false)}
        title={t('ui.buyers.convert_title', { name: lead.companyName })}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {duplicates === null ? (
            <span style={{ font: "400 13px/1.5 var(--fx-font-sans)", color: 'var(--fx-text-tertiary)' }}>
              {t('ui.buyers.checking_duplicates')}
            </span>
          ) : duplicates.length === 0 ? (
            <InlineAlert tone="info">{t('ui.buyers.no_duplicates')}</InlineAlert>
          ) : (
            <>
              {/*
                * Advice, not a gate. A division or a sourcing office is a real second entity
                * with a real similar name, and a check that refused would be one people
                * learn to work around by mistyping the name.
                */}
              <InlineAlert tone="warning">
                {t('ui.buyers.duplicates_found', { count: duplicates.length })}
              </InlineAlert>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {duplicates.map((candidate) => (
                  <li
                    key={`${candidate.kind}-${candidate.id}`}
                    style={{ font: "400 13px/1.5 var(--fx-font-sans)" }}
                  >
                    <span style={{ fontWeight: 500 }}>{candidate.name}</span>
                    <span style={{ color: 'var(--fx-text-tertiary)' }}>
                      {' · '}
                      {t(`ui.buyers.kind_of_${candidate.kind}`)}
                      {candidate.domainMatch
                        ? ` · ${t('ui.buyers.same_website')}`
                        : ` · ${Math.round(candidate.similarity * 100)}%`}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <TextInput
            label={t('ui.buyers.buyer_code')}
            hint={t('ui.buyers.buyer_code_hint')}
            mono
            value={buyerCode}
            onChange={(e) => setBuyerCode(e.target.value.toUpperCase())}
          />

          {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setConverting(false)}>
              {t('ui.common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={convert}
              // Not before the check has answered: the whole point of the second step is
              // that nobody creates a duplicate buyer without having been shown one.
              disabled={pending || buyerCode.trim() === '' || duplicates === null}
            >
              {t('ui.buyers.convert_confirm')}
            </Button>
          </div>
        </div>
      </Modal>

      {toast ? (
        <div style={{ position: 'fixed', left: 28, bottom: 28, zIndex: 60, maxWidth: 460 }}>
          <Toast message={toast} />
        </div>
      ) : null}
    </>
  )
}

const selectStyle: React.CSSProperties = {
  font: "400 14px/1.2 var(--fx-font-sans)",
  padding: '10px 12px',
  minHeight: 'var(--fx-tap-min)',
  border: '1px solid var(--fx-border-default)',
  borderRadius: 'var(--fx-radius-md)',
  background: 'var(--fx-bg-surface)',
  color: 'var(--fx-text-primary)',
}
