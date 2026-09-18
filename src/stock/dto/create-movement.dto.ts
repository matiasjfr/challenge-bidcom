import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, NotEquals } from 'class-validator';
import { MovementReason } from '../movement-reason.enum';

export class CreateMovementDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  sku!: string;

  /** Positive adds units, negative removes them. Zero is not a movement. */
  @IsInt()
  @NotEquals(0)
  quantity!: number;

  @IsEnum(MovementReason)
  reason!: MovementReason;
}
