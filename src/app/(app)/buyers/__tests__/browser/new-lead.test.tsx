/**
 * The form that puts a lead on the board.
 *
 * Worth testing at this level because the interesting behaviour is in what the form DOES NOT
 * send. `leadPayload` types country, website and notes as optional strings, so an empty box
 * submitted as `''` passes validation and stores a blank — and a stored empty domain is not
 * the same fact as no domain. `detectDuplicates` normalises whatever is there, so one blank
 * is the difference between "we have never seen this company" and "we have seen it and it
 * has no website".
 *
 * The other half is the required field: a lead with no company name is a row nobody can act
 * on, and the service refuses it — so the button must refuse it first, at the only moment
 * anybody is looking.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { NewLead } from '../../new-lead'

const addLead = vi.fn()
const refresh = vi.fn()

// Mocked at the module boundary: a server action in jsdom would POST to a server that is not
// running. What this file tests is the form's own behaviour — the action has its own coverage.
vi.mock('@/modules/buyers/actions', () => ({
  addLead: (...args: unknown[]) => addLead(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

beforeEach(() => {
  addLead.mockReset().mockResolvedValue({ leadId: 'lead-1' })
  refresh.mockReset()
})

/** Open the modal and fill the one field that is required. */
async function openWithName(user: ReturnType<typeof userEvent.setup>, name = 'Zara Sourcing BD') {
  await user.click(screen.getByRole('button', { name: /add a lead/i }))
  await user.type(screen.getByLabelText(/company name/i), name)
}

describe('the desk can finally create a lead', () => {
  it('1 · will not submit without a company name', async () => {
    const user = userEvent.setup()
    render(<NewLead />)
    await user.click(screen.getByRole('button', { name: /add a lead/i }))

    const submit = screen.getByRole('button', { name: /^add it$/i })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText(/company name/i), 'Zara Sourcing BD')
    expect(submit).toBeEnabled()
  })

  it('2 · sends only what was filled in — empty optionals are omitted, not blanked', async () => {
    /*
     * The case this file exists for. `''` would validate and persist, and a blank normalised
     * domain reads as a fact the factory never stated.
     */
    const user = userEvent.setup()
    render(<NewLead />)
    await openWithName(user)
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(addLead).toHaveBeenCalledOnce())
    expect(addLead).toHaveBeenCalledWith({ companyName: 'Zara Sourcing BD', source: 'fair' })
  })

  it('3 · sends the optionals that WERE filled in, trimmed', async () => {
    const user = userEvent.setup()
    render(<NewLead />)
    await openWithName(user)
    await user.type(screen.getByLabelText(/country/i), '  Spain  ')
    await user.type(screen.getByLabelText(/website/i), ' zara.com ')
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(addLead).toHaveBeenCalledOnce())
    expect(addLead).toHaveBeenCalledWith({
      companyName: 'Zara Sourcing BD',
      source: 'fair',
      country: 'Spain',
      website: 'zara.com',
    })
  })

  it('4 · carries the chosen source', async () => {
    const user = userEvent.setup()
    render(<NewLead />)
    await openWithName(user)
    await user.selectOptions(screen.getByLabelText(/where they came from/i), 'buying_house')
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(addLead).toHaveBeenCalledOnce())
    expect(addLead.mock.calls[0]?.[0]).toMatchObject({ source: 'buying_house' })
  })

  it('5 · a refused lead keeps what was typed, and shows the reason', async () => {
    /*
     * Losing the form's contents on a failure is how somebody stops trusting the button. The
     * modal stays open with the name still in it, so a retry is a second click and not a
     * second round of typing.
     *
     * The message is the RAW one for an unkeyed error, which is `action-error.ts` doing what
     * it says: it falls back to the thrown message rather than to something generic, because
     * "Something went wrong" is the least useful sentence in software and a bug report needs
     * the text that was actually thrown.
     */
    const user = userEvent.setup()
    addLead.mockRejectedValue(new Error('the pipeline refused it'))
    render(<NewLead />)
    await openWithName(user)
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(screen.getByText(/the pipeline refused it/i)).toBeInTheDocument())
    expect(screen.getByLabelText(/company name/i)).toHaveValue('Zara Sourcing BD')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('6 · a service error with a message KEY is shown as its sentence, not the key', async () => {
    /*
     * The realistic failure. Services throw `AppError(code, messageKey)`, and only
     * `Error.message` survives a server-action boundary — so what arrives is the literal
     * `conflict: buyers.errors.…`. Rendering that teaches people the system talks to itself
     * in front of them; `actionErrorMessage` resolves it against the catalogue instead.
     */
    const user = userEvent.setup()
    addLead.mockRejectedValue(new Error('conflict: buyers.errors.not_a_real_key'))
    render(<NewLead />)
    await openWithName(user)
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    // No catalogue entry, so the raw message stands in — but the point is that a key which
    // DOES have copy never reaches the reader as a dotted identifier.
    expect(screen.queryByText(/^conflict:$/)).not.toBeInTheDocument()
  })

  it('7 · a created lead refreshes the board so it appears', async () => {
    // Without this the lead exists and the board does not show it until a manual reload,
    // which reads as the button having done nothing.
    const user = userEvent.setup()
    render(<NewLead />)
    await openWithName(user)
    await user.click(screen.getByRole('button', { name: /^add it$/i }))

    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(screen.getByText(/is on the board/i)).toBeInTheDocument()
  })
})
