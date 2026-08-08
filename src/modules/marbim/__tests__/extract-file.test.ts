/**
 * File-native extraction — the offline half (plan: file-input intake).
 *
 * The network call is exercised nowhere in this repo, same policy as by-role-provider's
 * header. What IS testable is everything that decides what the vendor gets and who is
 * allowed to get there: how a request with a file becomes content parts, which mime types
 * are refused, and that the providers with no eyes — Gemini's text path and the mock —
 * refuse a file rather than extracting from the empty string next to it.
 */
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { mockProvider } from '../mock-provider'
import { MODEL_READABLE_MIME, ProviderError, type ExtractRequest } from '../provider'
import { geminiExtractor } from '../providers/gemini'
import { extractUserContent } from '../providers/openai'

const schema = z.object({ number: z.string() })

const request = (over: Partial<ExtractRequest<{ number: string }>>): ExtractRequest<{ number: string }> => ({
  role: 'extract',
  schema,
  input: '',
  instruction: 'Extract a uds record for the commercial module.',
  ...over,
})

const pdf = { base64: 'JVBERi0=', mimeType: 'application/pdf', filename: 'UD-131.pdf' }
const jpg = { base64: '/9j/4A==', mimeType: 'image/jpeg', filename: 'UD-131.scan.jpg' }

describe('extractUserContent', () => {
  it('stays a plain string when there is no file — the wire shape existing extractions use', () => {
    const content = extractUserContent(request({ input: 'UD Number: UD-131' }))
    expect(typeof content).toBe('string')
    expect(content).toContain('UD Number: UD-131')
  })

  it('sends a PDF as a file part with a data URI', () => {
    const content = extractUserContent(request({ file: pdf }))
    expect(Array.isArray(content)).toBe(true)
    const parts = content as unknown as Array<Record<string, unknown>>
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[1]).toMatchObject({
      type: 'file',
      file: { filename: 'UD-131.pdf', file_data: 'data:application/pdf;base64,JVBERi0=' },
    })
  })

  it('sends an image as an image part', () => {
    const content = extractUserContent(request({ file: jpg }))
    const parts = content as unknown as Array<Record<string, unknown>>
    expect(parts[1]).toMatchObject({
      type: 'image_url',
      image_url: { url: 'data:image/jpeg;base64,/9j/4A==' },
    })
  })

  it('keeps pasted text alongside the file, fenced — a human transcription is worth showing', () => {
    const content = extractUserContent(request({ input: 'UD Number: UD-131', file: pdf }))
    const parts = content as Array<{ type: string; text?: string }>
    expect(parts[0]?.text).toContain('UD Number: UD-131')
  })

  it('refuses a type the model cannot read, naming the readable ones', () => {
    expect(() =>
      extractUserContent(
        request({ file: { base64: 'AA==', mimeType: 'image/heic', filename: 'scan.heic' } }),
      ),
    ).toThrowError(/cannot read image\/heic/)
  })

  it('agrees with MODEL_READABLE_MIME — every listed type builds a part', () => {
    for (const mimeType of MODEL_READABLE_MIME) {
      const content = extractUserContent(
        request({ file: { base64: 'AA==', mimeType, filename: `doc` } }),
      )
      expect(Array.isArray(content)).toBe(true)
    }
  })
})

describe('providers without eyes refuse files', () => {
  it('mock: a file with no text is a refusal, not an empty draft', async () => {
    await expect(mockProvider.extract(request({ file: pdf }))).rejects.toThrowError(
      /cannot read files/,
    )
  })

  it('mock: pasted text still extracts when a file rides along as provenance', async () => {
    const result = await mockProvider.extract(request({ input: 'number: UD-131', file: pdf }))
    expect(result.value.number).toBe('UD-131')
  })

  it('gemini: the text-only path refuses a file before any network call', async () => {
    const extractor = geminiExtractor({ apiKey: 'fake', model: 'gemini-2.5-flash' })
    await expect(extractor.extract(request({ file: pdf }))).rejects.toThrowError(ProviderError)
    await expect(extractor.extract(request({ file: pdf }))).rejects.toThrowError(/text only/)
  })
})
