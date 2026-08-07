import { Logger } from '@nestjs/common';

/**
 * Notification abstraction for the QRIS voucher-selling flow.
 *
 * In the monolith this sent WhatsApp (Fonnte/Wablas) and Telegram directly.
 * In the microservice the actual delivery is owned by bot-py-service, so the
 * payment-service publishes cross-service events (payment.order.paid /
 * payment.order.settled) via the outbox → Redis, and this interface documents
 * the notification contract. The default implementation logs a wa.me deep link
 * as a fallback so nothing breaks when bot-py isn't wired up yet.
 */
export interface VoucherNotifier {
  sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void>;

  notifyAdmin(opts: { title: string; message: string }): Promise<void>;
}

/**
 * Default implementation: logs a wa.me deep link. Real channels are wired in
 * via bot-py-service (Redis consumer) — see ARCHITECTURE §3.2.
 */
export class ConsoleVoucherNotifier implements VoucherNotifier {
  private readonly logger = new Logger('VoucherNotifier');

  async sendVoucherToCustomer(opts: {
    phone?: string;
    voucherName: string;
    username: string;
    password: string;
    profile: string;
    validity?: string;
  }): Promise<void> {
    const { phone, voucherName, username, password, profile, validity } = opts;
    const waLink = phone
      ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
          `🎟️ *${voucherName}*\n\n👤 Username: ${username}\n🔑 Password: ${password}\n📦 Profile: ${profile}${validity ? `\n⏰ Masa aktif: ${validity}` : ''}\n\nTerima kasih telah berbelanja!`,
        )}`
      : null;
    this.logger.log(
      `[VOUCHER] ${voucherName} → ${username}/${password}${waLink ? ` | WA: ${waLink}` : ''}`,
    );
  }

  async notifyAdmin(opts: { title: string; message: string }): Promise<void> {
    this.logger.log(`[ADMIN] ${opts.title}: ${opts.message}`);
  }
}
