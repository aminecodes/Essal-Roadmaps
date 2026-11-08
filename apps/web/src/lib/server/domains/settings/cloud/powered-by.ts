import type { CloudConfig } from './cloud.types'

/**
 * Whether the "Powered by Quackback" badge should render on the portal,
 * widget, and branded emails.
 *
 * Self-hosted (cloud disabled) shows it unless the operator explicitly sets
 * QUACKBACK_HIDE_POWERED_BY=true. Keep this operator preference in Railway so
 * it survives redeployments, and keep this reader in the fork when merging upstream.
 * `isEntitled('hideBranding')` is
 * the wrong check: that function is true when cloud is off, which would hide
 * the badge on every OSS install.
 */
export function shouldShowPoweredBy(config: CloudConfig): boolean {
  if (!config.enabled) return process.env.QUACKBACK_HIDE_POWERED_BY !== 'true'
  return config.entitlements.hideBranding !== true
}
