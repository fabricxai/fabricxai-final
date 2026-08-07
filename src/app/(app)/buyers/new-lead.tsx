'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { InlineAlert, Modal, Toast } from '@/components/fx/feedback'
import { Select, TextArea, TextInput } from '@/components/fx/forms'
import { useLocale, useT } from '@/components/fx/locale'
import { Button } from '@/components/fx/primitives'
import { actionErrorMessage } from '@/lib/action-error'
import { addLead } from '@/modules/buyers/actions'

/** The five the service accepts. Kept in this order because it is how a merchandiser thinks. */
const SOURCES = ['fair', 'referral', 'buying_house', 'inbound', 'other'] as const
type Source = (typeof SOURCES)[number]

/**
 * The way a lead gets onto the board.
 *
 * There was no way. `createLead` existed in the service from 1.1 with no action and no form,
 * so its only callers were the integration tests and the demo script — and since there is no
 * `createBuyer` in this codebase at all (a buyer is made by CONVERTING a lead), a factory
 * that could not enter a lead could not enter a buyer either. Orders, LCs, shipments and
 * every scorecard hang off a buyer, so the desk being read-only was not one screen missing a
 * button; it was the first link of the chain.
 *
 * ## Only the company name is required
 *
 * Country, website and notes are all optional in `leadPayload`, and the form keeps them that
 * way. A lead is often a business card and a conversation — demanding a website before the
 * board will accept it is how people learn to type "x" into fields, which is worse than an
 * empty column because it looks like data.
 *
 * The website hint earns its length: `detectDuplicates` scores a shared domain above any
 * name similarity, so ten seconds here is what stops the same buyer arriving twice under two
 * spellings and splitting its order history in half.
 */
export function NewLead() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const [companyName, setCompanyName] = useState('')
  const [source, setSource] = useState<Source>('fair')
  const [country, setCountry] = useState('')
  const [website, setWebsite] = useState('')
  const [notes, setNotes] = useState('')

  function reset() {
    setCompanyName('')
    setSource('fair')
    setCountry('')
    setWebsite('')
    setNotes('')
    setFailure(null)
  }

  function submit() {
    const name = companyName.trim()
    if (name === '') return
    setFailure(null)

    startTransition(async () => {
      try {
        // Empty optionals are OMITTED rather than sent as ''. `leadPayload` types them as
        // optional strings, so '' would pass validation and store a blank the duplicate
        // check would then try to normalise — a stored empty domain is not the same as no
        // domain, and only one of them is true.
        await addLead({
          companyName: name,
          source,
          ...(country.trim() ? { country: country.trim() } : {}),
          ...(website.trim() ? { website: website.trim() } : {}),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        })
        setOpen(false)
        reset()
        setToast(t('ui.buyers.lead_created', { name }))
        setTimeout(() => setToast(null), 5200)
        router.refresh()
      } catch (error) {
        setFailure(actionErrorMessage(error, t('ui.buyers.lead_failed'), locale))
      }
    })
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t('ui.buyers.new_lead')}</Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          reset()
        }}
        title={t('ui.buyers.new_lead_title')}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p
            style={{
              margin: 0,
              font: '400 13px/1.5 var(--fx-font-sans)',
              color: 'var(--fx-text-secondary)',
            }}
          >
            {t('ui.buyers.new_lead_body')}
          </p>

          {failure ? <InlineAlert tone="danger">{failure}</InlineAlert> : null}

          <TextInput
            label={t('ui.buyers.lead_company')}
            hint={t('ui.buyers.lead_company_hint')}
            required
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />

          <Select
            label={t('ui.buyers.lead_source')}
            required
            value={source}
            onChange={(e) => setSource(e.target.value as Source)}
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`ui.buyers.source_${s}`)}
              </option>
            ))}
          </Select>

          <TextInput
            label={t('ui.buyers.lead_country')}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          />

          <TextInput
            label={t('ui.buyers.lead_website')}
            hint={t('ui.buyers.lead_website_hint')}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />

          <TextArea
            label={t('ui.buyers.lead_notes')}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={submit} disabled={pending || companyName.trim() === ''}>
              {t('ui.buyers.create_lead')}
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
