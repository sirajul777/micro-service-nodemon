import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingCustomerEntity } from '../entities/billing-customer.entity';
import { BillingInvoiceEntity } from '../entities/billing-invoice.entity';
import { BillingSettlementEntity } from '../entities/billing-settlement.entity';

/**
 * Billing service (db_payment). Manages customers, monthly invoices, and
 * collector cash settlements per router session.
 *
 * This is the microservice-native implementation of the monolith's billing
 * logic. Router-aware actions (run-overdue, re-enable, import-users) require
 * a MikroTik connection which lives in the Go service; those endpoints are
 * exposed by the controller but return a clear error here if the router
 * credentials cannot be resolved (the frontend degrades gracefully).
 */
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

  // ── Stats ────────────────────────────────────────────────────────

  async getStats(sessionId: string): Promise<Record<string, any>> {
    const customers = await this.customerRepo.find({ where: { sessionId } });
    const invoices = await this.invoiceRepo.find({ where: { sessionId } });
    const active = customers.filter((c) => c.status === 'active').length;
    const unpaid = invoices.filter((i) => i.status === 'unpaid').length;
    const paid = invoices.filter((i) => i.status === 'paid').length;
    const totalInvoice = invoices.reduce((s, i) => s + Number(i.amount || 0), 0);
    const paidAmount = invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + Number(i.amount || 0), 0);
    return {
      totalCustomers: customers.length,
      activeCustomers: active,
      suspended: customers.length - active,
      totalInvoices: invoices.length,
      unpaidInvoices: unpaid,
      paidInvoices: paid,
      totalInvoice,
      paidAmount,
      outstanding: totalInvoice - paidAmount,
    };
  }

  // ── Customers ────────────────────────────────────────────────────

  async loadCustomers(sessionId: string): Promise<BillingCustomerEntity[]> {
    return this.customerRepo.find({
      where: { sessionId },
      order: { name: 'ASC' },
    });
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
    const entity = this.customerRepo.create(data as BillingCustomerEntity);
    return this.customerRepo.save(entity);
  }

  async deleteCustomer(id: string): Promise<boolean> {
    const result = await this.customerRepo.delete({ id });
    return (result.affected || 0) > 0;
  }

  // ── Invoices ─────────────────────────────────────────────────────

  async loadInvoices(
    sessionId: string,
    customerId?: string,
  ): Promise<BillingInvoiceEntity[]> {
    return this.invoiceRepo.find({
      where: customerId ? { sessionId, customerId } : { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async getInvoice(id: string): Promise<BillingInvoiceEntity | null> {
    return this.invoiceRepo.findOne({ where: { id } });
  }

  async createInvoice(
    customer: BillingCustomerEntity,
    period?: string,
    dueDate?: string,
  ): Promise<BillingInvoiceEntity> {
    const now = new Date();
    const p =
      period ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const entity = this.invoiceRepo.create({
      sessionId: customer.sessionId,
      customerId: customer.id,
      customerName: customer.name,
      period: p,
      amount: customer.price || 0,
      status: 'unpaid',
      dueDate: dueDate || now.toISOString().slice(0, 10),
    });
    return this.invoiceRepo.save(entity);
  }

  async generateMonthlyInvoices(sessionId: string): Promise<{
    success: boolean;
    count: number;
  }> {
    const customers = await this.loadCustomers(sessionId);
    let count = 0;
    for (const c of customers) {
      if (c.status !== 'active') continue;
      const now = new Date();
      const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const exists = await this.invoiceRepo.findOne({
        where: { sessionId, customerId: c.id, period },
      });
      if (exists) continue;
      await this.createInvoice(c, period);
      count++;
    }
    this.logger.log(`[billing] generated ${count} invoices for session ${sessionId}`);
    return { success: true, count };
  }

  async payInvoice(
    id: string,
    paidBy: string,
    note?: string,
  ): Promise<BillingInvoiceEntity | null> {
    const inv = await this.getInvoice(id);
    if (!inv) return null;
    inv.status = 'paid';
    inv.paidAt = new Date().toISOString();
    inv.paidBy = paidBy || 'Admin';
    inv.note = note || inv.note;
    await this.invoiceRepo.save(inv);

    // Track collector cash for collection tracking.
    if (paidBy) await this.trackCollectorCash(inv, paidBy);
    return inv;
  }

  async trackCollectorCash(inv: BillingInvoiceEntity, collectorName: string): Promise<void> {
    const customer = await this.getCustomer(inv.customerId);
    if (!customer) return;
    // Find the collector by matching the customer name (the collector is
    // itself a customer in the monolith's model).
    const collector = customer.name === collectorName ? customer : null;
    if (collector) return; // self-payment, no tracking needed
    // Record the cash on the collector (matched by name).
    const collectors = await this.customerRepo.find({
      where: { sessionId: inv.sessionId, name: collectorName },
    });
    for (const c of collectors) {
      c.unsettledCash = (c.unsettledCash || 0) + Number(inv.amount || 0);
      await this.customerRepo.save(c);
    }
  }

  async getOverdueCustomers(sessionId: string): Promise<
    { customer: BillingCustomerEntity; invoice: BillingInvoiceEntity }[]
  > {
    const today = new Date().toISOString().slice(0, 10);
    const overdue: { customer: BillingCustomerEntity; invoice: BillingInvoiceEntity }[] = [];
    const invoices = await this.invoiceRepo.find({
      where: { sessionId, status: 'unpaid' },
    });
    for (const inv of invoices) {
      if (inv.dueDate && inv.dueDate < today) {
        const customer = await this.getCustomer(inv.customerId);
        if (customer) overdue.push({ customer, invoice: inv });
      }
    }
    return overdue;
  }

  getDaysUntilDue(dueDate?: string): number {
    if (!dueDate) return 0;
    const due = new Date(dueDate).getTime();
    const now = new Date().getTime();
    return Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  }

  async markReminderSent(id: string): Promise<void> {
    await this.invoiceRepo.update({ id }, { reminderSent: true });
  }

  // ── Settlements ──────────────────────────────────────────────────

  async loadSettlements(sessionId: string): Promise<BillingSettlementEntity[]> {
    return this.settlementRepo.find({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });
  }

  async submitSettlement(
    sessionId: string,
    collectorId: string,
    collectorName: string,
    amount: number,
  ): Promise<BillingSettlementEntity> {
    const entity = this.settlementRepo.create({
      sessionId,
      collectorId: collectorId || '',
      collectorName: collectorName || '',
      amount: Number(amount) || 0,
      status: 'pending',
    });
    const saved = await this.settlementRepo.save(entity);
    // Clear the collector's unsettled cash once the settlement is submitted.
    const collectors = await this.customerRepo.find({
      where: { sessionId, name: collectorName },
    });
    for (const c of collectors) {
      c.unsettledCash = 0;
      await this.customerRepo.save(c);
    }
    return saved;
  }

async verifySettlement(id: string): Promise<boolean> {
    const result = await this.settlementRepo.update({ id }, { status: 'verified' });
    return (result.affected || 0) > 0;
  }

  /** Flag all unpaid, past-due invoices as 'overdue'. Returns the count. */
  /**
   * Flag unpaid-and-past-due invoices as 'overdue'. Returns the affected
   * customers too (deduplicated) so the caller (BillingController) can
   * actually suspend their router access — this service layer intentionally
   * doesn't touch the router itself; it has no MikrotikGrpcClient, and
   * mixing router I/O into invoice bookkeeping would make this method much
   * harder to test/reason about.
   */
  async flagOverdueInvoices(
    sessionId: string,
  ): Promise<{ count: number; customers: BillingCustomerEntity[] }> {
    const overdue = await this.getOverdueCustomers(sessionId);
    const seen = new Set<string>();
    const customers: BillingCustomerEntity[] = [];
    for (const { invoice, customer } of overdue) {
      await this.invoiceRepo.update({ id: invoice.id }, { status: 'overdue' });
      if (!seen.has(customer.id)) {
        seen.add(customer.id);
        customers.push(customer);
      }
    }
    return { count: overdue.length, customers };
  }
}
