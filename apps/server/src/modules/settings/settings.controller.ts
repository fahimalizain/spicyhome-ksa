import { Controller, Get, Put, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { SetSettingDto, SettingResponse } from './dto/settings.dto';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';

@ApiTags('settings')
@Controller('settings')
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all settings' })
  @ApiOkResponse({ description: 'Key-value settings', type: [SettingResponse] })
  getAll() {
    return this.settingsService.getAll();
  }

  @Put()
  @RequiresPermission('manage_settings')
  @ApiOperation({ summary: 'Set a setting value' })
  @ApiOkResponse({ description: 'Setting updated', type: SettingResponse })
  set(@Body() dto: SetSettingDto) {
    this.settingsService.set(dto.key, dto.value);
    return { key: dto.key, value: dto.value };
  }
}
