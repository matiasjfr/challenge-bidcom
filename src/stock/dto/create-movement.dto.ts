import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, NotEquals } from 'class-validator';
import { MovementReason } from '../movement-reason.enum';

/**
 * No real movement of a single variant is anywhere near this size, and it keeps
 * the numbers far away from the limit of an `int` column, which would otherwise
 * fail in the database instead of being rejected here.
 */
const MAX_UNITS_PER_MOVEMENT = 1_000_000;

export class CreateMovementDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  sku!: string;

  /** Positive adds units, negative removes them. Zero is not a movement. */
  @IsInt()
  @NotEquals(0)
  @Min(-MAX_UNITS_PER_MOVEMENT)
  @Max(MAX_UNITS_PER_MOVEMENT)
  quantity!: number;

  @IsEnum(MovementReason)
  reason!: MovementReason;
}
