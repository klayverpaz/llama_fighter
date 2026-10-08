/** Where the game is running, for the "install app" button. */
export type InstallPlatform =
  /** Already opened from the home-screen icon. */
  | 'installed'
  /** WhatsApp / Instagram / Facebook / Telegram / LINE in-app browser: can't install from here. */
  | 'inApp'
  | 'ios'
  | 'android'
  | 'desktop';

export function detectInstallPlatform(userAgent: string, standalone: boolean): InstallPlatform {
  if (standalone) return 'installed';
  if (/WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Telegram|Line\/|MicroMessenger|; wv\)/i.test(userAgent)) return 'inApp';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/** Step-by-step instructions (HTML) for installing on each platform. */
export function installSteps(platform: InstallPlatform, canPrompt: boolean): string {
  switch (platform) {
    case 'installed':
      return 'O jogo já está instalado: é o ícone <b>Kickboxing</b> na sua tela inicial.';
    case 'inApp':
      return 'Você abriu o link dentro de outro app (WhatsApp, Instagram…), e daqui não dá para instalar.<br>'
        + 'Toque nos <b>⋮</b> ou em <b>…</b> e escolha <b>Abrir no Chrome</b> (Android) ou <b>Abrir no Safari</b> (iPhone). '
        + 'Depois toque em <b>📲 Instalar app</b> de novo.';
    case 'ios':
      return '1. Abra este link no <b>Safari</b>.<br>'
        + '2. Toque em <b>Compartilhar</b> (o quadrado com a seta para cima ⬆️).<br>'
        + '3. Role e toque em <b>Adicionar à Tela de Início</b>, depois em <b>Adicionar</b>.<br>'
        + '4. Abra o jogo pelo ícone <b>Kickboxing</b> uma vez com internet. Depois funciona offline.';
    case 'android':
      return canPrompt
        ? 'Toque em <b>Instalar</b> na janela que abriu.'
        : '1. Abra este link no <b>Chrome</b>.<br>'
          + '2. Toque nos <b>⋮</b> (canto superior direito).<br>'
          + '3. Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.<br>'
          + '4. O ícone <b>Kickboxing</b> aparece na tela inicial e funciona offline.';
    default:
      return canPrompt
        ? 'Clique em <b>Instalar</b> na janela que abriu.'
        : 'No Chrome ou Edge, clique no ícone de instalar na barra de endereço (ou menu → Instalar Kickboxing).';
  }
}
