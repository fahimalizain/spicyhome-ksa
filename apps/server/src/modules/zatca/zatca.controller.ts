import {
  Controller,
  Post,
  Get,
  Put,
  Param,
  Body,
  Query,
  ParseIntPipe,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ZatcaInvoiceService } from './zatca-invoice.service';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaReportingService } from './zatca-reporting.service';
import { PrintersService } from '../printers/printers.service';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { ZatcaConfigDto } from './dto/zatca-config.dto';

@ApiTags('zatca')
@ApiBearerAuth()
@Controller('zatca')
export class ZatcaController {
  constructor(
    private invoiceService: ZatcaInvoiceService,
    private onboardingService: ZatcaOnboardingService,
    private reportingService: ZatcaReportingService,
    private printersService: PrintersService,
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
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('offset', new ParseIntPipe({ optional: true })) offset?: number,
  ) {
    return this.invoiceService.listInvoices(limit ?? 50, offset ?? 0);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail including XML' })
  async getInvoice(@Param('id') id: string) {
    const inv = this.invoiceService.getById(Number(id));
    if (!inv) throw new NotFoundException('Invoice not found');
    return inv;
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  @Get('config')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Get ZATCA seller configuration' })
  @ApiOkResponse({ description: 'ZATCA seller configuration', type: ZatcaConfigDto })
  getConfig(): ZatcaConfigDto {
    return {
      sellerName: this.printersService.getSetting('seller_name', ''),
      vatNumber: this.printersService.getSetting('vat_number', ''),
      crNumber: this.printersService.getSetting('cr_number', ''),
      street: this.printersService.getSetting('seller_street', ''),
      building: this.printersService.getSetting('seller_building', ''),
      city: this.printersService.getSetting('seller_city', ''),
      postalCode: this.printersService.getSetting('seller_postal', ''),
      country: this.printersService.getSetting('seller_country', 'SA'),
      orgUnit: this.printersService.getSetting('zatca_org_unit', ''),
      apiBaseUrl: this.printersService.getSetting(
        'zatca_api_base_url',
        'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
      ),
    };
  }

  @Put('config')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Update ZATCA seller configuration' })
  @ApiOkResponse({ description: 'Updated configuration', type: ZatcaConfigDto })
  updateConfig(@Body() dto: ZatcaConfigDto): ZatcaConfigDto {
    this.printersService.setSetting('seller_name', dto.sellerName);
    this.printersService.setSetting('vat_number', dto.vatNumber);
    this.printersService.setSetting('cr_number', dto.crNumber);
    this.printersService.setSetting('seller_street', dto.street);
    this.printersService.setSetting('seller_building', dto.building);
    this.printersService.setSetting('seller_city', dto.city);
    this.printersService.setSetting('seller_postal', dto.postalCode);
    this.printersService.setSetting('seller_country', dto.country);
    this.printersService.setSetting('zatca_org_unit', dto.orgUnit);

    if (dto.apiBaseUrl !== undefined) {
      this.printersService.setSetting('zatca_api_base_url', dto.apiBaseUrl);
    }

    return this.getConfig();
  }

  // ── Reporting ───────────────────────────────────────────────────────────────

  @Post('reporting/retry')
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Retry reporting for all pending or a specific invoice' })
  async retryReporting(@Body('invoiceId') invoiceId?: number) {
    return this.reportingService.retryInvoice(invoiceId);
  }
}
