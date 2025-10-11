import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '../../jwt/jwt.service';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('access_required');
    }

    const token = authHeader.slice('Bearer '.length);

    let userId: string | undefined;
    let role: string | undefined;

    try {
      const payload = await this.jwt.verifyAccess(token);
      if (payload?.sub) {
        userId = String(payload.sub);
        role = payload.role as string | undefined;
      }
    } catch (error) {
      throw new UnauthorizedException('invalid_access');
    }

    if (!userId) {
      throw new UnauthorizedException('invalid_access');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('admin_access_required');
    }

    request.user = { sub: user.id, role: user.role };
    return true;
  }
}

