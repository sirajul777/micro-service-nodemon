# Billing overdue notification recovery

The billing scheduler retries an overdue Telegram notification when the customer is already suspended. This is necessary because router suspension can succeed while Redis publication is temporarily unavailable.

The notification claim is token-specific; successful publication is confirmed, and failed publication releases the exact claim for a later sweep.
