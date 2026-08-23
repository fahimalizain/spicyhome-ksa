import { ApiProperty } from '@nestjs/swagger';
import { ApiInt64, ApiInt32 } from '../../../common/api-property-helpers';

export class ItemWiseSalesRowDto {
  @ApiProperty({
    ...ApiInt64,
    example: 1,
    nullable: true,
    description:
      'Catalog item id; null when the catalog item was deleted and lines group by snapshot name',
  })
  itemId!: number | null;

  @ApiProperty({
    example: 'Zinger',
    description:
      'Current catalog items.name when the item still exists, else the order/refund line snapshot name',
  })
  itemName!: string;

  @ApiProperty({ ...ApiInt64, example: 1, nullable: true })
  categoryId!: number | null;

  @ApiProperty({
    example: 'Burgers',
    description: "'Uncategorized' when categoryId is null or the category is gone",
  })
  categoryName!: string;

  @ApiProperty({ ...ApiInt32, example: 3, description: 'Sum of invoice line qty in range' })
  qtySold!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 6900,
    description: 'Sum of invoice line total_halalas (VAT-inclusive) in range',
  })
  grossHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 1, description: 'Sum of refund line qty in range' })
  refundedQty!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 2300,
    description: 'Sum of refund line total_halalas in range',
  })
  refundedHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 2, description: 'qtySold − refundedQty' })
  netQty!: number;

  @ApiProperty({ ...ApiInt64, example: 4600, description: 'grossHalalas − refundedHalalas' })
  netHalalas!: number;

  @ApiProperty({
    ...ApiInt64,
    example: 600,
    description: 'Net VAT: sold line VAT minus refund line VAT (decomposed per line)',
  })
  vatHalalas!: number;
}

export class ItemWiseSalesFooterDto {
  @ApiProperty({ ...ApiInt32, example: 12 })
  qtySold!: number;

  @ApiProperty({ ...ApiInt64, example: 27600 })
  grossHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 2 })
  refundedQty!: number;

  @ApiProperty({ ...ApiInt64, example: 4600 })
  refundedHalalas!: number;

  @ApiProperty({ ...ApiInt32, example: 10 })
  netQty!: number;

  @ApiProperty({ ...ApiInt64, example: 23000 })
  netHalalas!: number;

  @ApiProperty({ ...ApiInt64, example: 3450 })
  vatHalalas!: number;
}

export class ItemWiseSalesResponseDto {
  @ApiProperty({ type: [ItemWiseSalesRowDto] })
  rows!: ItemWiseSalesRowDto[];

  @ApiProperty({ type: ItemWiseSalesFooterDto })
  footer!: ItemWiseSalesFooterDto;
}
