import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/database/prisma.service.js';
import type { JwtPayload } from '../../core/types/auth.types.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.correo.trim().toLowerCase();
    const existing = await this.prisma.usuario.findFirst({
      where: { correo: email },
    });

    if (existing) {
      throw new ConflictException('El correo ya se encuentra registrado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const usuario = await this.prisma.usuario.create({
      data: {
        nombre: dto.nombre.trim(),
        correo: email,
        password_hash: passwordHash,
      },
      select: {
        id: true,
        nombre: true,
        correo: true,
      },
    });

    const accessToken = await this.signToken(usuario);
    return {
      accessToken,
      usuario,
      negocios: [],
    };
  }

  async login(dto: LoginDto) {
    const email = dto.correo.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findFirst({
      where: {
        correo: email,
        deleted_at: null,
        activo: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, usuario.password_hash);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const accessToken = await this.signToken({
      id: usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
    });

    const negocios = await this.getUserBusinesses(usuario.id);

    return {
      accessToken,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        correo: usuario.correo,
      },
      negocios,
    };
  }

  async getProfile(usuarioId: string) {
    const usuario = await this.prisma.usuario.findFirstOrThrow({
      where: { id: usuarioId, deleted_at: null },
      select: {
        id: true,
        nombre: true,
        correo: true,
        created_at: true,
      },
    });

    const negocios = await this.getUserBusinesses(usuarioId);
    return { usuario, negocios };
  }

  private async getUserBusinesses(usuarioId: string) {
    const memberships = await this.prisma.usuario_negocio.findMany({
      where: {
        usuario_id: usuarioId,
        activo: true,
        negocio: {
          deleted_at: null,
          activo: true,
        },
      },
      include: {
        negocio: {
          include: {
            configuracion_negocio: true,
          },
        },
        rol: {
          select: {
            id: true,
            nombre: true,
            nivel_jerarquia: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return memberships.map((m) => ({
      negocioId: m.negocio.id,
      nombre: m.negocio.nombre,
      ruc: m.negocio.ruc,
      rol: m.rol,
      configuracion: m.negocio.configuracion_negocio,
    }));
  }

  private signToken(usuario: { id: string; correo: string; nombre: string }): Promise<string> {
    const payload: JwtPayload = {
      sub: usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
    };
    return this.jwtService.signAsync(payload);
  }
}
