/**
 * `rawBody` is set by the platform, not by this plugin:
 * erxes-api-shared/src/utils/start-plugin.ts registers
 *
 *   express.json({ verify: (req, _res, buf) => { req.rawBody = buf } })
 *
 * so every route sees the unparsed bytes. It is declared here because that
 * assignment is untyped upstream, and the Cal.com webhook must hash the raw
 * body — re-serialising req.body would produce a different byte sequence and
 * fail the signature.
 *
 * `subdomain` is attached by the same layer for multi-tenant routing.
 */
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer | string;
      subdomain?: string;
    }
  }
}

export {};
