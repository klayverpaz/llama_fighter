import { describe, it, expect } from 'vitest';
import { detectInstallPlatform, installSteps } from './installHelp';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
  whatsappAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S911B Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 WhatsApp/2.24',
  instagramIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
};

describe('detectInstallPlatform', () => {
  it('tells the platforms apart', () => {
    expect(detectInstallPlatform(UA.androidChrome, false)).toBe('android');
    expect(detectInstallPlatform(UA.iphoneSafari, false)).toBe('ios');
    expect(detectInstallPlatform(UA.mac, false)).toBe('desktop');
  });

  it('spots in-app browsers (links opened from WhatsApp, Instagram…), where installing is impossible', () => {
    expect(detectInstallPlatform(UA.whatsappAndroid, false)).toBe('inApp');
    expect(detectInstallPlatform(UA.instagramIos, false)).toBe('inApp');
  });

  it('knows when it is already running as the installed app', () => {
    expect(detectInstallPlatform(UA.androidChrome, true)).toBe('installed');
  });
});

describe('installSteps', () => {
  it('iPhone: Share → Add to Home Screen; in-app: open in the real browser', () => {
    expect(installSteps('ios', false)).toContain('Adicionar à Tela de Início');
    expect(installSteps('inApp', false)).toContain('Abrir no Chrome');
    expect(installSteps('android', false)).toContain('Instalar app');
  });
});
