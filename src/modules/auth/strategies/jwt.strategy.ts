import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { AuthenticatedUser, JwtPayload } from '../../../core/types/auth.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'dev-secret-change-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        id: payload.sub,
        deleted_at: null,
        activo: true,
      },
      select: {
        id: true,
        correo: true,
        nombre: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Sesión inválida o usuario desactivado');
    }

    return usuario;
  }
}

