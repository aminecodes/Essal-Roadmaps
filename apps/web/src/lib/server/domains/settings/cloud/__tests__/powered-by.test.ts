import { afterEach, describe, expect, it, vi } from 'vitest'
import { DISABLED_CLOUD_CONFIG, type CloudConfig } from '../cloud.types'
import { isEntitled } from '../entitlements'
import { shouldShowPoweredBy } from '../powered-by'

function cloudOn(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    ...DISABLED_CLOUD_CONFIG,
    enabled: true,
    plan: 'pro',
    ...overrides,
  }
}

describe('shouldShowPoweredBy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('shows by default on a self-hosted install, even though isEntitled(hideBranding) is true', () => {
    vi.stubEnv('QUACKBACK_HIDE_POWERED_BY', undefined)
    expect(isEntitled(DISABLED_CLOUD_CONFIG, 'hideBranding')).toBe(true)
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(true)
  })

  it('hides on self-hosted installs when the operator enables the persistent override', () => {
    vi.stubEnv('QUACKBACK_HIDE_POWERED_BY', 'true')
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(false)
  })

  it('shows when the self-hosted override is explicitly disabled', () => {
    vi.stubEnv('QUACKBACK_HIDE_POWERED_BY', 'false')
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(true)
  })

  it('does not change the cloud entitlement rule when the self-hosted override is set', () => {
    vi.stubEnv('QUACKBACK_HIDE_POWERED_BY', 'true')
    expect(shouldShowPoweredBy(cloudOn({ entitlements: {} }))).toBe(true)
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: true } }))).toBe(false)
  })

  it('is the same rule for portal, widget, and branded emails', () => {
    expect(shouldShowPoweredBy(DISABLED_CLOUD_CONFIG)).toBe(true)
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: true } }))).toBe(false)
  })

  it('shows on cloud until the add-on is purchased', () => {
    expect(shouldShowPoweredBy(cloudOn({ entitlements: {} }))).toBe(true)
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: false } }))).toBe(true)
  })

  it('hides on cloud only when the overlay is purchased', () => {
    expect(shouldShowPoweredBy(cloudOn({ entitlements: { hideBranding: true } }))).toBe(false)
  })
})
