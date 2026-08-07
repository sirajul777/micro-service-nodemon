import { Injectable, Logger } from '@nestjs/common';

/**
 * Customer/admin notification for the QRIS voucher flow.
 *
 * In the microservice the WhatsApp/Telegram delivery itself is owned by
 * bot-py-service (Redis consumer on `payment.order.settled`). This notifier is
 * the *local* side: it builds the wa.me deep-link fallback and logs it, so the
 * critical voucher credentials are never lost even if bot-py is down. The
 * authoritative delivery is via the outbox → Redis event written by
 * VoucherOrderService.settleOrder().
 */
@Injectable()
export class PayhookNotifierService {
  private readonly logger = new Logger(PayhookNotifierService.name);

  private normalizePhone(phone: string): string {
    let p = phone.replace(/[^0-9]/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return p;
  }

  private buildMessage(opts: {
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): string {
    const { voucherName, username, password, profile, validity } = opts;
    return (
      `🎟️ *${voucherName}*\n\n` +
      `👤 Username: ${username}\n` +
      `🔑 Password: ${password}\n` +
      `📦 Profile: ${profile}` +
      `${validity ? `\n⏰ Masa aktif: ${validity}` : ''}\n\n` +
      `Terima kasih telah berbelanja!`
    );
  }

  /**
   * Log the voucher + a wa.me deep link. The real WA/TG delivery is done by
   * bot-py-service, which consumes `payment.order.settled` (see outbox).
   */
  async sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void> {
    const { phone } = opts;
    const message = this.buildMessage(opts);
    const waLink = phone
      ? `https://wa.me/${this.normalizePhone(phone)}?text=${encodeURIComponent(message)}`
      : null;
    if (!phone) {
      this.logger.log(
        `[VOUCHER] ${opts.voucherName} → ${opts.username}/${opts.password} (no phone provided)`,
      );
      return;
    }
    this.logger.log(
      `[VOUCHER] ${opts.voucherName} → ${opts.username}/${opts.password} | WA: ${waLink}`,
    );
  }

  /** Admin notifications are sent via the `payment.order.paid`/`payment.failed` Redis events consumed by bot-py. */
  async notifyAdmin(opts: { title: string; message: string }): Promise<void> {
    this.logger.log(`[ADMIN] ${opts.title}: ${opts.message}`);
  }
}
