import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingCustomerEntity } from '../entities/billing-customer.entity';
import { BillingInvoiceEntity } from '../entities/billing-invoice.entity';
import { BillingSettlementEntity } from '../entities/billing-settlement.entity';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(BillingCustomerEntity)
    private readonly customerRepo: Repository<BillingCustomerEntity>,
    @InjectRepository(BillingInvoiceEntity)
    private readonly invoiceRepo: Repository<BillingInvoiceEntity>,
    @InjectRepository(BillingSettlementEntity)
    private readonly settlementRepo: Repository<BillingSettlementEntity>,
  ) {}

  async getStats(sessionId: string): Promise<Record<string, any>> {
    const customers = await this.customerRepo.find({ where: { sessionId } });
    const invoices = await this.invoiceRepo.find({ where: { sessionId } });
    const active = customers.filter((c) => c.status === 'active').length;
    const unpaid = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
    const paid = invoices.filter((i) => i.status === 'paid');
    const totalInvoice = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
    const paidAmount = paid.reduce((s, i) => s + Number(i.amount || 0), 0);
    return {
      totalCustomers: customers.length,
      activeCustomers: active,
      suspended: customers.filter((c) => c.status === 'suspended').length,
      totalInvoices: invoices.length,
      unpaidInvoices: unpaid.length,
      paidInvoices: paid.length,
      totalInvoice,
      paidAmount,
      outstanding: totalInvoice - paidAmount,
    };
  }

  async loadCustomers(sessionId: string): Promise<BillingCustomerEntity[]> {
    return this.customerRepo.find({ where: { sessionId }, order: { name: 'ASC' } });
  }

  /** Return unique tenant/session ids which have billing customers. */
  async listReminderSessions(): Promise<string[]> {
    const rows = await this.customerRepo
      .createQueryBuilder('customer')
      .select('customer.sessionId', 'sessionId')
      .where('customer.sessionId IS NOT NULL')
      .andWhere("customer.sessionId <> ''")
      .distinct(true)
      .getRawMany<{ sessionId: string }>();
    return rows.map((row) => String(row.sessionId || '').trim()).filter(Boolean);
  }

  async getCustomer(id: string): Promise<BillingCustomerEntity | null> {
    return this.customerRepo.findOne({ where: { id } });
  }

  async saveCustomer(data: Partial<BillingCustomerEntity>): Promise<BillingCustomerEntity> {
    if (data.id) {
      const existing = await this.customerRepo.findOne({ where: { id: data.id } });
      if (!existing) throw new NotFoundException('Customer not found');
      Object.assign(existing, data);
      return this.customerRepo.save(existing);
    }
    return this.customerRepo.save(this.customerRepo.create(data as BillingCustomerEntity));
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await this.customerRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  async loadInvoices(sessionId: string, customerId?: string): Promise<BillingInvoiceEntity[]> {
    return this.invoiceRepo.find({
      where: customerId ? { sessionId, customerId } : { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInvoice(id: string): Promise<BillingInvoiceEntity | null> {
    return this.invoiceRepo.findOne({ where: { id } });
  }

  /** Calculate the next billing date, preserving the monolith's billDate rule. */
  calcDueDate(billDate: number): string {
    const now = new Date();
    const day = Math.min(Math.max(Number(billDate) || 1, 1), 28);
    const due = new Date(now.getFullYear(), now.getMonth(), day);
    if (due <= now) due.setMonth(due.getMonth() + 1);
    return due.toISOString().slice(0, 10);
  }

  async createInvoice(
    customer: BillingCustomerEntity,
    period?: string,
    dueDate?: string,
  ): Promise<BillingInvoiceEntity> {
    const now = new Date();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const p = period || `${months[now.getMonth()]} ${now.getFullYear()}`;
    const entity = this.invoiceRepo.create({
      sessionId: customer.sessionId,
      customerId: customer.id,
      customerName: customer.name,
      type: customer.type || 'hotspot',
      mikrotikUser: customer.mikrotikUser || '',
      profile: customer.profile || '',
      period: p,
      amount: Number(customer.price || 0),
      status: 'unpaid',
      dueDate: dueDate || this.calcDueDate(customer.billDate),
      reminderSent: [],
    });
    return this.invoiceRepo.save(entity);
  }

  async generateMonthlyInvoices(sessionId: string): Promise<{ success: boolean; count: number }> {
    const customers = (await this.loadCustomers(sessionId)).filter((c) => c.status === 'active');
    const now = new Date();
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const period = `${months[now.getMonth()]} ${now.getFullYear()}`;
    let count = 0;
    for (const customer of customers) {
      const exists = await this.invoiceRepo.findOne({
        where: { sessionId, customerId: customer.id, period },
      });
      if (exists) continue;
      await this.createInvoice(customer, period);
      count++;
    }
    return { success: true, count };
  }

  async payInvoice(id: string, paidBy: string, note?: string): Promise<BillingInvoiceEntity | null> {
    const inv = await this.getInvoice(id);
    if (!inv || inv.status === 'paid') return null;
    inv.status = 'paid';
    inv.paidAt = new Date().toISOString();
    inv.paidBy = paidBy || 'Admin';
    if (note !== undefined) inv.note = note;
    const saved = await this.invoiceRepo.save(inv);
    if (paidBy) await this.trackCollectorCash(saved, paidBy);
    return saved;
  }

  async trackCollectorCash(inv: BillingInvoiceEntity, collectorName: string): Promise<void> {
    const collectors = await this.customerRepo.find({
      where: { sessionId: inv.sessionId, name: collectorName },
    });
    for (const collector of collectors) {
      collector.unsettledCash = Number(collector.unsettledCash || 0) + Number(inv.amount || 0);
      await this.customerRepo.save(collector);
    }
  }

  getDaysUntilDue(dueDate?: string): number {
    if (!dueDate) return 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const due = new Date(`${dueDate}T00:00:00`);
    return Math.round((due.getTime() - now.getTime()) / 86400000);
  }

  async getOverdueCustomers(
    sessionId: string,
  ): Promise<{ customer: BillingCustomerEntity; invoice: BillingInvoiceEntity }[]> {
    const customers = await this.loadCustomers(sessionId);
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const invoices = await this.invoiceRepo.find({ where: { sessionId, status: 'unpaid' } });
    const result: { customer: BillingCustomerEntity; invoice: BillingInvoiceEntity }[] = [];

    for (const invoice of invoices) {
      const customer = customerMap.get(invoice.customerId);
      if (!customer || customer.autoDisable === false || !invoice.dueDate) continue;
      const daysLate = Math.max(0, -this.getDaysUntilDue(invoice.dueDate));
      if (daysLate < Number(customer.graceDays ?? 3)) continue;
      invoice.status = 'overdue';
      await this.invoiceRepo.save(invoice);
      result.push({ customer, invoice });
    }
    return result;
  }

  async flagOverdueInvoices(
    sessionId: string,
  ): Promise<{ count: number; customers: BillingCustomerEntity[] }> {
    const overdue = await this.getOverdueCustomers(sessionId);
    const seen = new Set<string>();
    const customers: BillingCustomerEntity[] = [];
    for (const { invoice, customer } of overdue) {
      if (!seen.has(customer.id)) {
        seen.add(customer.id);
        customers.push(customer);
      }
      if (invoice.status !== 'overdue') {
        await this.invoiceRepo.update({ id: invoice.id }, { status: 'overdue' });
      }
    }
    return { count: overdue.length, customers };
  }

  /** Find unpaid invoices whose configured reminder day has arrived. */
  async getRemindableInvoices(
    sessionId: string,
  ): Promise<{ customer: BillingCustomerEntity; invoice: BillingInvoiceEntity; daysLeft: number }[]> {
    const customers = await this.loadCustomers(sessionId);
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    const invoices = await this.invoiceRepo.find({ where: { sessionId, status: 'unpaid' } });
    const today = new Date().toISOString().slice(0, 10);
    const result: { customer: BillingCustomerEntity; invoice: BillingInvoiceEntity; daysLeft: number }[] = [];

    for (const invoice of invoices) {
      const customer = customerMap.get(invoice.customerId);
      if (!customer?.telegramId || !invoice.dueDate) continue;
      const reminderDays = Array.isArray(customer.reminderDays) && customer.reminderDays.length
        ? customer.reminderDays
        : [7, 3, 1];
      const daysLeft = this.getDaysUntilDue(invoice.dueDate);
      if (!reminderDays.includes(daysLeft)) continue;
      const sentToday = (invoice.reminderSent || []).some((sent) => String(sent).startsWith(today));
      if (!sentToday) result.push({ customer, invoice, daysLeft });
    }
    return result;
  }

  async markReminderSent(id: string): Promise<void> {
    const invoice = await this.getInvoice(id);
    if (!invoice) return;
    const today = new Date().toISOString().slice(0, 10);
    const sent = Array.isArray(invoice.reminderSent) ? invoice.reminderSent : [];
    if (sent.some((value) => String(value).startsWith(today))) return;
    invoice.reminderSent = [...sent, new Date().toISOString()];
    await this.invoiceRepo.save(invoice);
  }

  async loadSettlements(sessionId: string): Promise<BillingSettlementEntity[]> {
    return this.settlementRepo.find({ where: { sessionId }, order: { createdAt: 'DESC' } });
  }

  async submitSettlement(
    sessionId: string,
    collectorId: string,
    collectorName: string,
    amount: number,
  ): Promise<BillingSettlementEntity> {
    const normalizedAmount = Number(amount) || 0;
    const entity = this.settlementRepo.create({
      sessionId,
      collectorId: collectorId || '',
      collectorName: collectorName || '',
      amount: normalizedAmount,
      status: 'pending',
    });
    return this.settlementRepo.save(entity);
  }

  async verifySettlement(id: string): Promise<boolean> {
    const settlement = await this.settlementRepo.findOne({ where: { id } });
    if (!settlement) return false;
    if (settlement.status === 'verified') return true;

    settlement.status = 'verified';
    settlement.verifiedAt = new Date().toISOString();
    await this.settlementRepo.save(settlement);

    let collector = settlement.collectorId
      ? await this.customerRepo.findOne({ where: { id: settlement.collectorId } })
      : null;
    if (!collector && settlement.collectorName) {
      collector = (await this.customerRepo.find({
        where: { sessionId: settlement.sessionId, name: settlement.collectorName },
      }))[0] || null;
    }
    if (collector) {
      collector.unsettledCash = Math.max(
        0,
        Number(collector.unsettledCash || 0) - Number(settlement.amount || 0),
      );
      await this.customerRepo.save(collector);
    }
    return true;
  }

  async getUnsettledAmount(collectorId: string): Promise<number> {
    const invoices = await this.invoiceRepo.find({ where: { paidBy: collectorId, status: 'paid' } });
    const settlements = await this.settlementRepo.find({ where: { collectorId, status: 'verified' } });
    return invoices.reduce((sum, i) => sum + Number(i.amount || 0), 0)
      - settlements.reduce((sum, s) => sum + Number(s.amount || 0), 0);
  }
}
