import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaReportingService } from './zatca-reporting.service';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

@ApiTags('zatca')
@Controller('zatca')
export class ZatcaController {
  constructor(
    private invoiceService: ZatcaInvoiceService,
    private onboardingService: ZatcaOnboardingService,
    private reportingService: ZatcaReportingService,
  ) {}

  // ── Onboarding ──────────────────────────────────────────────────────────────

  @Post('onboard/csr')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Generate keypair and CSR for ZATCA onboarding' })
  async generateCSR(): Promise<{ csr: string; publicKeyPem: string }> {
    return this.onboardingService.generateCSR();
  }

  @Post('onboard/compliance')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Submit CSR with OTP to ZATCA compliance CSID endpoint' })
  async onboardCompliance(
    @Body('otp') otp: string,
  ): Promise<{ success: boolean; requestId: string }> {
    if (!otp) {
      throw new BadRequestException('OTP is required');
    }
    return this.onboardingService.onboardCompliance(otp);
  }

  @Post('onboard/production')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Exchange compliance CSID for production CSID' })
  async onboardProduction(): Promise<{ success: boolean; requestId: string }> {
    return this.onboardingService.onboardProduction();
  }

  @Get('status')
  @ApiOperation({ summary: 'Get ZATCA onboarding and status' })
  async getStatus() {
    return this.onboardingService.getState();
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  @Get('invoices')
  @ApiOperation({ summary: 'List ZATCA invoices' })
  async listInvoices(
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.invoiceService.listInvoices(limit || 50, offset || 0);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail including XML' })
  async getInvoice(@Param('id') id: string) {
    const inv = this.invoiceService.getById(Number(id));
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ── Reporting ───────────────────────────────────────────────────────────────

  @Post('reporting/retry')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Retry reporting for all pending or a specific invoice' })
  async retryReporting(
    @Body('invoiceId') invoiceId?: number,
  ) {
    return this.reportingService.retryInvoice(invoiceId);
  }
}
