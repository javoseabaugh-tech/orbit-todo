/**
 * Generate the Worker's own signing key.
 *
 * This is not a Google credential — Google never issues it and cannot revoke
 * it. It is a key the Worker makes up so it can sign short assertions about
 * itself, which Google then checks against the public half the Worker
 * publishes. Deleting the Worker's secret and running this again is all it
 * takes to rotate; nothing in Google's console changes, because the public
 * key is fetched from the Worker every time.
 *
 * Usage:
 *   (run by the deploy workflow; see .github/workflows/deploy-telegram-worker.yml)
 *
 * Or run it, copy the one line it prints, and paste that into
 * `npx wrangler secret put OIDC_KEY` when it waits for input.
 */
import { webcrypto } from 'node:crypto'

const { publicKey, privateKey } = await webcrypto.subtle.generateKey(
  {
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },
  true,
  ['sign', 'verify'],
)

const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey('pkcs8', privateKey))
const jwk = await webcrypto.subtle.exportKey('jwk', publicKey)

// A key id so the published key and the assertions signed with it can be
// matched up, and so a rotation can be told from the key it replaced.
const kid = `orbit-telegram-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`

const pem = [
  '-----BEGIN PRIVATE KEY-----',
  ...(Buffer.from(pkcs8).toString('base64').match(/.{1,64}/g) ?? []),
  '-----END PRIVATE KEY-----',
].join('\n')

process.stdout.write(
  JSON.stringify({
    kid,
    privateKey: pem,
    publicJwk: { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', use: 'sig', kid },
  }),
)
