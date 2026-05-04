/**
 * Taqnyat SMS provider — REST API constants.
 *
 * Endpoint reference: the Saudi Taqnyat REST API at api.taqnyat.sa, used for
 * OTP delivery. The bearer token comes from env.SMS_PROVIDER_API_KEY and the
 * approved sender ID from env.SMS_PROVIDER_SENDER_ID.
 *
 * Phones are passed WITHOUT the leading '+' (e.g. 9665XXXXXXXX) — see
 * TaqnyatSmsProvider.send() for the strip step.
 */
export const TAQNYAT_API_BASE_URL = 'https://api.taqnyat.sa';
export const TAQNYAT_SEND_MESSAGE_PATH = '/v1/messages';

/**
 * Cap a single SMS request at 10 seconds. Saudi telco delivery is typically
 * well under 2s; anything beyond 10s is an upstream stall and we'd rather
 * surface a clean error to the customer than block the OTP request handler.
 */
export const TAQNYAT_REQUEST_TIMEOUT_MS = 10_000;
