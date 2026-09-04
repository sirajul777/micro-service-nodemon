# Billing Invoice Concurrency

Monthly invoice creation is protected by the unique database constraint on `(sessionId, customerId, period)`. The billing service also performs an existence check before insert. The database constraint remains the final concurrency guard when multiple scheduler or manual requests race.
