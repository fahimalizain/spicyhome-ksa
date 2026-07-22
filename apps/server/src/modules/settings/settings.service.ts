import { Injectable } from '@nestjs/common';
import { PrintersService } from '../printers/printers.service';

@Injectable()
export class SettingsService {
  constructor(private printersService: PrintersService) {}

  getAll(): Array<{ key: string; value: string }> {
    return this.printersService.getAllSettings();
  }

  get(key: string, defaultValue = ''): string {
    return this.printersService.getSetting(key, defaultValue);
  }

  set(key: string, value: string): void {
    this.printersService.setSetting(key, value);
  }
}
