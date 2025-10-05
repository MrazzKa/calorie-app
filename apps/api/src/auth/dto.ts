import { IsEmail, IsString, Length } from 'class-validator';
export class RequestOtpDto { @IsEmail() email!: string; }
export class VerifyOtpDto {
  @IsEmail() email!: string;
  @IsString() @Length(6, 6) code!: string;
  @IsString() deviceId!: string;
}

export class RefreshDto {
  @IsString() @Length(20, 5000) refresh!: string; // JWT точно длиннее 20
  @IsString() @Length(16, 128) jti!: string;      // наш jti — 32 hex
}
export class LogoutDto {
  @IsString() @Length(16, 128) jti!: string;
}

export class RequestMagicDto { @IsEmail() email!: string; }
export class MagicExchangeDto {
  @IsString() @Length(16, 512) t!: string;      // одноразовый токен (mlt)
  @IsString() @Length(3, 64) deviceId!: string;
}