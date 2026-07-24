import { useState, useEffect } from 'react';
import { client } from '../../api';
import type { ZatcaConfigDto, ZatcaOnboardingState, ZatcaInvoice } from '@spicyhome/client-ts';
import type { ZATCAEnvironment, ZATCAInvoiceDocumentType } from '@spicyhome/shared';

const ZATCA_SANDBOX_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';
const ZATCA_PRODUCTION_URL = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

export function ZatcaPage() {
  // ── Seller Config state ──
  const [config, setConfig] = useState<ZatcaConfigDto>({
    sellerName: '',
    vatNumber: '',
    crNumber: '',
    street: '',
    building: '',
    city: '',
    postalCode: '',
    country: 'SA',
    orgUnit: '',
    apiBaseUrl: '',
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState('');
  const [zatcaEnv, setZatcaEnv] = useState<ZATCAEnvironment>('sandbox');

  // ── Onboarding state ──
  const [onboarding, setOnboarding] = useState<ZatcaOnboardingState | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState('');
  const [csrText, setCsrText] = useState('');
  const [csrPublicKey, setCsrPublicKey] = useState('');
  const [otpValue, setOtpValue] = useState('');
  const [generatingCsr, setGeneratingCsr] = useState(false);
  const [submittingOtp, setSubmittingOtp] = useState(false);
  const [promotingProduction, setPromotingProduction] = useState(false);

  // ── Invoices state ──
  const [invoices, setInvoices] = useState<ZatcaInvoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(true);
  const [invoicesError, setInvoicesError] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<ZatcaInvoice | null>(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);
  const [retryTargetId, setRetryTargetId] = useState<number | null>(null);
  const [retryingAll, setRetryingAll] = useState(false);

  // ── Compliance check state ──
  const [complianceChecking, setComplianceChecking] = useState<number | null>(null);
  const [complianceResults, setComplianceResults] = useState<
    Record<number, { success: boolean; status: number; warnings: string[]; errors: string[] }>
  >({});
  const [complianceTypeChecking, setComplianceTypeChecking] = useState<string | null>(null);
  const [complianceTypeResults, setComplianceTypeResults] = useState<
    Record<string, { success: boolean; status: number; warnings: string[]; errors: string[] }>
  >({});
  const [complianceCheckedAt, setComplianceCheckedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    loadConfig();
    loadOnboarding();
    loadInvoices();
  }, []);

  // ── Config ──────────────────────────────────────────────────────────────────

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError('');
    try {
      const data = await client.zatca.getConfig();
      setConfig(data);
      if (data.environment) {
        setZatcaEnv(data.environment);
      } else if (data.apiBaseUrl?.includes('/e-invoicing/core')) {
        setZatcaEnv('production');
      } else {
        setZatcaEnv('sandbox');
      }
    } catch (e: any) {
      setConfigError(e.message || 'Failed to load config');
    } finally {
      setConfigLoading(false);
    }
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    setConfigError('');
    try {
      const url = zatcaEnv === 'sandbox' ? ZATCA_SANDBOX_URL : ZATCA_PRODUCTION_URL;
      const data = await client.zatca.updateConfig({
        ...config,
        apiBaseUrl: url,
        environment: zatcaEnv,
      });
      setConfig(data);
    } catch (e: any) {
      // Extract validation error message from the server response
      const body = e.message || 'Failed to save config';
      setConfigError(body);
    } finally {
      setConfigSaving(false);
    }
  }

  // ── Onboarding ───────────────────────────────────────────────────────────────

  async function loadOnboarding() {
    setOnboardingLoading(true);
    setOnboardingError('');
    try {
      const data = await client.zatca.getStatus();
      setOnboarding(data);

      // Populate compliance results from persisted DB state
      const typeResults: Record<
        string,
        { success: boolean; status: number; warnings: string[]; errors: string[] }
      > = {};
      const invoiceResults: Record<
        number,
        { success: boolean; status: number; warnings: string[]; errors: string[] }
      > = {};
      const checkedAt: Record<string, number> = {};
      for (const entry of data.complianceResults || []) {
        checkedAt[entry.key] = entry.checkedAt;
        if (entry.key.startsWith('invoice_')) {
          const id = Number(entry.key.substring(8));
          if (!Number.isNaN(id)) {
            invoiceResults[id] = {
              success: entry.success,
              status: entry.status,
              warnings: entry.warnings,
              errors: entry.errors,
            };
          }
        } else {
          typeResults[entry.key] = {
            success: entry.success,
            status: entry.status,
            warnings: entry.warnings,
            errors: entry.errors,
          };
        }
      }
      setComplianceTypeResults(typeResults);
      setComplianceResults(invoiceResults);
      setComplianceCheckedAt(checkedAt);
    } catch (e: any) {
      setOnboardingError(e.message || 'Failed to load status');
    } finally {
      setOnboardingLoading(false);
    }
  }

  async function handleGenerateCsr() {
    setGeneratingCsr(true);
    setOnboardingError('');
    try {
      const data = await client.zatca.generateCsr();
      setCsrText(data.csr);
      setCsrPublicKey(data.publicKeyPem);
      await loadOnboarding();
    } catch (e: any) {
      setOnboardingError(e.message || 'Failed to generate CSR');
    } finally {
      setGeneratingCsr(false);
    }
  }

  async function handleSubmitOtp() {
    if (!otpValue) {
      setOnboardingError('OTP is required');
      return;
    }
    setSubmittingOtp(true);
    setOnboardingError('');
    try {
      await client.zatca.onboardCompliance(otpValue);
      setOtpValue('');
      await loadOnboarding();
    } catch (e: any) {
      setOnboardingError(e.message || 'Failed to submit OTP');
    } finally {
      setSubmittingOtp(false);
    }
  }

  async function handleGoProduction() {
    setPromotingProduction(true);
    setOnboardingError('');
    try {
      await client.zatca.onboardProduction();
      await loadOnboarding();
    } catch (e: any) {
      setOnboardingError(e.message || 'Failed to promote to production');
    } finally {
      setPromotingProduction(false);
    }
  }

  async function handleComplianceCheck(invoiceId: number) {
    setComplianceChecking(invoiceId);
    setOnboardingError('');
    try {
      const result = await client.zatca.runComplianceCheck(invoiceId);
      setComplianceResults((prev) => ({ ...prev, [invoiceId]: result }));
      await loadOnboarding();
    } catch (e: any) {
      setComplianceResults((prev) => ({
        ...prev,
        [invoiceId]: {
          success: false,
          status: 0,
          warnings: [],
          errors: [e.message || 'Compliance check failed'],
        },
      }));
    } finally {
      setComplianceChecking(null);
    }
  }

  async function handleComplianceTypeCheck(type: ZATCAInvoiceDocumentType) {
    setComplianceTypeChecking(type);
    setOnboardingError('');
    try {
      const result = await client.zatca.runComplianceCheck(undefined, type);
      setComplianceTypeResults((prev) => ({ ...prev, [type]: result }));
      await loadOnboarding();
    } catch (e: any) {
      setComplianceTypeResults((prev) => ({
        ...prev,
        [type]: {
          success: false,
          status: 0,
          warnings: [],
          errors: [e.message || 'Compliance check failed'],
        },
      }));
    } finally {
      setComplianceTypeChecking(null);
    }
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────

  async function loadInvoices() {
    setInvoicesLoading(true);
    setInvoicesError('');
    try {
      const data = await client.zatca.listInvoices(50, 0);
      setInvoices(data);
    } catch (e: any) {
      setInvoicesError(e.message || 'Failed to load invoices');
    } finally {
      setInvoicesLoading(false);
    }
  }

  async function viewInvoiceDetail(id: number) {
    setInvoiceDetailLoading(true);
    setSelectedInvoice(null);
    try {
      const data = await client.zatca.getInvoice(id);
      setSelectedInvoice(data);
    } catch (e: any) {
      setInvoicesError(e.message || 'Failed to load invoice detail');
    } finally {
      setInvoiceDetailLoading(false);
    }
  }

  async function handleRetryInvoice(invoiceId?: number) {
    if (invoiceId !== undefined) {
      setRetryTargetId(invoiceId);
    } else {
      setRetryingAll(true);
    }
    setInvoicesError('');
    try {
      await client.zatca.retryReporting(invoiceId);
      await loadInvoices();
    } catch (e: any) {
      setInvoicesError(e.message || 'Failed to retry reporting');
    } finally {
      setRetryTargetId(null);
      setRetryingAll(false);
    }
  }

  function formatDate(ts: number): string {
    return new Date(ts * 1000).toLocaleString();
  }

  function statusBadge(status: string) {
    const colors: Record<string, string> = {
      signed: 'bg-yellow-700 text-yellow-100',
      reported: 'bg-green-700 text-green-100',
      failed: 'bg-red-700 text-red-100',
    };
    const color = colors[status] || 'bg-gray-600 text-gray-300';
    return <span className={'px-1.5 py-0.5 rounded text-xs ' + color}>{status}</span>;
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      <h1 className="text-xl font-bold text-white mb-2">ZATCA Configuration</h1>

      {/* ── Seller Config ── */}
      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">Seller Configuration</h2>
        {configError && (
          <div className="text-red-400 text-xs bg-red-900/30 border border-red-700 rounded px-3 py-2">
            {configError}
          </div>
        )}
        {configLoading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : (
          <form onSubmit={saveConfig} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Seller Name</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.sellerName}
                  onChange={(e) => setConfig((f) => ({ ...f, sellerName: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">VAT Number</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.vatNumber}
                  onChange={(e) => setConfig((f) => ({ ...f, vatNumber: e.target.value }))}
                  placeholder="300123456789003"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">CR Number (10 digits)</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.crNumber}
                  onChange={(e) => setConfig((f) => ({ ...f, crNumber: e.target.value }))}
                  placeholder="1234567890"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Org Unit</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.orgUnit}
                  onChange={(e) => setConfig((f) => ({ ...f, orgUnit: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Street</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.street}
                  onChange={(e) => setConfig((f) => ({ ...f, street: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Building Number</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.building}
                  onChange={(e) => setConfig((f) => ({ ...f, building: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">City</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.city}
                  onChange={(e) => setConfig((f) => ({ ...f, city: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Postal Code (5 digits)</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.postalCode}
                  onChange={(e) => setConfig((f) => ({ ...f, postalCode: e.target.value }))}
                  placeholder="12345"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Country (ISO)</label>
                <input
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                  value={config.country}
                  onChange={(e) => setConfig((f) => ({ ...f, country: e.target.value }))}
                  maxLength={2}
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Environment</label>
                <div className="inline-flex rounded-md overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setZatcaEnv('sandbox')}
                    className={
                      'touch-target px-3 py-2 text-sm rounded-l-md ' +
                      (zatcaEnv === 'sandbox'
                        ? 'bg-brand-600 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
                        : 'bg-gray-700 text-gray-400 hover:text-white')
                    }
                  >
                    Sandbox
                  </button>
                  <button
                    type="button"
                    onClick={() => setZatcaEnv('production')}
                    className={
                      'touch-target px-3 py-2 text-sm rounded-r-md ' +
                      (zatcaEnv === 'production'
                        ? 'bg-brand-600 text-white shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]'
                        : 'bg-gray-700 text-gray-400 hover:text-white')
                    }
                  >
                    Production
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1 truncate">
                  {zatcaEnv === 'sandbox' ? ZATCA_SANDBOX_URL : ZATCA_PRODUCTION_URL}
                </div>
              </div>
            </div>
            <button
              type="submit"
              disabled={configSaving}
              className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-4 py-2 text-sm text-white"
            >
              {configSaving ? 'Saving...' : 'Save Configuration'}
            </button>
          </form>
        )}
      </section>

      {/* ── Onboarding ── */}
      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-300">Onboarding</h2>
        {onboardingError && (
          <div className="text-red-400 text-xs bg-red-900/30 border border-red-700 rounded px-3 py-2">
            {onboardingError}
          </div>
        )}
        {onboardingLoading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : onboarding ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-400">Status:</span>
              <span
                className={
                  'px-2 py-0.5 rounded text-xs font-semibold ' +
                  (onboarding.state === 'production'
                    ? 'bg-green-700 text-green-100'
                    : onboarding.state === 'compliance'
                      ? 'bg-blue-700 text-blue-100'
                      : onboarding.state === 'csr_generated'
                        ? 'bg-yellow-700 text-yellow-100'
                        : 'bg-gray-600 text-gray-300')
                }
              >
                {onboarding.state.replace(/_/g, ' ')}
              </span>
            </div>

            {/* Step 1: Generate CSR */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-gray-400">Step 1: Generate CSR</h3>
              <button
                onClick={handleGenerateCsr}
                disabled={generatingCsr}
                className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-4 py-2 text-sm text-white"
              >
                {generatingCsr ? 'Generating...' : 'Generate CSR'}
              </button>
              {csrText && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">CSR PEM (copy this)</label>
                    <textarea
                      readOnly
                      className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-green-400 font-mono h-32 resize-y"
                      value={csrText}
                    />
                  </div>
                  {csrPublicKey && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Public Key</label>
                      <textarea
                        readOnly
                        className="w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-xs text-gray-400 font-mono h-20 resize-y"
                        value={csrPublicKey}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: Submit OTP */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-gray-400">
                Step 2: Submit OTP (Compliance)
              </h3>
              <div
                className={
                  'text-xs px-2 py-1 rounded ' +
                  (onboarding.complianceDone
                    ? 'bg-green-900/50 text-green-300'
                    : onboarding.keyGenerated
                      ? 'bg-yellow-900/50 text-yellow-300'
                      : 'bg-gray-700 text-gray-500')
                }
              >
                {onboarding.complianceDone
                  ? 'Compliance CSID obtained'
                  : onboarding.keyGenerated
                    ? 'Ready for OTP submission'
                    : 'Generate CSR first'}
              </div>
              {onboarding.keyGenerated && !onboarding.complianceDone && (
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">OTP Code</label>
                    <input
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
                      value={otpValue}
                      onChange={(e) => setOtpValue(e.target.value)}
                      placeholder="Enter OTP from ZATCA portal"
                    />
                  </div>
                  <button
                    onClick={handleSubmitOtp}
                    disabled={submittingOtp || !otpValue}
                    className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-4 py-2 text-sm text-white"
                  >
                    {submittingOtp ? 'Submitting...' : 'Submit OTP'}
                  </button>
                </div>
              )}
            </div>

            {/* Step 2.5: Compliance Check */}
            {onboarding.complianceDone && (
              <div className="border border-gray-700 rounded-lg p-3 space-y-3">
                <h3 className="text-xs font-semibold text-gray-400">Step 2.5: Compliance Check</h3>
                <div className="text-xs text-gray-500">
                  Submit invoices to ZATCA for compliance validation. ZATCA requires this before
                  issuing a production CSID.
                </div>

                {/* Part A: Type-based compliance checks (dynamic generation) */}
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-gray-500">
                    Quick Checks (auto-generated)
                  </h4>
                  {[
                    { type: 'invoice', label: 'Simplified Tax Invoice' },
                    { type: 'credit_note', label: 'Simplified Credit Note' },
                    { type: 'debit_note', label: 'Simplified Debit Note' },
                  ].map(({ type, label }) => {
                    const result = complianceTypeResults[type];
                    const checkedAt = complianceCheckedAt[type];
                    return (
                      <div
                        key={type}
                        className="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-white">{label}</span>
                          {result && (
                            <span
                              className={
                                'px-1.5 py-0.5 rounded text-xs ' +
                                (result.status === 200
                                  ? 'bg-green-700 text-green-100'
                                  : result.status === 202
                                    ? 'bg-yellow-700 text-yellow-100'
                                    : 'bg-red-700 text-red-100')
                              }
                            >
                              {result.status === 200
                                ? 'Passed'
                                : result.status === 202
                                  ? 'Warning'
                                  : `Failed (${result.status})`}
                            </span>
                          )}
                          {checkedAt && (
                            <span className="text-xs text-gray-500">
                              {new Date(checkedAt * 1000).toLocaleString()}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {result && result.warnings.length > 0 && (
                            <div
                              className="text-xs text-yellow-400 max-w-40 truncate"
                              title={result.warnings.join('\n')}
                            >
                              {result.warnings[0]}
                            </div>
                          )}
                          {result && result.errors.length > 0 && (
                            <div
                              className="text-xs text-red-400 max-w-40 truncate"
                              title={result.errors.join('\n')}
                            >
                              {result.errors[0]}
                            </div>
                          )}
                          <button
                            onClick={() =>
                              handleComplianceTypeCheck(type as ZATCAInvoiceDocumentType)
                            }
                            disabled={complianceTypeChecking === type}
                            className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-3 py-1.5 text-xs text-white"
                          >
                            {complianceTypeChecking === type ? 'Checking...' : 'Check'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Part B: Invoice-based compliance checks (real invoices from DB) */}
                {invoices.filter((inv) => inv.status === 'signed').length > 0 && (
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-gray-500">Existing Invoices</h4>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {invoices
                        .filter((inv) => inv.status === 'signed')
                        .map((inv) => {
                          const result = complianceResults[inv.id];
                          const checkedAt = complianceCheckedAt[`invoice_${inv.id}`];
                          return (
                            <div
                              key={inv.id}
                              className="flex items-center justify-between bg-gray-700/50 rounded px-3 py-2"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-white font-mono">#{inv.icv}</span>
                                {result && (
                                  <span
                                    className={
                                      'px-1.5 py-0.5 rounded text-xs ' +
                                      (result.status === 200
                                        ? 'bg-green-700 text-green-100'
                                        : result.status === 202
                                          ? 'bg-yellow-700 text-yellow-100'
                                          : 'bg-red-700 text-red-100')
                                    }
                                  >
                                    {result.status === 200
                                      ? 'Passed'
                                      : result.status === 202
                                        ? 'Warning'
                                        : `Failed (${result.status})`}
                                  </span>
                                )}
                                {checkedAt && (
                                  <span className="text-xs text-gray-500">
                                    {new Date(checkedAt * 1000).toLocaleString()}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {result && result.warnings.length > 0 && (
                                  <div className="text-xs text-yellow-400 max-w-32 truncate">
                                    {result.warnings[0]}
                                  </div>
                                )}
                                {result && result.errors.length > 0 && (
                                  <div className="text-xs text-red-400 max-w-32 truncate">
                                    {result.errors[0]}
                                  </div>
                                )}
                                <button
                                  onClick={() => handleComplianceCheck(inv.id)}
                                  disabled={complianceChecking === inv.id}
                                  className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-3 py-1.5 text-xs text-white"
                                >
                                  {complianceChecking === inv.id
                                    ? 'Checking...'
                                    : 'Check Compliance'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Go Production */}
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <h3 className="text-xs font-semibold text-gray-400">Step 3: Go Production</h3>
              <div
                className={
                  'text-xs px-2 py-1 rounded ' +
                  (onboarding.productionDone
                    ? 'bg-green-900/50 text-green-300'
                    : onboarding.complianceDone
                      ? 'bg-yellow-900/50 text-yellow-300'
                      : 'bg-gray-700 text-gray-500')
                }
              >
                {onboarding.productionDone
                  ? 'Production CSID active'
                  : onboarding.complianceDone
                    ? 'Ready for production promotion (run compliance checks first)'
                    : 'Complete compliance onboarding first'}
              </div>
              <button
                onClick={handleGoProduction}
                disabled={
                  promotingProduction || !onboarding.complianceDone || onboarding.productionDone
                }
                className="touch-target bg-brand-600 hover:bg-brand-700 disabled:opacity-50 rounded px-4 py-2 text-sm text-white"
              >
                {promotingProduction
                  ? 'Promoting...'
                  : onboarding.productionDone
                    ? 'Already in Production'
                    : 'Go Production'}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Invoices ── */}
      <section className="bg-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-300">Invoices</h2>
          <button
            onClick={() => handleRetryInvoice()}
            disabled={retryingAll}
            className="touch-target bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 rounded px-3 py-1.5 text-xs text-white"
          >
            {retryingAll ? 'Retrying...' : 'Retry All Pending'}
          </button>
        </div>
        {invoicesError && (
          <div className="text-red-400 text-xs bg-red-900/30 border border-red-700 rounded px-3 py-2">
            {invoicesError}
          </div>
        )}
        {invoicesLoading ? (
          <div className="text-gray-400 text-sm">Loading...</div>
        ) : invoices.length === 0 ? (
          <div className="text-gray-500 text-xs">No invoices yet</div>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between bg-gray-700/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-700"
                onClick={() => viewInvoiceDetail(inv.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white font-mono">#{inv.icv}</span>
                  {statusBadge(inv.status)}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{formatDate(inv.createdAt)}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRetryInvoice(inv.id);
                    }}
                    disabled={retryTargetId === inv.id}
                    className="touch-target text-xs text-yellow-400 hover:text-yellow-300 px-1 py-0.5"
                  >
                    {retryTargetId === inv.id ? '...' : 'Retry'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Invoice Detail Modal */}
        {(selectedInvoice || invoiceDetailLoading) && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-xl p-4 w-full max-w-2xl max-h-[80vh] overflow-y-auto space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">
                  Invoice #{selectedInvoice?.icv || '...'}
                </h3>
                <button
                  onClick={() => setSelectedInvoice(null)}
                  className="touch-target text-gray-400 hover:text-white text-lg leading-none px-2"
                >
                  &times;
                </button>
              </div>
              {invoiceDetailLoading ? (
                <div className="text-gray-400 text-sm">Loading...</div>
              ) : selectedInvoice ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Status: </span>
                      {statusBadge(selectedInvoice.status)}
                    </div>
                    <div>
                      <span className="text-gray-500">Order: </span>
                      <span className="text-gray-300">#{selectedInvoice.orderId}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">UUID: </span>
                      <span className="text-gray-300 font-mono">{selectedInvoice.uuid}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Hash: </span>
                      <span className="text-gray-300 font-mono text-[10px]">
                        {selectedInvoice.invoiceHash
                          ? selectedInvoice.invoiceHash.slice(0, 32) + '...'
                          : '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Created: </span>
                      <span className="text-gray-300">{formatDate(selectedInvoice.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Reported: </span>
                      <span className="text-gray-300">
                        {selectedInvoice.reportedAt
                          ? formatDate(selectedInvoice.reportedAt)
                          : 'Not yet'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">XML</label>
                    <pre className="bg-gray-900 border border-gray-600 rounded px-3 py-2 text-[10px] text-green-400 overflow-x-auto max-h-48">
                      {selectedInvoice.xml || 'No XML'}
                    </pre>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
