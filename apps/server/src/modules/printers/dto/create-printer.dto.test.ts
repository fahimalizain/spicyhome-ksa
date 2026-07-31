import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { CreatePrinterDto, UpdatePrinterDto } from './create-printer.dto';

async function validateUpdate(payload: Record<string, unknown>): Promise<ValidationError[]> {
  return validate(plainToInstance(UpdatePrinterDto, payload));
}

async function validateCreate(payload: Record<string, unknown>): Promise<ValidationError[]> {
  return validate(plainToInstance(CreatePrinterDto, payload));
}

function hasErrorOn(errors: ValidationError[], property: string, constraint: string): boolean {
  return errors.some((e) => e.property === property && e.constraints?.[constraint] !== undefined);
}

describe('UpdatePrinterDto validation', () => {
  it('accepts windows connection with empty string ip and a windowsPrinterName', async () => {
    // Regression: POS sends `ip: ''` when connectionType is "windows" on update.
    const errors = await validateUpdate({
      connectionType: 'windows',
      ip: '',
      windowsPrinterName: 'Kitchen',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts windows connection with ip omitted entirely (partial update)', async () => {
    const errors = await validateUpdate({
      connectionType: 'windows',
      windowsPrinterName: 'Kitchen',
    });
    expect(errors).toHaveLength(0);
  });

  it('accepts windows connection update with only a name (no ip, no windowsPrinterName)', async () => {
    const errors = await validateUpdate({ name: 'Renamed', connectionType: 'windows' });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty string ip for tcp connection', async () => {
    const errors = await validateUpdate({ connectionType: 'tcp', ip: '' });
    expect(hasErrorOn(errors, 'ip', 'minLength')).toBe(true);
  });

  it('accepts valid ip for tcp connection', async () => {
    const errors = await validateUpdate({ connectionType: 'tcp', ip: '192.168.1.100' });
    expect(errors).toHaveLength(0);
  });

  it('accepts ip when connectionType is omitted (defaults to tcp)', async () => {
    const errors = await validateUpdate({ ip: '1.2.3.4' });
    expect(errors).toHaveLength(0);
  });

  it('accepts a partial update with no ip and no connectionType', async () => {
    const errors = await validateUpdate({ name: 'Renamed' });
    expect(errors).toHaveLength(0);
  });

  it('still rejects empty string windowsPrinterName on windows connection', async () => {
    const errors = await validateUpdate({
      connectionType: 'windows',
      ip: '',
      windowsPrinterName: '',
    });
    expect(hasErrorOn(errors, 'windowsPrinterName', 'minLength')).toBe(true);
  });
});

describe('CreatePrinterDto validation (no regression)', () => {
  it('accepts windows connection with empty string ip and a windowsPrinterName', async () => {
    const errors = await validateCreate({
      name: 'Kitchen',
      connectionType: 'windows',
      ip: '',
      windowsPrinterName: 'Kitchen',
      role: 'kitchen',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty string ip for tcp connection', async () => {
    const errors = await validateCreate({
      name: 'Kitchen',
      connectionType: 'tcp',
      ip: '',
      role: 'kitchen',
    });
    expect(hasErrorOn(errors, 'ip', 'minLength')).toBe(true);
  });
});
