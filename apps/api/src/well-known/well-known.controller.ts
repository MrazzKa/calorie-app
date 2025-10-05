import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller('.well-known')
export class WellKnownController {
  constructor(private readonly cfg: ConfigService) {}

  @Get('apple-app-site-association')
  @Header('Content-Type', 'application/json')
  aasa() {
    // Современный формат с components
    const teamId = this.cfg.get<string>('IOS_TEAM_ID') ?? '';
    const bundleId = this.cfg.get<string>('IOS_BUNDLE_ID') ?? '';
    const appID = `${teamId}.${bundleId}`;

    return {
      applinks: {
        apps: [],
        details: [
          {
            appIDs: [appID],
            components: [
              { '/': '/auth/*' },
              { '/': '/open/*' },
              { '/': '/v1/auth/*' }, // запасной маршрут через API-домен
            ],
          },
        ],
      },
      webcredentials: {
        apps: [appID],
      },
      appclips: { apps: [] },
    };
  }

  @Get('assetlinks.json')
  @Header('Content-Type', 'application/json')
  assetlinks() {
    const pkg = this.cfg.get<string>('ANDROID_PACKAGE') ?? '';
    const fp = (this.cfg.get<string>('ANDROID_SHA256_FP') ?? '').split(/\s*,\s*/);

    return [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: pkg,
          sha256_cert_fingerprints: fp,
        },
      },
    ];
  }
}
