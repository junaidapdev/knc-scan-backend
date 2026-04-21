// Global Express type augmentation. Picked up automatically via tsconfig's
// `include: src/**/*` glob.
//
// `auth` is populated by the customer JWT middleware (requireAuth) and
// mirrors the customer token payload in a stable, middleware-neutral shape.
// Existing code continues to rely on `req.customer` / `req.admin` —
// `request_id` is a new addition attached by requestLogger for log
// correlation.

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace Express {
  interface Request {
    request_id?: string;
    auth?: {
      customer_id?: string;
    };
  }
}
